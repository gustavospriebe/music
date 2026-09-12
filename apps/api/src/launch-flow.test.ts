import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDb, products, reconcilePayment } from '@resenha/database';
import { createLocalStorage } from '@resenha/providers';
import { hashToken, type PaymentDetails } from '@resenha/domain';
import { buildApp } from './app.js';
import { parseEnv, type Env } from './env.js';
import type { PaymentProvider } from './payment.js';

const env = parseEnv({
  NODE_ENV: 'test',
  PAYMENT_ENVIRONMENT: 'live',
  POLICY_VERSION: 'test-v1',
  DATABASE_URL:
    process.env.DATABASE_URL_TEST ?? 'postgresql://resenha:resenha@localhost:5433/music_launch_api',
  COOKIE_SECRET: 'launch-test-cookie-secret-at-least-32-chars',
  CUSTOMER_ACCESS_TOKEN_PEPPER: 'launch-test-access-pepper-at-least-32-chars',
  ADMIN_EMAIL: 'launch@example.test',
  ADMIN_PASSWORD: 'local-test-password',
  ABACATEPAY_API_KEY: 'synthetic-token',
  ABACATEPAY_PRODUCT_ID: 'prod_test_123',
  ABACATEPAY_WEBHOOK_SECRET: 'synthetic-webhook-secret',
  COMMERCIAL_READY: 'true',
  SUPPORT_EMAIL: 'support@example.test',
  DELIVERY_ESTIMATE: 'Prazo de teste',
  REVISION_POLICY: 'Ajustes de teste',
  REFUND_POLICY: 'Reembolso de teste',
  USAGE_LICENSE: 'Licença de teste',
  TERMS_URL: 'https://example.test/terms',
  PRIVACY_URL: 'https://example.test/privacy',
});
const { db, pool } = createDb(env.DATABASE_URL);
const apps: FastifyInstance[] = [];
let root: string;
const appWith = async (payment?: PaymentProvider, settings: Partial<Env> = {}) => {
  const app = await buildApp(
    { ...env, LOCAL_STORAGE_PATH: root, ...settings },
    payment ? { payment } : {},
  );
  apps.push(app);
  return app;
};
const cookieOf = (response: { headers: { 'set-cookie'?: string | string[] } }) =>
  String(response.headers['set-cookie']).split(';')[0] ?? '';
