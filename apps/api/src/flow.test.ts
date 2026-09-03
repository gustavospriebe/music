import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { GeneratedLyrics, Story } from '@resenha/contracts';
import { createDb, products } from '@resenha/database';
import { buildApp } from './app.js';
import type { Env } from './env.js';
import type { LyricsProvider } from './providers.js';

const env: Env = {
  NODE_ENV: 'test',
  API_PORT: 3001,
  DATABASE_URL:
    process.env.DATABASE_URL_TEST ?? 'postgresql://resenha:resenha@localhost:5433/resenha_test',
  WEB_URL: 'http://localhost:5175',
  COOKIE_SECRET: 'a-local-cookie-secret-with-more-than-32-chars',
  CUSTOMER_ACCESS_TOKEN_PEPPER: 'a-local-token-pepper-with-more-than-32-chars',
  ADMIN_EMAIL: 'admin@example.test',
  ADMIN_PASSWORD: 'a-simple-local-password',
  ADMIN_SESSION_TTL: 28_800,
  LYRICS_PROVIDER: 'openrouter',
  MUSIC_PROVIDER: 'openrouter',
  PAYMENT_PROVIDER: 'mercadopago',
  EMAIL_PROVIDER: 'resend',
  AUDIO_REVIEW_MODE: 'automatic',
  LOCAL_STORAGE_PATH: './var/flow-test-storage',
};

const story: Story = {
  productType: 'friend_roast',
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
  marketingAccepted: false,
  relationship: 'Amiga de infancia',
  traits: ['Cozinheira'],
  biggestStory: 'Bia faz a melhor feijoada da esquina',
  roastLevel: 'light',
  safetyConfirmed: true,
  insideJokes: [],
  mentions: [],
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

const compliantLyrics = (): LyricsProvider => ({
  generate: async (input) => lyricsWith([input.subjectName, ...input.facts].join('\n')),
});
const paraphrasingLyrics = (calls: { count: number }): LyricsProvider => ({
  generate: async () => {
    calls.count += 1;
    return lyricsWith('Uma letra bonita que ignora os fatos literais.');
  },
});
const throwingLyrics = (): LyricsProvider => ({
  generate: async () => {
    throw new Error('provider fora do ar');
  },
});

const { db, pool } = createDb(env.DATABASE_URL);
const apps: FastifyInstance[] = [];
const appWith = (lyrics: LyricsProvider) => {
  const app = buildApp(env, { lyrics });
  apps.push(app);
  return app;
};

beforeAll(async () => {
  await db.execute(sql`truncate table orders cascade`);
  for (const type of ['friend_roast', 'team_anthem', 'emotional_tribute'] as const)
    await db
      .insert(products)
      .values({ type, name: 'Produto de teste', priceCents: 4990 })
      .onConflictDoUpdate({ target: products.type, set: { priceCents: 4990 } });
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
    payload: { productType: 'friend_roast' },
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
  it('história → letra → aprovação → checkout dev → fila de áudio', async () => {
    const app = appWith(compliantLyrics());
    const session = await createOrderAndStory(app);
    const generated = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/generate`,
      headers: { cookie: session.cookie },
    });
    expect(generated.statusCode).toBe(200);
    const versionId = (generated.json() as { id: string }).id;
    const approved = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/${versionId}/approve`,
      headers: { cookie: session.cookie },
    });
    expect(approved.statusCode).toBe(200);
    const checkout = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/checkout`,
      headers: { cookie: session.cookie },
    });
    expect(checkout.statusCode).toBe(200);
    expect(checkout.json()).toMatchObject({ dev: true });
    const paymentId = (checkout.json() as { paymentId: string }).paymentId;
    const paid = await app.inject({
      method: 'POST',
      url: `/api/v1/dev/payments/${paymentId}/approve`,
    });
    expect(paid.statusCode).toBe(200);
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${session.publicId}`,
      headers: { cookie: session.cookie },
    });
    expect((detail.json() as { order: { status: string } }).order.status).toBe('audio_queued');
    const { rows: jobRows } = await pool.query(
      'select count(*)::int as count from generation_jobs j join orders o on o.id=j.order_id where o.public_id=$1',
      [session.publicId],
    );
    expect(jobRows[0]?.count).toBe(1);
  });

  it('geração que falha deixa o pedido recuperável: novo clique gera com sucesso', async () => {
    const failingApp = appWith(throwingLyrics());
    const session = await createOrderAndStory(failingApp);
    const failed = await failingApp.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/generate`,
    });
    expect(failed.statusCode).toBe(500);
    const retryApp = appWith(compliantLyrics());
    const retry = await retryApp.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/generate`,
    });
    expect(retry.statusCode).toBe(200);
    const current = await retryApp.inject({
      method: 'GET',
      url: `/api/v1/orders/${session.publicId}`,
      headers: { cookie: session.cookie },
    });
    expect((current.json() as { order: { status: string } }).order.status).toBe('lyrics_ready');
  });

  it('letra que parafraseia fatos tenta 3x com feedback e falha de forma recuperável', async () => {
    const calls = { count: 0 };
    const app = appWith(paraphrasingLyrics(calls));
    const session = await createOrderAndStory(app);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/generate`,
    });
    expect(response.statusCode).toBe(400);
    expect(calls.count).toBe(3);
    expect(String(response.json().error.message)).toContain('não representa todos os fatos');
    const { rows } = await pool.query('select status from orders where public_id=$1', [
      session.publicId,
    ]);
    expect(rows[0]?.status).toBe('failed');
    const retry = await appWith(compliantLyrics()).inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/generate`,
    });
    expect(retry.statusCode).toBe(200);
  });

  it('draft orienta a preencher o formulário; crash em lyrics_generating se recupera', async () => {
    const app = appWith(compliantLyrics());
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: { productType: 'friend_roast' },
    });
    const publicId = (created.json() as { publicId: string }).publicId;
    const blocked = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${publicId}/lyrics/generate`,
    });
    expect(blocked.statusCode).toBe(400);
    expect(String(blocked.json().error.message)).toContain('Preencha o formulário');

    const session = await createOrderAndStory(app);
    await pool.query(`update orders set status='lyrics_generating' where public_id=$1`, [
      session.publicId,
    ]);
    const recovered = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/generate`,
    });
    expect(recovered.statusCode).toBe(200);
  });

  it('checkout exige letra aprovada', async () => {
    const app = appWith(compliantLyrics());
    const session = await createOrderAndStory(app);
    const early = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/checkout`,
      headers: { cookie: session.cookie },
    });
    expect(early.statusCode).toBe(400);
    expect(String(early.json().error.message)).toContain('Aprove a letra');
  });

  it('acesso privado não vaza sem cookie', async () => {
    const app = appWith(compliantLyrics());
    const session = await createOrderAndStory(app);
    const peek = await app.inject({ method: 'GET', url: `/api/v1/orders/${session.publicId}` });
    expect(peek.statusCode).toBe(401);
  });

  it('admin revisa a letra aprovada e reinclui o pedido na produção', async () => {
    const app = appWith(compliantLyrics());
    const session = await createOrderAndStory(app);
    const generated = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/generate`,
    });
    const { id: versionId, orderId } = generated.json() as { id: string; orderId: string };
    await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/lyrics/${versionId}/approve`,
    });
    const checkout = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/checkout`,
    });
    const paymentId = (checkout.json() as { paymentId: string }).paymentId;
    await app.inject({ method: 'POST', url: `/api/v1/dev/payments/${paymentId}/approve` });

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
});
