import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { GeneratedLyrics, Story } from '@resenha/contracts';
import { createDb, products } from '@resenha/database';
import { buildApp } from './app.js';
import type { Env } from './env.js';
import type { PaymentProvider } from './payment.js';
import { canonicalizeLyrics } from '@resenha/domain';
import type { LyricsProvider } from '@resenha/providers';
import { latestGeneratedNumber, settlePublicLyrics } from './lyrics-test-support.js';

const env: Env = {
  NODE_ENV: 'test',
  POLICY_VERSION: 'test-v1',
  API_PORT: 3001,
  DATABASE_URL:
    process.env.DATABASE_URL_TEST ?? 'postgresql://resenha:resenha@localhost:5433/resenha_test',
  WEB_URL: 'http://localhost:5175',
  COOKIE_SECRET: 'a-local-cookie-secret-with-more-than-32-chars',
  CUSTOMER_ACCESS_TOKEN_PEPPER: 'a-local-token-pepper-with-more-than-32-chars',
  ADMIN_EMAIL: 'admin@example.test',
  ADMIN_PASSWORD: 'a-simple-local-password',
  ADMIN_SESSION_TTL: 28_800,
  OPENROUTER_TEXT_MAX_TOKENS: 8192,
  OPENROUTER_MUSIC_MODEL: 'openrouter/test-music-model',
  GOOGLE_MUSIC_MODEL: 'lyria-3.5',
  LYRICS_PROVIDER: 'openrouter',
  MUSIC_PROVIDER: 'openrouter',
  PAYMENT_PROVIDER: 'abacatepay',
  EMAIL_PROVIDER: 'resend',
  AUDIO_REVIEW_MODE: 'automatic_release',
  LOCAL_STORAGE_PATH: './var/flow-test-storage',
};

const story: Story = {
  productType: 'custom_song',
  buyerName: 'Ana',
  buyerEmail: 'ana@example.test',
  subjectName: 'Bia',
  occasion: 'Aniversário de 40',
  genre: 'pagode',
  voice: 'female',
  mood: 'animado',
  facts: ['Bia faz a melhor feijoada da esquina', 'Bia dança na cozinha ouvindo radio antigo'],
  catchphrases: [],
  prohibitedTopics: [],
  termsAccepted: true,
  policyVersion: 'test-v1',
  marketingAccepted: false,
  intention: 'amizade',
  brief: 'Uma música para a Bia sobre a feijoada e a dança na cozinha',
  safetyConfirmed: true,
};

const lyricsWith = (fullLyrics: string): GeneratedLyrics => ({
  title: 'A música da Bia',
  summary: 'resumo',
  language: 'pt-BR',
  musicalDirection: {
    genre: 'pagode',
    mood: 'animado',
    tempo: 'medium',
    voice: 'female',
    instrumentation: ['violão'],
  },
  pronunciationNotes: [],
  sections: [
    { type: 'verse', label: 'Verso', lyrics: 'verso' },
    { type: 'chorus', label: 'Refrão', lyrics: 'refrão' },
    { type: 'outro', label: 'Final', lyrics: 'fim' },
  ],
  fullLyrics,
  safetyNotes: [],
});

let usageSeq = 0;
const testUsage = () => {
  usageSeq += 1;
  return {
    requestId: `test-request-${usageSeq}`,
    model: 'test-model',
    inputTokens: 100,
    outputTokens: 200,
    costUsd: '0.000123',
    costSource: 'reported' as const,
    latencyMs: 10,
  };
};
const compliantLyrics = (): LyricsProvider => ({
  generate: async (input) => ({
    lyrics: lyricsWith([input.subjectName, ...input.facts].join('\n')),
    usage: testUsage(),
  }),
});
const paraphrasingLyrics = (calls: { count: number }): LyricsProvider => ({
  generate: async () => {
    calls.count += 1;
    return {
      lyrics: lyricsWith('Uma letra bonita que ignora os fatos literais.'),
      usage: testUsage(),
    };
  },
});
const providerPrivateDetail = `provider-private-detail\n${'x'.repeat(600)}`;
const throwingLyrics = (): LyricsProvider => ({
  generate: async () => {
    // A definitive synthetic rejection is safe to retry; unknown outcomes have separate guards.
    throw Object.assign(new Error(providerPrivateDetail), { outcome: 'failed' });
  },
});
const { db, pool } = createDb(env.DATABASE_URL);
const apps: FastifyInstance[] = [];
const appWith = async (
  lyrics: LyricsProvider,
  settings: Partial<Env> = {},
  payment?: PaymentProvider,
) => {
  const app = await buildApp({ ...env, ...settings }, payment ? { lyrics, payment } : { lyrics });
  apps.push(app);
  return app;
};

const generateReady = async (
  app: FastifyInstance,
  session: { publicId: string; cookie: string },
  lyrics: LyricsProvider,
) => {
  const generated = await app.inject({
    method: 'POST',
    url: `/api/v1/orders/${session.publicId}/lyrics/generate`,
    headers: { cookie: session.cookie },
  });
  expect(generated.statusCode).toBe(202);
  expect(generated.json()).toEqual({ accepted: true, status: 'lyrics_generating' });
  await settlePublicLyrics(pool, session.publicId, lyrics, env.DATABASE_URL);
  return latestGeneratedNumber(pool, session.publicId);
};

beforeAll(async () => {
  await db.execute(sql`truncate table orders cascade`);
  await db
    .insert(products)
    .values({ type: 'custom_song', name: 'Produto de teste', priceCents: 4990, active: true })
    .onConflictDoUpdate({
      target: products.type,
      set: { priceCents: 4990, active: true, name: 'Produto de teste' },
    });
});
afterAll(async () => {
  for (const app of apps) await app.close();
  await pool.end();
});