const orderWith = async (app: FastifyInstance, status = 'lyrics_approved', price = 4990) => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    payload: { productType: 'custom_song', creationKey: randomUUID() },
  });
  expect(response.statusCode).toBe(201);
  const publicId = response.json<{ publicId: string }>().publicId;
  const { rows } = await pool.query(
    'update orders set status=$1,price_cents=$2 where public_id=$3 returning id',
    [status, price, publicId],
  );
  if (status !== 'draft')
    await pool.query(
      "insert into lyric_versions(order_id,number,kind,content,approved_at) values($1,1,'approved','{}',now())",
      [rows[0].id],
    );
  return { id: rows[0].id as string, publicId, headers: { cookie: cookieOf(response) } };
};
const adminFor = async (app: FastifyInstance) => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/session',
    payload: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  return { cookie: cookieOf(response) };
};
const fixturePayment = () => {
  const state = {
    calls: 0,
    failCheckout: false,
    id: randomUUID(),
    status: 'approved' as 'pending' | 'approved' | 'rejected' | 'cancelled',
    amountCents: 4990,
    currency: 'BRL',
    externalReference: null as string | null,
    keys: [] as string[],
  };
  // Invalid currency/reference are deliberately injected in boundary tests below.
  const snapshot = () =>
    ({ ...state, provider: 'abacatepay', environment: 'live' }) as PaymentDetails;
  const adapter: PaymentProvider = {
    name: 'abacatepay',
    createCheckout: async (input) => {
      state.calls++;
      state.keys.push(input.idempotencyKey);
      state.externalReference = input.externalReference;
      state.id = randomUUID();
      if (state.failCheckout) throw new Error('synthetic timeout');
      return { ...snapshot(), status: 'pending', checkoutUrl: 'https://example.test/pay' };
    },
    getPayment: async () => snapshot(),
    findPayment: async () => snapshot(),
  };
  return { state, adapter };
};
const webhook = (app: FastifyInstance, id: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/webhooks/abacatepay?webhookSecret=${env.ABACATEPAY_WEBHOOK_SECRET}`,
    payload: {
      id: `event_${id}`,
      apiVersion: 2,
      devMode: false,
      event: 'checkout.completed',
      data: { checkout: { id } },
    },
  });
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'music-launch-api-'));
  await db
    .insert(products)
    .values({ type: 'custom_song', name: 'Sua música', priceCents: 0 })
    .onConflictDoNothing();
});
afterAll(async () => {
  for (const app of apps) await app.close();
  await pool.end();
  await rm(root, { recursive: true, force: true });
});

describe('launch commerce and money', () => {
  it('stores an open brief without manufactured facts and preserves it when generation is unavailable', async () => {
    const app = await appWith();
    const order = await orderWith(app, 'draft', 0);
    const brief = 'Uma música sobre mudanças, viagens e a coragem de começar outra vez. '
      .repeat(10)
      .trim();
    const saved = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${order.publicId}/story`,
      headers: order.headers,
      payload: {
        productType: 'custom_song',
        buyerEmail: 'author@example.test',
        subjectName: 'Um verão que mudou tudo',
        occasion: 'Uma ideia',
        genre: 'MPB',
        mood: 'Contemplativo',
        voice: 'either',
        brief,
        safetyConfirmed: true,
        termsAccepted: true,
        policyVersion: 'test-v1',
      },
    });
    expect(saved.statusCode).toBe(200);
    const generation = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${order.publicId}/lyrics/generate`,
      headers: order.headers,
    });
    expect(generation.statusCode).toBe(503);
    const detail = (
      await app.inject({ url: `/api/v1/orders/${order.publicId}`, headers: order.headers })
    ).json();
    expect(detail.story).toMatchObject({
      brief,
      facts: [],
      subjectName: 'Um verão que mudou tudo',
      genre: 'MPB',
      mood: 'Contemplativo',
      buyerEmail: 'author@example.test',
    });
    const stored = (
      await pool.query('select data from story_sessions where order_id=$1', [order.id])
    ).rows[0].data as Record<string, unknown>;
    expect(stored).not.toHaveProperty('buyerEmail');
    expect(stored).not.toHaveProperty('buyerName');
    expect(stored).not.toHaveProperty('termsAccepted');
    expect(stored).not.toHaveProperty('marketingAccepted');
    expect(stored).toMatchObject({
      brief,
      facts: [],
      subjectName: 'Um verão que mudou tudo',
      genre: 'MPB',
      mood: 'Contemplativo',
    });
    expect(
      (await pool.query('select email from order_contacts where order_id=$1', [order.id])).rows[0]
        .email,
    ).toBe('author@example.test');
    expect(detail.order.status).toBe('story_completed');
    expect(
      (await pool.query('select id from ai_usage where order_id=$1', [order.id])).rowCount,
    ).toBe(0);
    expect((await app.inject('/api/v1/configuration')).json().generation).toEqual({
      lyricsAvailable: false,
    });
  });

  it('persists intention independently when no occasion was supplied', async () => {
    const app = await appWith();
    const order = await orderWith(app, 'draft', 0);
    const saved = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${order.publicId}/story`,
      headers: order.headers,
      payload: {
        productType: 'custom_song',
        intention: 'amizade',
        buyerEmail: 'author@example.test',
        subjectName: 'Os amigos da estrada',
        genre: 'MPB',
        mood: 'Contemplativo',
        voice: 'either',
        brief: 'Uma música sobre os amigos que encontramos pelo caminho',
        safetyConfirmed: true,
        termsAccepted: true,
        policyVersion: 'test-v1',
      },
    });
    expect(saved.statusCode).toBe(200);
    const detail = (
      await app.inject({ url: `/api/v1/orders/${order.publicId}`, headers: order.headers })
    ).json();
    expect(detail.story).toMatchObject({
      intention: 'amizade',
      occasion: '',
      buyerEmail: 'author@example.test',
    });
    const stored = (
      await pool.query('select data from story_sessions where order_id=$1', [order.id])
    ).rows[0].data as Record<string, unknown>;
    expect(stored).not.toHaveProperty('buyerEmail');
    expect(stored).toMatchObject({ intention: 'amizade', occasion: '' });
  });
  it('snapshots catalog price on creation and never reprices an existing order', async () => {
    const app = await appWith();
    const before = (await pool.query("select price_cents from products where type='custom_song'"))
      .rows[0].price_cents;
    try {
      await pool.query("update products set price_cents=12500 where type='custom_song'");
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        payload: { productType: 'custom_song', creationKey: randomUUID() },
      });
      expect(created.statusCode).toBe(201);
      const publicId = created.json().publicId;
      await pool.query("update products set price_cents=29900 where type='custom_song'");
      const detail = (
        await app.inject({
          url: `/api/v1/orders/${publicId}`,
          headers: { cookie: cookieOf(created) },
        })
      ).json();
      expect(detail.order.priceCents).toBe(12500);
      expect(
        (await pool.query('select price_cents from orders where public_id=$1', [publicId])).rows[0]
          .price_cents,
      ).toBe(12500);
      expect(
        (await app.inject('/api/v1/products'))
          .json()
          .find((product: { type: string }) => product.type === 'custom_song').priceCents,
      ).toBe(29900);
    } finally {
      await pool.query("update products set price_cents=$1 where type='custom_song'", [before]);
    }
  });
  it('returns sanitized configuration and blocks real checkout without price or policies', async () => {
    const { adapter, state } = fixturePayment();
    const app = await appWith(adapter, { COMMERCIAL_READY: 'false' });
    const config = (await app.inject('/api/v1/configuration')).json();
    expect(config).toMatchObject({
      commercial: { ready: false },
      payment: { configured: true, label: 'AbacatePay', devFallback: false },
    });
    expect(JSON.stringify(config)).not.toContain('synthetic');
    const order = await orderWith(app, 'lyrics_approved', 0);
    let response = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${order.publicId}/checkout`,
      headers: order.headers,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toContain('preço');
    await pool.query('update orders set price_cents=4990 where id=$1', [order.id]);
    response = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${order.publicId}/checkout`,
      headers: order.headers,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toContain('condições');
    expect(state.calls).toBe(0);
  });
  it('permits explicit local simulation for undefined price with disabled gateway', async () => {
    const app = await appWith(undefined, {
      PAYMENT_PROVIDER: 'disabled',
      COMMERCIAL_READY: 'false',
    });
    const order = await orderWith(app, 'lyrics_approved', 0);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${order.publicId}/checkout`,
      headers: order.headers,
    });
    expect(response.json()).toMatchObject({ dev: true });
    const detail = (
      await app.inject({ url: `/api/v1/orders/${order.publicId}`, headers: order.headers })
    ).json();
    expect(detail.payment).toMatchObject({
      provider: 'disabled',
      configured: false,
      devFallback: true,
      checkoutAllowed: true,
      priceConfigured: false,
    });
  });
  it('serializes checkout and reconciles uncertain creation before reusing it', async () => {
    const { adapter, state } = fixturePayment();
    const app = await appWith(adapter);
    const order = await orderWith(app);
    const checkout = () =>
      app.inject({
        method: 'POST',
        url: `/api/v1/orders/${order.publicId}/checkout`,
        headers: order.headers,
      });
    state.failCheckout = true;
    expect((await checkout()).statusCode).toBe(503);
    state.failCheckout = false;
    const responses = await Promise.all([checkout(), checkout()]);
    expect(responses.map((r) => r.statusCode)).toEqual([409, 409]);
    expect(state.calls).toBe(1);
    expect(state.keys).toHaveLength(1);
    const pending = (await pool.query('select id from payments where order_id=$1', [order.id]))
      .rows[0];
    state.status = 'pending';
    adapter.findPayment = async () => ({
      ...(await adapter.getPayment(state.id)),
      checkoutUrl: 'https://example.test/pay',
    });
    expect(
      await reconcilePayment(
        pool,
        pending.id,
        () => adapter,
        { provider: 'openrouter', model: 'synthetic' },
        { force: true },
      ),
    ).toBe('settled');
    expect((await checkout()).statusCode).toBe(200);
    expect(state.calls).toBe(1);
    expect(
      (await pool.query('select id from payments where order_id=$1', [order.id])).rowCount,
    ).toBe(1);
  });
  it('rejects bad signatures, retries failed validation, and confirms only one payment/job/event', async () => {
    const { adapter, state } = fixturePayment();
    const app = await appWith(adapter);
    const order = await orderWith(app);
    await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${order.publicId}/checkout`,
      headers: order.headers,
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/webhooks/abacatepay',
          payload: { data: { id: state.id } },
        })
      ).statusCode,
    ).toBe(401);
    const correctReference = state.externalReference;
    state.externalReference = 'unknown-order-reference';
    expect((await webhook(app, state.id)).statusCode).toBe(503);
    state.externalReference = correctReference;
    state.amountCents = 1;
    expect((await webhook(app, state.id)).statusCode).toBe(503);
    state.amountCents = 4990;
    state.currency = 'USD';
    expect((await webhook(app, state.id)).statusCode).toBe(503);
    expect(
      (
        await pool.query('select id from payment_webhook_events where external_event_id=$1', [
          `event_${state.id}`,
        ])
      ).rowCount,
    ).toBe(0);
    state.currency = 'BRL';
    const results = await Promise.all([webhook(app, state.id), webhook(app, state.id)]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(results.some((r) => r.json().duplicate)).toBe(true);
    expect(
      (await pool.query('select status from orders where id=$1', [order.id])).rows[0].status,
    ).toBe('audio_queued');
    expect(
      (await pool.query('select id from generation_jobs where order_id=$1', [order.id])).rowCount,
    ).toBe(1);
    expect(
      (
        await pool.query("select id from payments where order_id=$1 and status='approved'", [
          order.id,
        ])
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await pool.query(
          "select id from analytics_events where order_public_id=$1 and event='paid'",
          [order.publicId],
        )
      ).rowCount,
    ).toBe(1);
  });
  it('records rejection without starting production and allows a new checkout', async () => {
    const { adapter, state } = fixturePayment();
    const app = await appWith(adapter);
    const order = await orderWith(app);
    state.externalReference = order.publicId;
    state.status = 'rejected';
    const checkout = () =>
      app.inject({
        method: 'POST',
        url: `/api/v1/orders/${order.publicId}/checkout`,
        headers: order.headers,
      });
    await checkout();
    const pending = (await pool.query('select id from payments where order_id=$1', [order.id]))
      .rows[0];
    expect(
      await reconcilePayment(
        pool,
        pending.id,
        () => adapter,
        { provider: 'openrouter', model: 'synthetic' },
        { force: true },
      ),
    ).toBe('settled');
    expect(
      (await pool.query('select status from payments where id=$1', [pending.id])).rows[0].status,
    ).toBe('rejected');
    expect(
      (await pool.query('select id from generation_jobs where order_id=$1', [order.id])).rowCount,
    ).toBe(0);
    expect((await checkout()).statusCode).toBe(200);
    expect(state.calls).toBe(2);
    expect(state.keys[0]).not.toBe(state.keys[1]);
  });
});

const deliveryFixture = async (app: FastifyInstance) => {
  const order = await orderWith(app, 'delivered');
  await pool.query(
    "insert into payments(order_id,provider,status,amount_cents,attempt,idempotency_key,external_reference) select id,'dev','approved',price_cents,1,gen_random_uuid()::text,gen_random_uuid()::text from orders where id=$1",
    [order.id],
  );
  const production = await pool.query<{ id: string }>(
    "insert into productions(order_id,number,lyric_version_id,status) select $1,1,id,'completed' from lyric_versions where order_id=$1 and number=1 returning id",
    [order.id],
  );
  const productionId = production.rows[0]!.id;
  await pool.query('update orders set current_production_id=$2 where id=$1', [
    order.id,
    productionId,
  ]);
  const token = randomUUID() + randomUUID();
  await pool.query(
    'insert into deliveries(order_id,token_hash,production_id,delivered_at) values($1,$2,(select current_production_id from orders where id=$1),now())',
    [order.id, hashToken(token, env.CUSTOMER_ACCESS_TOKEN_PEPPER)],
  );
  const assetId = randomUUID();
  const audioId = randomUUID();
  const key = `orders/${order.id}/test.wav`;
  await createLocalStorage(root).put(key, Buffer.from('private-audio'), 'audio/wav');
  await pool.query(
    'insert into stored_files(id,order_id,storage_key,mime_type,size_bytes) values($1,$2,$3,$4,$5)',
    [assetId, order.id, key, 'audio/wav', 13],
  );
  await pool.query(
    "insert into audio_generations(id,order_id,production_id,variant,status,file_id,provider,selected,duration_ms) values($1,$2,(select current_production_id from orders where id=$2),1,'completed',$3,'test',true,12000)",
    [audioId, order.id, assetId],
  );
  await pool.query(
    "insert into audio_generations(order_id,production_id,variant,status,file_id,provider,selected,duration_ms) values($1,$2,2,'completed',$3,'test',true,12000)",
    [order.id, productionId, assetId],
  );
  return { ...order, token, assetId, audioId };
};
describe('private access, support and administrative operations', () => {
  it('denies private downloads without access or completed delivery, and supports authorized streaming', async () => {
    const app = await appWith();
    const order = await deliveryFixture(app);
    const url = `/api/v1/orders/${order.publicId}/assets/1/download`;
    expect((await app.inject(url)).statusCode).toBe(401);
    expect((await app.inject({ url, headers: order.headers })).body).toBe('private-audio');
    expect((await app.inject(`/api/v1/deliveries/${order.token}/files/1/download`)).body).toBe(
      'private-audio',
    );
    expect((await app.inject('/api/v1/deliveries/unknown/files/1/download')).statusCode).toBe(404);
    const streamUrl = `/api/v1/admin/orders/${order.id}/assets/${order.assetId}/stream`;
    expect((await app.inject(streamUrl)).statusCode).toBe(401);
    const admin = await adminFor(app);
    expect((await app.inject({ url: streamUrl, headers: admin })).body).toBe('private-audio');
    expect(
      (
        await app.inject({
          url: `/api/v1/admin/orders/${randomUUID()}/assets/${order.assetId}/stream`,
          headers: admin,
        })
      ).statusCode,
    ).toBe(404);
    // A released version remains accessible while a revision is being prepared.
    for (const status of ['audio_queued', 'review_required', 'revision_requested']) {
      await pool.query('update orders set status=$1 where id=$2', [status, order.id]);
      expect((await app.inject({ url, headers: order.headers })).body).toBe('private-audio');
      expect((await app.inject(`/api/v1/deliveries/${order.token}/files/1/download`)).body).toBe(
        'private-audio',
      );
    }
    await pool.query("update productions set status='review_required' where order_id=$1", [
      order.id,
    ]);
    expect((await app.inject({ url, headers: order.headers })).statusCode).toBe(404);
    expect(
      (await app.inject(`/api/v1/deliveries/${order.token}/files/1/download`)).statusCode,
    ).toBe(404);
    await pool.query("update productions set status='completed' where order_id=$1", [order.id]);
    for (const status of ['refunded', 'cancelled']) {
      await pool.query('update orders set status=$1 where id=$2', [status, order.id]);
      expect((await app.inject({ url, headers: order.headers })).statusCode).toBe(404);
      expect(
        (await app.inject(`/api/v1/deliveries/${order.token}/files/1/download`)).statusCode,
      ).toBe(404);
    }
    await pool.query("update orders set status='delivered' where id=$1", [order.id]);
    await pool.query(
      "update audio_generations set status='processing',selected=false where id=$1",
      [order.audioId],
    );
    expect((await app.inject({ url, headers: order.headers })).statusCode).toBe(404);
    expect(
      (await app.inject(`/api/v1/deliveries/${order.token}/files/1/download`)).statusCode,
    ).toBe(404);
  });
  it('rotation invalidates old full/view cookies and delivery links, and revoke closes the new cookie', async () => {
    const app = await appWith();
    const order = await deliveryFixture(app);
    const admin = await adminFor(app);
    const recovered = await app.inject({
      method: 'POST',
      url: `/api/v1/deliveries/${order.token}/access`,
      payload: {},
    });
    expect(recovered.statusCode).toBe(200);
    const view = { cookie: cookieOf(recovered) };
    const url = `/api/v1/orders/${order.publicId}`;
    expect((await app.inject({ url, headers: view })).statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: `/api/v1/admin/orders/${order.id}/access/rotate` }))
        .statusCode,
    ).toBe(401);
    const rotated = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${order.id}/access/rotate`,
      headers: admin,
    });
    expect(rotated.statusCode).toBe(200);
    for (const headers of [order.headers, view])
      expect((await app.inject({ url, headers })).statusCode).toBe(401);
    expect(
      (await app.inject(`/api/v1/deliveries/${order.token}/files/1/download`)).statusCode,
    ).toBe(404);
    const exchange = await app.inject({
      method: 'POST',
      url: `${url}/access/exchange`,
      payload: { token: rotated.json().accessToken },
    });
    const fresh = { cookie: cookieOf(exchange) };
    expect((await app.inject({ url, headers: fresh })).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/orders/${order.id}/access/revoke`,
          headers: admin,
        })
      ).json(),
    ).toEqual({ revoked: true });
    expect((await app.inject({ url, headers: fresh })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `${url}/access/exchange`,
          payload: { token: rotated.json().accessToken },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('does not accept a valid order cookie copied onto another order name', async () => {
    const app = await appWith();
    const first = await orderWith(app);
    const second = await orderWith(app);
    expect(
      (
        await app.inject({
          url: `/api/v1/orders/${second.publicId}`,
          headers: { cookie: first.headers.cookie.replace(first.publicId, second.publicId) },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('accepts exactly one adjustment after delivery and exposes it in a minimized admin DTO', async () => {
    const app = await appWith();
    const order = await orderWith(app, 'draft');
    const request = () =>
      app.inject({
        method: 'POST',
        url: `/api/v1/orders/${order.publicId}/revision-requests`,
        headers: order.headers,
        payload: { message: 'Trocar o último verso' },
      });
    expect((await request()).statusCode).toBe(409);
    await pool.query("update orders set status='delivered' where id=$1", [order.id]);
    const results = await Promise.all([request(), request()]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    const admin = await adminFor(app);
    const detail = (
      await app.inject({ url: `/api/v1/admin/orders/${order.id}`, headers: admin })
    ).json();
    expect(detail.order.status).toBe('revision_requested');
    expect(detail.revisionRequests).toHaveLength(1);
    expect(detail.revisionRequests[0]).toMatchObject({
      message: 'Trocar o último verso',
      status: 'pending',
    });
    for (const key of ['accessTokenHash', 'creationKeyHash'])
      expect(detail.order).not.toHaveProperty(key);
  });
  it('covers admin notes, retry, regenerate and session revocation with authorization gates', async () => {
    const app = await appWith();
    const order = await deliveryFixture(app);
    await pool.query("update orders set status='failed' where id=$1", [order.id]);
    await pool.query(
      "insert into lyric_versions(order_id,number,kind,content,approved_at) values($1,1,'approved','{}',now()) on conflict(order_id,number) do nothing",
      [order.id],
    );
    const admin = await adminFor(app);
    const jobId = randomUUID();
    await pool.query(
      "insert into generation_jobs(id,order_id,type,payload,idempotency_key,status) values($1,$2,'generate_audio',jsonb_build_object('productionId',(select current_production_id from orders where id=$2)),$3,'failed')",
      [jobId, order.id, randomUUID()],
    );
    const requests = [
      { url: `/api/v1/admin/orders/${order.id}/notes`, payload: { message: 'Revisar arranjo' } },
      { url: `/api/v1/admin/jobs/${jobId}/retry` },
    ];
    for (const request of requests) {
      expect((await app.inject({ method: 'POST', ...request })).statusCode).toBe(401);
      expect((await app.inject({ method: 'POST', ...request, headers: admin })).statusCode).toBe(
        200,
      );
    }
    expect(
      (await pool.query('select status from generation_jobs where id=$1', [jobId])).rows[0].status,
    ).toBe('pending');
    await pool.query("update generation_jobs set status='completed' where id=$1", [jobId]);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/orders/${order.id}/audio/${order.audioId}/regenerate`,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/orders/${order.id}/audio/${order.audioId}/regenerate`,
          headers: admin,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await pool.query('select message from admin_notes where order_id=$1', [order.id])).rows[0]
        .message,
    ).toBe('Revisar arranjo');
    expect(
      (await pool.query('select id from generation_jobs where order_id=$1', [order.id])).rowCount,
    ).toBe(2);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/orders/${order.id}/audio/${randomUUID()}/regenerate`,
          headers: admin,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await app.inject({ method: 'DELETE', url: '/api/v1/admin/session', headers: admin }))
        .statusCode,
    ).toBe(204);
    expect((await app.inject({ url: '/api/v1/admin/orders', headers: admin })).statusCode).toBe(
      401,
    );
  });
  it.each([
    { attempts: 6, maximum: 6, expected: 7 },
    { attempts: 2, maximum: 6, expected: 6 },
  ])(
    'reserves one administrative retry without erasing attempts: %j',
    async ({ attempts, maximum, expected }) => {
      const app = await appWith();
      const order = await deliveryFixture(app);
      await pool.query("update orders set status='failed' where id=$1", [order.id]);
      await pool.query(
        "insert into lyric_versions(order_id,number,kind,content,approved_at) values($1,1,'approved','{}',now()) on conflict(order_id,number) do nothing",
        [order.id],
      );
      const admin = await adminFor(app);
      const jobId = randomUUID();
      await pool.query(
        "insert into generation_jobs(id,order_id,type,payload,idempotency_key,status,attempts,max_attempts,last_error) values($1,$2,'generate_audio',jsonb_build_object('productionId',(select current_production_id from orders where id=$2)),$3,'failed',$4,$5,'synthetic failure')",
        [jobId, order.id, randomUUID(), attempts, maximum],
      );
      const url = `/api/v1/admin/jobs/${jobId}/retry`;
      expect((await app.inject({ method: 'POST', url })).statusCode).toBe(401);
      expect((await app.inject({ method: 'POST', url, headers: admin })).statusCode).toBe(200);
      const readJob = async () =>
        (
          await pool.query(
            'select status,attempts,max_attempts,last_error from generation_jobs where id=$1',
            [jobId],
          )
        ).rows[0];
      expect(await readJob()).toEqual({
        status: 'pending',
        attempts,
        max_attempts: expected,
        last_error: null,
      });
      expect((await app.inject({ method: 'POST', url, headers: admin })).statusCode).toBe(409);
      expect(await readJob()).toEqual({
        status: 'pending',
        attempts,
        max_attempts: expected,
        last_error: null,
      });
    },
  );
});