type Session = { publicId: string; cookie: string };
const createOrderAndStory = async (app: FastifyInstance): Promise<Session> => {
  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    payload: { productType: 'custom_song', creationKey: randomUUID() },
  });
  const body = created.json() as { publicId: string };
  const cookie = String(created.headers['set-cookie']).split(';')[0] ?? '';
  const saved = await app.inject({
    method: 'PATCH',
    url: `/api/v1/orders/${body.publicId}/story`,
    payload: story,
    headers: { cookie },
  });
  expect(saved.statusCode).toBe(200);
  return { publicId: body.publicId, cookie };
};

describe('fluxo completo de pedido', () => {
  it('reutiliza um único pedido e evento para a mesma chave de criação', async () => {
    const lyrics = compliantLyrics();
    const app = await appWith(lyrics);
    const creationKey = randomUUID();
    const create = () =>
      app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        payload: { productType: 'custom_song', creationKey },
      });
    const [first, concurrent] = await Promise.all([create(), create()]);
    const retry = await create();
    expect([first.statusCode, concurrent.statusCode, retry.statusCode]).toEqual([201, 201, 201]);
    const publicIds = [first, concurrent, retry].map(
      (response) => (response.json() as { publicId: string }).publicId,
    );
    expect(new Set(publicIds).size).toBe(1);
    const publicId = publicIds[0] as string;
    const { rows: orderRows } = await pool.query(
      'select creation_key_hash from orders where public_id=$1',
      [publicId],
    );
    expect(orderRows).toHaveLength(1);
    expect(orderRows[0]?.creation_key_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(orderRows[0]?.creation_key_hash).not.toBe(creationKey);
    const { rows: eventRows } = await pool.query(
      "select event from analytics_events where order_public_id=$1 and event='order_created'",
      [publicId],
    );
    expect(eventRows).toHaveLength(1);
    const cookie = String(retry.headers['set-cookie']).split(';')[0] ?? '';
    const authorized = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${publicId}/story`,
      payload: story,
      headers: { cookie },
    });
    expect(authorized.statusCode).toBe(200);
  });

  it('história → letra → aprovação → checkout dev → fila de áudio', async () => {
    const lyrics = compliantLyrics();
    const app = await appWith(lyrics);
    const session = await createOrderAndStory(app);
    const versionNumber = await generateReady(app, session, lyrics);
    const approved = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/${versionNumber}/approve`,
      headers: { cookie: session.cookie },
    });
    expect(approved.statusCode).toBe(200);
    const checkout = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/checkout`,
      headers: { cookie: session.cookie },
    });
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json()).toEqual({
      checkoutUrl: `${env.WEB_URL}/pedido/${session.publicId}`,
      dev: true,
    });
    const checkoutAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/checkout`,
      headers: { cookie: session.cookie },
    });
    expect(checkoutAgain.json()).toEqual(checkout.json());
    const { rows: pendingRows } = await pool.query(
      'select count(*)::int as count from payments p join orders o on o.id=p.order_id where o.public_id=$1',
      [session.publicId],
    );
    expect(pendingRows[0]?.count).toBe(1);
    const unauthorized = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/dev-payment/approve`,
    });
    expect(unauthorized.statusCode).toBe(401);
    const { rows: unchangedRows } = await pool.query(
      `select o.status as order_status, p.status as payment_status,
              (select count(*)::int from generation_jobs j where j.order_id=o.id and j.type='generate_audio') as jobs
       from orders o join payments p on p.order_id=o.id where o.public_id=$1`,
      [session.publicId],
    );
    expect(unchangedRows[0]).toMatchObject({
      order_status: 'payment_pending',
      payment_status: 'pending',
      jobs: 0,
    });
    const paid = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/dev-payment/approve`,
      headers: { cookie: session.cookie },
    });
    expect(paid.statusCode).toBe(200);
    const paidAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/dev-payment/approve`,
      headers: { cookie: session.cookie },
    });
    expect(paidAgain.statusCode).toBe(200);
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${session.publicId}`,
      headers: { cookie: session.cookie },
    });
    expect((detail.json() as { order: { status: string } }).order.status).toBe('audio_queued');
    const { rows: jobRows } = await pool.query(
      `select count(*)::int as count,
              (array_agg(j.payload order by j.created_at desc))[1] as payload
       from generation_jobs j join orders o on o.id=j.order_id
       where o.public_id=$1 and j.type='generate_audio'`,
      [session.publicId],
    );
    expect(jobRows[0]?.count).toBe(1);
    expect(jobRows[0]?.payload).toEqual({
      provider: 'openrouter',
      model: 'openrouter/test-music-model',
      productionId: expect.any(String),
    });
    expect(JSON.stringify(jobRows[0]?.payload)).not.toContain('lyrics');
    expect(JSON.stringify(jobRows[0]?.payload)).not.toContain('secret');
    const paidCheckout = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/checkout`,
      headers: { cookie: session.cookie },
    });
    expect(paidCheckout.statusCode).toBe(409);
    expect(String(paidCheckout.json().error.message)).toContain('já foi pago');
  });

  it('snapshot de áudio Google no pagamento dev mantém somente provider e modelo', async () => {
    const lyrics = compliantLyrics();
    const app = await appWith(lyrics, {
      MUSIC_PROVIDER: 'google',
      GOOGLE_API_KEY: 'synthetic-google-key',
      GOOGLE_MUSIC_MODEL: 'lyria-3.5',
    });
    const session = await createOrderAndStory(app);
    const versionNumber = await generateReady(app, session, lyrics);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/orders/${session.publicId}/lyrics/${versionNumber}/approve`,
          headers: { cookie: session.cookie },
        })
      ).statusCode,
    ).toBe(200);
    await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/checkout`,
      headers: { cookie: session.cookie },
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/orders/${session.publicId}/dev-payment/approve`,
          headers: { cookie: session.cookie },
        })
      ).statusCode,
    ).toBe(200);
    const { rows } = await pool.query(
      `select j.payload from generation_jobs j
       join orders o on o.id=j.order_id where o.public_id=$1 and j.type='generate_audio'`,
      [session.publicId],
    );
    expect(rows).toEqual([
      { payload: { provider: 'google', model: 'lyria-3.5', productionId: expect.any(String) } },
    ]);
    expect(JSON.stringify(rows[0]?.payload)).not.toContain('synthetic-google-key');
    expect(JSON.stringify(rows[0]?.payload)).not.toContain('fullLyrics');
  });

  it('webhook AbacatePay confirma uma vez e enfileira o snapshot atual', async () => {
    const webhookSecret = 'synthetic-webhook-secret';
    const paymentId = `bill_${randomUUID()}`;
    let externalReference = '';
    const readPayment = async () => ({
      provider: 'abacatepay',
      environment: 'live' as const,
      id: paymentId,
      status: 'approved' as const,
      amountCents: 4990,
      currency: 'BRL' as const,
      externalReference,
    });
    const payment: PaymentProvider = {
      name: 'abacatepay',
      createCheckout: async (input) => {
        externalReference = input.externalReference;
        return {
          ...(await readPayment()),
          status: 'pending',
          checkoutUrl: 'https://example.test/checkout',
        };
      },
      getPayment: readPayment,
      findPayment: readPayment,
    };
    const lyrics = compliantLyrics();
    const app = await appWith(
      lyrics,
      {
        ABACATEPAY_API_KEY: 'synthetic-access-token',
        PAYMENT_ENVIRONMENT: 'live',
        ABACATEPAY_PRODUCT_ID: 'prod_test_123',
        ABACATEPAY_WEBHOOK_SECRET: webhookSecret,
        COMMERCIAL_READY: 'true',
        SUPPORT_EMAIL: 'support@example.test',
        DELIVERY_ESTIMATE: 'Prazo de teste',
        REVISION_POLICY: 'Ajustes de teste',
        REFUND_POLICY: 'Reembolso de teste',
        USAGE_LICENSE: 'Licença de teste',
        TERMS_URL: 'https://example.test/terms',
        PRIVACY_URL: 'https://example.test/privacy',
      },
      payment,
    );
    const session = await createOrderAndStory(app);
    const versionNumber = await generateReady(app, session, lyrics);
    await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/${versionNumber}/approve`,
      headers: { cookie: session.cookie },
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/orders/${session.publicId}/checkout`,
          headers: { cookie: session.cookie },
        })
      ).statusCode,
    ).toBe(200);
    const webhook = () =>
      app.inject({
        method: 'POST',
        url: `/api/v1/webhooks/abacatepay?webhookSecret=${webhookSecret}`,
        payload: {
          id: `event_${paymentId}`,
          apiVersion: 2,
          devMode: false,
          event: 'checkout.completed',
          data: { checkout: { id: paymentId } },
        },
      });
    const responses = await Promise.all([webhook(), webhook()]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 200]);
    expect(responses.some((response) => response.json().duplicate)).toBe(true);
    const { rows } = await pool.query(
      `select j.payload, count(*) over()::int as total from generation_jobs j
       join orders o on o.id=j.order_id where o.public_id=$1 and j.type='generate_audio'`,
      [session.publicId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      payload: { provider: 'openrouter', model: 'openrouter/test-music-model' },
      total: 1,
    });
  });

  it('aprovar com edição pendente salva e aprova o texto atual em vez de descartá-lo', async () => {
    const lyrics = compliantLyrics();
    const app = await appWith(lyrics);
    const session = await createOrderAndStory(app);
    const versionNumber = await generateReady(app, session, lyrics);
    const edited = canonicalizeLyrics(
      lyricsWith(['Versão editada no último segundo antes de aprovar', ...story.facts].join('\n')),
    );
    const approved = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/${versionNumber}/approve`,
      headers: { cookie: session.cookie },
      payload: { content: edited },
    });
    expect(approved.statusCode).toBe(200);
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${session.publicId}`,
      headers: { cookie: session.cookie },
    });
    const body = detail.json() as {
      order: { status: string };
      lyrics: {
        number: number;
        kind: string;
        approvedAt: string | null;
        content: { fullLyrics: string };
      }[];
    };
    expect(body.order.status).toBe('lyrics_approved');
    expect(body.lyrics).toHaveLength(2);
    const original = body.lyrics.find((lyric) => lyric.number === versionNumber);
    const approvedLyric = body.lyrics.find((lyric) => lyric.approvedAt);
    expect(original).toMatchObject({
      number: versionNumber,
      kind: 'generated',
      approvedAt: null,
    });
    expect(approvedLyric?.content.fullLyrics).toBe(edited.fullLyrics);
    expect(approvedLyric).toMatchObject({
      number: versionNumber + 1,
      kind: 'approved',
    });
    expect(body.lyrics.map((lyric) => lyric.number)).toEqual([versionNumber + 1, versionNumber]);
  });

  it('salvar e aprovar sem edição preservam todas as versões como histórico imutável', async () => {
    const lyrics = compliantLyrics();
    const app = await appWith(lyrics);
    const session = await createOrderAndStory(app);
    const generatedNumber = await generateReady(app, session, lyrics);
    const savedContent = canonicalizeLyrics(
      lyricsWith(['Versão salva antes da aprovação', ...story.facts].join('\n')),
    );
    const saved = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${session.publicId}/lyrics/${generatedNumber}`,
      headers: { cookie: session.cookie },
      payload: savedContent,
    });
    expect(saved.json()).toEqual({ number: generatedNumber + 1, kind: 'edited' });
    const approved = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/${generatedNumber + 1}/approve`,
      headers: { cookie: session.cookie },
    });
    expect(approved.statusCode).toBe(200);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${session.publicId}`,
      headers: { cookie: session.cookie },
    });
    const versions = (
      detail.json() as {
        lyrics: {
          number: number;
          kind: string;
          approvedAt: string | null;
          content: GeneratedLyrics;
        }[];
      }
    ).lyrics;
    expect(versions.map(({ number, kind, approvedAt }) => ({ number, kind, approvedAt }))).toEqual([
      { number: generatedNumber + 2, kind: 'approved', approvedAt: expect.any(String) },
      { number: generatedNumber + 1, kind: 'edited', approvedAt: null },
      { number: generatedNumber, kind: 'generated', approvedAt: null },
    ]);
    expect(versions[0]?.content).toEqual(savedContent);
    expect(versions[1]?.content).toEqual(savedContent);
    expect(versions[2]?.content.fullLyrics).toContain(story.subjectName);
  });

  it('link de entrega válido vira sessão de leitura: recovery sem cadastro', async () => {
    const lyrics = compliantLyrics();
    const app = await appWith(lyrics);
    const session = await createOrderAndStory(app);
    const versionNumber = await generateReady(app, session, lyrics);
    await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/${versionNumber}/approve`,
      headers: { cookie: session.cookie },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/checkout`,
      headers: { cookie: session.cookie },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/dev-payment/approve`,
      headers: { cookie: session.cookie },
    });
    // Fixture: worker terminou os áudios sob revisão manual (par 1+2 com asset).
    const { rows: orderRows } = await pool.query('select id from orders where public_id=$1', [
      session.publicId,
    ]);
    const orderId = orderRows[0]?.id as string;
    await pool.query("update orders set status='review_required' where id=$1", [orderId]);
    const { rows: audioRows } = await pool.query(
      `with files as (
         insert into stored_files(order_id,storage_key,mime_type,size_bytes)
         values ($1,'${session.publicId}-v1.mp3','audio/mpeg',10),($1,'${session.publicId}-v2.mp3','audio/mpeg',10)
         returning id
       )
       insert into audio_generations(order_id,production_id,variant,status,provider,file_id,selected,duration_ms)
       select $1, (select current_production_id from orders where id=$1), row_number() over (), 'completed', 'test', id, true, 12000 from files
       returning id`,
      [orderId],
    );
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/session',
      payload: { email: 'admin@example.test', password: 'a-simple-local-password' },
    });
    const adminCookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
    const delivered = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${orderId}/audio/${audioRows[0]?.id as string}/approve`,
      headers: { cookie: adminCookie },
    });
    expect(delivered.statusCode).toBe(200);
    const { rows: jobRows } = await pool.query(
      "select count(*)::int as count from generation_jobs where order_id=$1 and type='deliver_notify' and status='pending' and idempotency_key like 'notification:%'",
      [orderId],
    );
    expect(jobRows[0]?.count).toBe(1);
    const deliveryToken = (delivered.json() as { deliveryToken: string }).deliveryToken;
    const delivery = await app.inject({
      method: 'GET',
      url: `/api/v1/deliveries/${deliveryToken}`,
    });
    expect(delivery.statusCode).toBe(200);
    const deliveryBody = delivery.json() as {
      publicOrderId: string;
      lyrics: Array<{ number: number; kind: string; content: Record<string, unknown> }>;
      audio: Array<{ variant: number }>;
    };
    expect(Object.keys(deliveryBody).sort()).toEqual(['audio', 'lyrics', 'publicOrderId']);
    expect(deliveryBody.publicOrderId).toBe(session.publicId);
    expect(deliveryBody.lyrics).toHaveLength(1);
    expect(Object.keys(deliveryBody.lyrics[0] ?? {}).sort()).toEqual(['content', 'kind', 'number']);
    expect(Object.keys(deliveryBody.lyrics[0]?.content ?? {}).sort()).toEqual(
      [
        'fullLyrics',
        'language',
        'musicalDirection',
        'pronunciationNotes',
        'safetyNotes',
        'sections',
        'summary',
        'title',
      ].sort(),
    );
    expect(deliveryBody.audio).toHaveLength(2);
    for (const track of deliveryBody.audio) expect(Object.keys(track)).toEqual(['variant']);
    // Sem cookie (aparelho novo): o token do e-mail recupera o acesso.
    const recovered = await app.inject({
      method: 'POST',
      url: `/api/v1/deliveries/${deliveryToken}/access`,
    });
    expect(recovered.statusCode).toBe(200);
    expect(recovered.json()).toEqual({ publicId: session.publicId });
    const recoveredCookie = String(recovered.headers['set-cookie']).split(';')[0] ?? '';
    expect(recoveredCookie).toMatch(/^order_view_/);
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${session.publicId}`,
      headers: { cookie: recoveredCookie },
    });
    expect(detail.statusCode).toBe(200);
    const detailBody = detail.json() as { story?: unknown; privateAccess: boolean };
    expect(detailBody.story).toBeUndefined();
    expect(detailBody.privateAccess).toBe(false);
    const blocked = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${session.publicId}/story`,
      headers: { cookie: recoveredCookie },
      payload: story,
    });
    expect(blocked.statusCode).toBe(401);
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/deliveries/token-invalido-12345678901234567890/access',
    });
    expect(invalid.statusCode).toBe(404);
  });

  it('approve administrativo recusa entrega parcial: só o par 1+2 fecha a venda', async () => {
    const lyrics = compliantLyrics();
    const app = await appWith(lyrics);
    const session = await createOrderAndStory(app);
    const versionNumber = await generateReady(app, session, lyrics);
    await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/${versionNumber}/approve`,
      headers: { cookie: session.cookie },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/checkout`,
      headers: { cookie: session.cookie },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/dev-payment/approve`,
      headers: { cookie: session.cookie },
    });
    const { rows: orderRows } = await pool.query('select id from orders where public_id=$1', [
      session.publicId,
    ]);
    const orderId = orderRows[0]?.id as string;
    await pool.query("update orders set status='review_required' where id=$1", [orderId]);
    const { rows: fileRows } = await pool.query(
      `insert into stored_files(order_id,storage_key,mime_type,size_bytes)
       values ($1,'${session.publicId}-solo.mp3','audio/mpeg',10) returning id`,
      [orderId],
    );
    const { rows: audioRows } = await pool.query(
      "insert into audio_generations(order_id,production_id,variant,status,provider,file_id,selected,duration_ms) values($1,(select current_production_id from orders where id=$1),1,'completed','test',$2,true,12000) returning id",
      [orderId, fileRows[0]?.id],
    );
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/session',
      payload: { email: 'admin@example.test', password: 'a-simple-local-password' },
    });
    const adminCookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
    const refused = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${orderId}/audio/${audioRows[0]?.id as string}/approve`,
      headers: { cookie: adminCookie },
    });
    expect(refused.statusCode).toBe(409);
    const { rows: statusRows } = await pool.query('select status from orders where id=$1', [
      orderId,
    ]);
    expect(statusRows[0]?.status).toBe('review_required');
  });

  it('falha definitiva de geração deixa o pedido recuperável: novo clique gera com sucesso', async () => {
    const failing = throwingLyrics();
    const failingApp = await appWith(failing);
    const session = await createOrderAndStory(failingApp);
    const queued = await failingApp.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/generate`,
      headers: { cookie: session.cookie },
    });
    expect(queued.statusCode).toBe(202);
    await settlePublicLyrics(pool, session.publicId, failing, env.DATABASE_URL);
    const { rows: usageRows } = await pool.query(
      `select ai_usage.error from ai_usage
       join orders on orders.id=ai_usage.order_id
       where orders.public_id=$1 and ai_usage.status='error'`,
      [session.publicId],
    );
    expect(usageRows[0]?.error).not.toContain('\n');
    expect(String(usageRows[0]?.error)).toBe('Falha interna da operação.');
    expect(String(usageRows[0]?.error)).not.toContain('provider-private-detail');
    expect(String(usageRows[0]?.error).length).toBeLessThan(providerPrivateDetail.length);
    const retryLyrics = compliantLyrics();
    const retryApp = await appWith(retryLyrics);
    const retry = await retryApp.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/generate`,
      headers: { cookie: session.cookie },
    });
    expect(retry.statusCode).toBe(202);
    await settlePublicLyrics(pool, session.publicId, retryLyrics, env.DATABASE_URL);
    const current = await retryApp.inject({
      method: 'GET',
      url: `/api/v1/orders/${session.publicId}`,
      headers: { cookie: session.cookie },
    });
    expect((current.json() as { order: { status: string } }).order.status).toBe('lyrics_ready');
  });

  it('duas gerações concorrentes criam um único job e uma chamada ao provedor', async () => {
    const calls = { count: 0 };
    const provider: LyricsProvider = {
      generate: async (input) => {
        calls.count += 1;
        return {
          lyrics: lyricsWith([input.subjectName, ...input.facts].join('\n')),
          usage: testUsage(),
        };
      },
    };
    const app = await appWith(provider);
    const session = await createOrderAndStory(app);
    const [first, concurrent] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/orders/${session.publicId}/lyrics/generate`,
        headers: { cookie: session.cookie },
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/orders/${session.publicId}/lyrics/generate`,
        headers: { cookie: session.cookie },
      }),
    ]);
    expect([first.statusCode, concurrent.statusCode].sort()).toEqual([202, 202]);
    const { rows } = await pool.query(
      `select count(*)::int as count from generation_jobs j
       join orders o on o.id=j.order_id
       where o.public_id=$1 and j.type='generate_lyrics'`,
      [session.publicId],
    );
    expect(rows[0]?.count).toBe(1);
    expect(calls.count).toBe(0);
    await settlePublicLyrics(pool, session.publicId, provider, env.DATABASE_URL);
    expect(calls.count).toBe(1);
  });

  it('letra que parafraseia fatos tenta 3x com feedback e falha de forma recuperável', async () => {
    const calls = { count: 0 };
    const paraphrasing = paraphrasingLyrics(calls);
    const app = await appWith(paraphrasing);
    const session = await createOrderAndStory(app);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/generate`,
      headers: { cookie: session.cookie },
    });
    expect(response.statusCode).toBe(202);
    await settlePublicLyrics(pool, session.publicId, paraphrasing, env.DATABASE_URL);
    expect(calls.count).toBe(3);
    const { rows } = await pool.query('select status from orders where public_id=$1', [
      session.publicId,
    ]);
    expect(rows[0]?.status).toBe('failed');
    const retryLyrics = compliantLyrics();
    const retry = await (
      await appWith(retryLyrics)
    ).inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/generate`,
      headers: { cookie: session.cookie },
    });
    expect(retry.statusCode).toBe(202);
    await settlePublicLyrics(pool, session.publicId, retryLyrics, env.DATABASE_URL);
  });

  it('draft orienta; lyrics_generating órfão enfileira sem CAS de cinco minutos', async () => {
    const lyrics = compliantLyrics();
    const app = await appWith(lyrics);
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: { productType: 'custom_song', creationKey: randomUUID() },
    });
    const publicId = (created.json() as { publicId: string }).publicId;
    const freshCookie = String(created.headers['set-cookie']).split(';')[0] ?? '';
    const blocked = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${publicId}/lyrics/generate`,
      headers: { cookie: freshCookie },
    });
    expect(blocked.statusCode).toBe(400);
    expect(String(blocked.json().error.message)).toContain('Preencha o formulário');

    const session = await createOrderAndStory(app);
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/generate`,
      headers: { cookie: session.cookie },
    });
    expect(first.statusCode).toBe(202);
    const replay = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/generate`,
      headers: { cookie: session.cookie },
    });
    expect(replay.statusCode).toBe(202);
    await pool.query(
      `update orders set updated_at=now() - interval '6 minutes' where public_id=$1`,
      [session.publicId],
    );
    const stillBusy = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/generate`,
      headers: { cookie: session.cookie },
    });
    expect(stillBusy.statusCode).toBe(202);
    const { rows: jobRows } = await pool.query(
      `select count(*)::int as count from generation_jobs j
       join orders o on o.id=j.order_id where o.public_id=$1 and j.type='generate_lyrics'`,
      [session.publicId],
    );
    expect(jobRows[0]?.count).toBe(1);
    await settlePublicLyrics(pool, session.publicId, lyrics, env.DATABASE_URL);
    expect(
      (
        await pool.query(
          `select count(*)::int as count from lyric_versions
           join orders on orders.id=lyric_versions.order_id
           where orders.public_id=$1`,
          [session.publicId],
        )
      ).rows[0]?.count,
    ).toBe(1);
  });

  it('checkout exige letra aprovada', async () => {
    const lyrics = compliantLyrics();
    const app = await appWith(lyrics);
    const session = await createOrderAndStory(app);
    const early = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/checkout`,
      headers: { cookie: session.cookie },
    });
    expect(early.statusCode).toBe(409);
    expect(String(early.json().error.message)).toContain('Aprove a letra');
  });

  it('acesso privado não vaza sem cookie', async () => {
    const lyrics = compliantLyrics();
    const app = await appWith(lyrics);
    const session = await createOrderAndStory(app);
    const peek = await app.inject({ method: 'GET', url: `/api/v1/orders/${session.publicId}` });
    expect(peek.statusCode).toBe(401);
    const forgedFull = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${session.publicId}/story`,
      payload: story,
      headers: { cookie: `order_${session.publicId}=1` },
    });
    expect(forgedFull.statusCode).toBe(401);
    const forgedView = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${session.publicId}`,
      headers: { cookie: `order_view_${session.publicId}=1` },
    });
    expect(forgedView.statusCode).toBe(401);
    expect(session.cookie).not.toBe(`order_${session.publicId}=1`);
  });

  it('respostas públicas não expõem ids internos, hashes ou tokens', async () => {
    const lyrics = compliantLyrics();
    const app = await appWith(lyrics);
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: { productType: 'custom_song', creationKey: randomUUID() },
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json() as Record<string, unknown>;
    expect(Object.keys(createdBody)).toEqual(['publicId']);
    const catalog = await app.inject({ method: 'GET', url: '/api/v1/products' });
    expect(catalog.statusCode).toBe(200);
    for (const product of catalog.json() as Record<string, unknown>[])
      expect(Object.keys(product).sort()).toEqual(['active', 'name', 'priceCents', 'type']);
    const session = await createOrderAndStory(app);
    await generateReady(app, session, lyrics);
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${session.publicId}`,
      headers: { cookie: session.cookie },
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json() as {
      order: Record<string, unknown>;
      lyrics: Record<string, unknown>[];
      audio: Record<string, unknown>[];
    };
    expect(Object.keys(body.order).sort()).toEqual(
      ['createdAt', 'priceCents', 'productType', 'publicId', 'status'].sort(),
    );
    for (const lyric of body.lyrics)
      expect(Object.keys(lyric).sort()).toEqual(['approvedAt', 'content', 'kind', 'number'].sort());
    for (const track of body.audio)
      expect(Object.keys(track).sort()).toEqual(['status', 'variant'].sort());
  });

  it('aprovar versão inexistente responde 404 sem transitar o pedido', async () => {
    const lyrics = compliantLyrics();
    const app = await appWith(lyrics);
    const session = await createOrderAndStory(app);
    await generateReady(app, session, lyrics);
    const missing = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/999/approve`,
      headers: { cookie: session.cookie },
    });
    expect(missing.statusCode).toBe(404);
    const { rows } = await pool.query('select status from orders where public_id=$1', [
      session.publicId,
    ]);
    expect(rows[0]?.status).toBe('lyrics_ready');
  });
  it('mutações sem cookie de acesso respondem 401', async () => {
    const lyrics = compliantLyrics();
    const app = await appWith(lyrics);
    const session = await createOrderAndStory(app);
    const story = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${session.publicId}/story`,
      payload: {},
    });
    expect(story.statusCode).toBe(401);
    const generate = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/generate`,
    });
    expect(generate.statusCode).toBe(401);
    const checkout = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/checkout`,
    });
    expect(checkout.statusCode).toBe(401);
  });
  it('custo de IA é persistido por tentativa e agregado no admin', async () => {
    const lyrics = compliantLyrics();
    const app = await appWith(lyrics);
    const session = await createOrderAndStory(app);
    await generateReady(app, session, lyrics);
    const { rows } = await pool.query(
      'select ai_usage.kind as kind, ai_usage.status as status, model, input_tokens, output_tokens, cost_usd, latency_ms, external_id, attempt from ai_usage join orders on orders.id = ai_usage.order_id where orders.public_id = $1 order by ai_usage.created_at',
      [session.publicId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      kind: 'lyrics',
      status: 'ok',
      model: 'test-model',
      input_tokens: 100,
      output_tokens: 200,
      attempt: 1,
    });
    expect(Number(rows[0]?.cost_usd)).toBeCloseTo(0.000123, 6);
    expect(rows[0]?.external_id).toMatch(/^test-request-/);

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/session',
      payload: { email: 'admin@example.test', password: 'a-simple-local-password' },
    });
    const cookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
    const summaryNoAuth = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/ai-usage/summary',
    });
    expect(summaryNoAuth.statusCode).toBe(401);
    const summary = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/ai-usage/summary',
      headers: { cookie },
    });
    expect(summary.statusCode).toBe(200);
    const body = summary.json() as {
      month: { totalUsd: string; lyricsUsd: string; calls: number };
      byDay: { day: string; totalUsd: string; calls: number }[];
    };
    expect(body.month.calls).toBeGreaterThanOrEqual(1);
    expect(Number(body.month.totalUsd)).toBeGreaterThan(0);
    expect(Number(body.month.lyricsUsd)).toBeGreaterThan(0);
    expect(Array.isArray(body.byDay)).toBe(true);
  });

  it('funil registra etapas server-side e agrega no admin', async () => {
    const lyrics = compliantLyrics();
    const app = await appWith(lyrics);
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: { productType: 'custom_song', creationKey: randomUUID() },
    });
    expect(created.statusCode).toBe(201);
    const session = await createOrderAndStory(app);
    const versionNumber = await generateReady(app, session, lyrics);
    await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/${versionNumber}/approve`,
      headers: { cookie: session.cookie },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/checkout`,
      headers: { cookie: session.cookie },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/dev-payment/approve`,
      headers: { cookie: session.cookie },
    });
    const { rows } = await pool.query(
      'select event from analytics_events where order_public_id=$1 order by created_at',
      [session.publicId],
    );
    expect(rows.map((row) => row.event)).toEqual([
      'order_created',
      'story_saved',
      'lyrics_generated',
      'lyrics_approved',
      'checkout_started',
      'paid',
    ]);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/session',
      payload: { email: 'admin@example.test', password: 'a-simple-local-password' },
    });
    const cookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
    const noAuth = await app.inject({ method: 'GET', url: '/api/v1/admin/analytics/funnel' });
    expect(noAuth.statusCode).toBe(401);
    const funnel = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/funnel?days=abc',
      headers: { cookie },
    });
    expect(funnel.statusCode).toBe(200);
    const body = funnel.json() as {
      days: number;
      steps: { event: string; orders: number; rateFromPrevious: number | null }[];
      perSaleUsd: string;
      salesWithCost: number;
    };
    expect(body.days).toBe(30);
    expect(body.steps[0]).toMatchObject({ event: 'order_created' });
    expect(body.steps.find((step) => step.event === 'paid')?.orders).toBeGreaterThanOrEqual(1);
  });

  it('beacon público valida whitelist e uuid, sem PII', async () => {
    const lyrics = compliantLyrics();
    const app = await appWith(lyrics);
    const badEvent = await app.inject({
      method: 'POST',
      url: '/api/v1/analytics/beacon',
      payload: { event: 'story_leak', visitorId: '09b7d5a0-9a1c-4b2e-9c3f-2b7c1e5a6d01' },
    });
    expect(badEvent.statusCode).toBe(400);
    const badVisitor = await app.inject({
      method: 'POST',
      url: '/api/v1/analytics/beacon',
      payload: { event: 'landing_view', visitorId: 'not-a-uuid' },
    });
    expect(badVisitor.statusCode).toBe(400);
    const visitorId = '09b7d5a0-9a1c-4b2e-9c3f-2b7c1e5a6d01';
    for (const event of ['landing_view', 'form_started', 'form_completed']) {
      const ok = await app.inject({
        method: 'POST',
        url: '/api/v1/analytics/beacon',
        payload: { event, visitorId },
      });
      expect(ok.statusCode).toBe(200);
    }
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/session',
      payload: { email: 'admin@example.test', password: 'a-simple-local-password' },
    });
    const cookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
    const funnel = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/funnel',
      headers: { cookie },
    });
    const body = funnel.json() as {
      preOrder: { event: string; visitors: number }[];
    };
    expect(
      body.preOrder.find((step) => step.event === 'landing_view')?.visitors,
    ).toBeGreaterThanOrEqual(1);
    let limited = 0;
    for (let i = 0; i < 61; i += 1) {
      const probe = await app.inject({
        method: 'POST',
        url: '/api/v1/analytics/beacon',
        payload: { event: 'landing_view', visitorId },
      });
      if (probe.statusCode === 429) limited += 1;
    }
    expect(limited).toBeGreaterThanOrEqual(1);
  });

  it('admin revisa a letra aprovada e reinclui o pedido na produção', async () => {
    const lyrics = compliantLyrics();
    const app = await appWith(lyrics);
    const session = await createOrderAndStory(app);
    const versionNumber = await generateReady(app, session, lyrics);
    await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/${versionNumber}/approve`,
      headers: { cookie: session.cookie },
    });
    const { rows: orderRows } = await pool.query('select id from orders where public_id=$1', [
      session.publicId,
    ]);
    const orderId = orderRows[0]?.id as string;
    expect(orderId).toBeTruthy();
    await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/checkout`,
      headers: { cookie: session.cookie },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/dev-payment/approve`,
      headers: { cookie: session.cookie },
    });

    await pool.query("update generation_jobs set status='failed' where order_id=$1", [orderId]);
    await pool.query("update orders set status='failed' where id=$1", [orderId]);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/session',
      payload: { email: 'admin@example.test', password: 'a-simple-local-password' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = String(login.headers['set-cookie']).split(';')[0] ?? '';

    const edited = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/orders/${orderId}/lyrics`,
      headers: { cookie },
      payload: lyricsWith([story.subjectName, ...story.facts].join('\n')),
    });
    expect(edited.statusCode).toBe(200);

    const rebuildNoAuth = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${orderId}/audio/rebuild`,
    });
    expect(rebuildNoAuth.statusCode).toBe(401);
    const rebuilt = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${orderId}/audio/rebuild`,
      headers: { cookie },
    });
    expect(rebuilt.statusCode).toBe(200);
    const statusRows = await pool.query('select status from orders where id=$1', [orderId]);
    expect(statusRows.rows[0]?.status).toBe('audio_queued');
  });

  it('lista admin filtra por busca, status e período; status inválido é 400', async () => {
    const lyrics = compliantLyrics();
    const app = await appWith(lyrics);
    const first = await createOrderAndStory(app);
    const second = await createOrderAndStory(app);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/session',
      payload: { email: 'admin@example.test', password: 'a-simple-local-password' },
    });
    const cookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
    const list = async (query: string) =>
      app.inject({ method: 'GET', url: `/api/v1/admin/orders${query}`, headers: { cookie } });
    const byId = await list(`?q=${second.publicId}`);
    expect(byId.statusCode).toBe(200);
    const byIdBody = byId.json() as { items: { publicId: string }[] };
    expect(byIdBody.items.map((item) => item.publicId)).toEqual([second.publicId]);
    const byStatus = await list('?status=story_completed');
    expect(byStatus.statusCode).toBe(200);
    const statusIds = (byStatus.json() as { items: { publicId: string }[] }).items.map(
      (item) => item.publicId,
    );
    expect(statusIds).toContain(first.publicId);
    expect(statusIds).toContain(second.publicId);
    const future = await list('?from=2099-01-01');
    expect((future.json() as { items: unknown[] }).items).toEqual([]);
    // Borda GMT-3: 02:00Z de 04/09 = 23:00 de 03/09 em São Paulo.
    await pool.query("update orders set created_at='2026-09-04T02:00:00.000Z' where public_id=$1", [
      second.publicId,
    ]);
    const idsOf = async (query: string) =>
      ((await list(query)).json() as { items: { publicId: string }[] }).items.map(
        (item) => item.publicId,
      );
    expect(await idsOf('?from=2026-09-03&to=2026-09-03')).toContain(second.publicId);
    expect(await idsOf('?from=2026-09-04')).not.toContain(second.publicId);
    expect(await idsOf('?to=2026-09-02')).not.toContain(second.publicId);
  });

  it('cockpit admin usa agregados do servidor e paginação com total', async () => {
    const lyrics = compliantLyrics();
    const app = await appWith(lyrics);
    const first = await createOrderAndStory(app);
    await createOrderAndStory(app);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/session',
      payload: { email: 'admin@example.test', password: 'a-simple-local-password' },
    });
    const cookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
    const noAuth = await app.inject({ method: 'GET', url: '/api/v1/admin/overview' });
    expect(noAuth.statusCode).toBe(401);

    const overview = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
      headers: { cookie },
    });
    expect(overview.statusCode).toBe(200);
    const summary = overview.json() as {
      totals: { orders: number; paid: number; revenueCents: number };
      attention: { failed: number; reviewRequired: number; audioQueued: number };
    };
    expect(summary.totals.orders).toBeGreaterThanOrEqual(2);
    const paidRows = await pool.query(
      `select count(distinct order_id)::int as count, coalesce(sum(amount_cents), 0)::int as cents
       from payments where status = 'approved' and environment = 'live'`,
    );
    expect(summary.totals.paid).toBe(paidRows.rows[0]?.count ?? 0);
    expect(summary.totals.revenueCents).toBe(paidRows.rows[0]?.cents ?? 0);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/orders?page=1',
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    const page = list.json() as { items: unknown[]; page: number; total: number; pageSize: number };
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(30);
    expect(page.total).toBeGreaterThanOrEqual(2);
    expect(page.items.length).toBeLessThanOrEqual(page.pageSize);
    expect(
      (page.items as { subjectName?: string | null }[]).some((item) => Boolean(item.subjectName)),
    ).toBe(true);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${first.publicId}`,
      headers: { cookie: first.cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      payment: { configured: false, devFallback: true },
    });
  });
});
