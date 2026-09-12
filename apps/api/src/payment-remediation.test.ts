import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDb, reconcileDuePayments, reconcilePayment, settlePayment } from '@resenha/database';
import type { PaymentDetails } from '@resenha/domain';
import type { PaymentProvider } from '@resenha/providers';
import { buildApp } from './app.js';
import { parseEnv, type Env } from './env.js';

const databaseUrl = process.env.DATABASE_URL_TEST;
const selection = { provider: 'openrouter' as const, model: 'synthetic/music' };

describe.skipIf(!databaseUrl)('durable payment settlement (isolated PostgreSQL)', () => {
  let pool: ReturnType<typeof createDb>['pool'];
  let env: Env;
  let storageRoot: string;
  const apps: FastifyInstance[] = [];
  const ids: string[] = [];
  beforeAll(async () => {
    // No implicit database fallback and no outbound traffic: every payment response is synthetic.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('External calls forbidden in this test');
      }),
    );
    pool = createDb(databaseUrl!).pool;
    await pool.query('select attempt,external_reference from payments limit 0');
    storageRoot = await mkdtemp(join(tmpdir(), 'payment-remediation-'));
    env = parseEnv({
      NODE_ENV: 'test',
      PAYMENT_ENVIRONMENT: 'live',
      DATABASE_URL: databaseUrl,
      COOKIE_SECRET: 'synthetic-cookie-secret-with-at-least-32-chars',
      CUSTOMER_ACCESS_TOKEN_PEPPER: 'synthetic-pepper-with-at-least-32-chars',
      ADMIN_EMAIL: 'admin@example.test',
      ADMIN_PASSWORD: 'synthetic-test-password',
      ABACATEPAY_API_KEY: 'synthetic',
      ABACATEPAY_PRODUCT_ID: 'synthetic',
      ABACATEPAY_WEBHOOK_SECRET: 'synthetic-webhook-secret',
      COMMERCIAL_READY: 'true',
      SUPPORT_EMAIL: 'support@example.test',
      DELIVERY_ESTIMATE: 'Teste',
      REVISION_POLICY: 'Teste',
      REFUND_POLICY: 'Teste',
      USAGE_LICENSE: 'Teste',
      TERMS_URL: 'https://example.test/terms',
      PRIVACY_URL: 'https://example.test/privacy',
      POLICY_VERSION: 'test-v1',
      LOCAL_STORAGE_PATH: storageRoot,
    });
    await pool.query(
      "insert into products(type,name,price_cents) values('custom_song','Test song',4990) on conflict(type) do nothing",
    );
  });
  afterAll(async () => {
    for (const app of apps) await app.close();
    if (pool) {
      await pool.query('delete from payments where order_id=any($1::uuid[])', [ids]);
      await pool.query('delete from orders where id=any($1::uuid[])', [ids]);
      await pool.end();
    }
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  const fixture = async (settings: Partial<Env> = {}) => {
    const runtime = { ...env, ...settings };
    let details: PaymentDetails = {
      provider: 'abacatepay',
      environment: runtime.PAYMENT_ENVIRONMENT ?? 'live',
      id: randomUUID(),
      externalReference: 'unset',
      amountCents: 4990,
      currency: 'BRL',
      status: 'pending',
      checkoutUrl: 'https://example.test/checkout',
    };
    const create = vi.fn(async (input: Parameters<PaymentProvider['createCheckout']>[0]) => {
      details = { ...details, externalReference: input.externalReference };
      return { ...details };
    });
    const adapter: PaymentProvider = {
      name: 'abacatepay',
      createCheckout: create,
      getPayment: vi.fn(async () => ({ ...details })),
      findPayment: vi.fn(async () => ({ ...details })),
    };
    const app = await buildApp(runtime, { payment: adapter });
    apps.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: { productType: 'custom_song', creationKey: randomUUID() },
    });
    expect(response.statusCode).toBe(201);
    const publicId = response.json<{ publicId: string }>().publicId;
    const headers = { cookie: String(response.headers['set-cookie']).split(';')[0]! };
    const result = await pool.query<{ id: string }>(
      "update orders set status='lyrics_approved',price_cents=4990 where public_id=$1 returning id",
      [publicId],
    );
    const orderId = result.rows[0]!.id;
    ids.push(orderId);
    const lyric = await pool.query<{ id: string }>(
      "insert into lyric_versions(order_id,number,kind,content,approved_at) values($1,1,'approved','{}',now()) returning id",
      [orderId],
    );
    const checkout = () =>
      app.inject({ method: 'POST', url: `/api/v1/orders/${publicId}/checkout`, headers });
    const row = async () =>
      (
        await pool.query('select * from payments where order_id=$1 order by attempt desc limit 1', [
          orderId,
        ])
      ).rows[0]!;
    const observe = (change: Partial<PaymentDetails>) => {
      details = { ...details, ...change };
      return { ...details };
    };
    return {
      app,
      publicId,
      headers,
      orderId,
      lyricId: lyric.rows[0]!.id,
      adapter,
      create,
      checkout,
      row,
      observe,
      runtime,
    };
  };
  const webhook = (
    f: Awaited<ReturnType<typeof fixture>>,
    kind = 'completed',
    eventId = randomUUID(),
  ) =>
    f.app.inject({
      method: 'POST',
      url: `/api/v1/webhooks/abacatepay?webhookSecret=${env.ABACATEPAY_WEBHOOK_SECRET}`,
      payload: {
        id: eventId,
        apiVersion: 2,
        devMode: f.runtime.PAYMENT_ENVIRONMENT === 'sandbox',
        event: `checkout.${kind}`,
        data: { checkout: { id: f.observe({}).id } },
      },
    });

  it('persists identity before IO and serializes concurrent creates without external idempotency', async () => {
    const f = await fixture();
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    f.create.mockImplementationOnce(async (input) => {
      const payment = await f.row();
      expect(payment.status).toBe('creating');
      expect(payment.external_reference).toBe(input.externalReference);
      expect(payment.idempotency_key).toBe(input.idempotencyKey);
      entered();
      await wait;
      return f.observe({ externalReference: input.externalReference });
    });
    const first = f.checkout();
    await started;
    const second = await f.checkout();
    expect(second.statusCode).toBe(409);
    release();
    expect((await first).statusCode).toBe(200);
    expect((await f.checkout()).statusCode).toBe(200);
    expect(f.create).toHaveBeenCalledTimes(1);
    expect((await f.row()).status).toBe('pending');
  });

  it('settles a webhook arriving before create returns and never restores refunded money with a stale response', async () => {
    const f = await fixture();
    f.create.mockImplementationOnce(async (input) => {
      const pending = f.observe({ externalReference: input.externalReference, status: 'pending' });
      f.observe({ status: 'approved' });
      expect((await webhook(f)).statusCode).toBe(200);
      f.observe({ status: 'refunded' });
      expect((await webhook(f, 'refunded')).statusCode).toBe(200);
      return pending;
    });
    expect((await f.checkout()).statusCode).toBe(200);
    expect((await f.row()).status).toBe('refunded');
    const jobs = await pool.query('select status from generation_jobs where order_id=$1', [
      f.orderId,
    ]);
    expect(jobs.rows).toEqual([{ status: 'cancelled' }]);
  });

  it('keeps timeout unknown and reconciles by reference without issuing a second create', async () => {
    const f = await fixture();
    f.create.mockImplementationOnce(async (input) => {
      f.observe({ externalReference: input.externalReference, status: 'approved' });
      throw new Error('synthetic response lost after remote side effect');
    });
    expect((await f.checkout()).statusCode).toBe(503);
    const payment = await f.row();
    expect(payment.status).toBe('unknown');
    expect((await f.checkout()).statusCode).toBe(409);
    expect(
      await reconcilePayment(pool, payment.id, () => f.adapter, selection, { force: true }),
    ).toBe('settled');
    expect(f.adapter.findPayment).toHaveBeenCalledWith(payment.external_reference);
    expect(f.create).toHaveBeenCalledTimes(1);
    const production = await pool.query(
      'select lyric_version_id from productions where order_id=$1',
      [f.orderId],
    );
    expect(production.rows).toEqual([{ lyric_version_id: f.lyricId }]);
    expect((await f.row()).status).toBe('approved');
  });

  it('does not reopen unknown when reconciliation finds no matching charge', async () => {
    const f = await fixture();
    f.create.mockRejectedValueOnce(new Error('timeout'));
    expect((await f.checkout()).statusCode).toBe(503);
    f.adapter.findPayment = vi.fn(async () => null);
    expect(
      await reconcilePayment(pool, (await f.row()).id, () => f.adapter, selection, { force: true }),
    ).toBe('unknown');
    expect((await f.checkout()).statusCode).toBe(409);
    expect(f.create).toHaveBeenCalledTimes(1);
  });

  it('rejects different charge identity and money without mutating payment or producing audio', async () => {
    const f = await fixture();
    expect((await f.checkout()).statusCode).toBe(200);
    const payment = await f.row();
    for (const change of [
      { id: randomUUID() },
      { externalReference: randomUUID() },
      { amountCents: 4991 },
      { currency: 'USD' },
      { environment: 'sandbox' },
    ]) {
      await expect(
        settlePayment(
          pool,
          payment.id,
          { ...f.observe({}), status: 'approved', ...change } as PaymentDetails,
          selection,
        ),
      ).rejects.toThrow();
    }
    expect((await f.row()).status).toBe('pending');
    expect(
      (await pool.query('select id from generation_jobs where order_id=$1', [f.orderId])).rows,
    ).toHaveLength(0);
  });

  it('deduplicates real event IDs, fixes approved lyric, and refunds despite late expired/approved observations', async () => {
    const f = await fixture();
    expect((await f.checkout()).statusCode).toBe(200);
    f.observe({ status: 'approved' });
    const eventId = randomUUID();
    expect((await webhook(f, 'completed', eventId)).statusCode).toBe(200);
    expect((await webhook(f, 'completed', eventId)).json()).toEqual({ duplicate: true });
    const payment = await f.row();
    const jobs = await pool.query('select id,payload from generation_jobs where order_id=$1', [
      f.orderId,
    ]);
    expect(jobs.rows).toHaveLength(1);
    expect(jobs.rows[0].payload).toMatchObject({ productionId: expect.any(String) });
    await pool.query(
      "insert into lyric_versions(order_id,number,kind,content,approved_at) values($1,2,'approved','{}',now())",
      [f.orderId],
    );
    expect(
      (await pool.query('select lyric_version_id from productions where order_id=$1', [f.orderId]))
        .rows,
    ).toEqual([{ lyric_version_id: f.lyricId }]);
    await pool.query(
      "update generation_jobs set status='processing',lease_token=$2,lease_expires_at=now()+interval '1 minute' where id=$1",
      [jobs.rows[0].id, randomUUID()],
    );
    await pool.query('insert into deliveries(order_id,token_hash,production_id) values($1,$2,$3)', [
      f.orderId,
      randomUUID(),
      jobs.rows[0].payload.productionId,
    ]);
    f.observe({ status: 'refunded' });
    expect((await webhook(f, 'refunded')).statusCode).toBe(200);
    await settlePayment(pool, payment.id, f.observe({ status: 'expired' }), selection);
    await settlePayment(pool, payment.id, f.observe({ status: 'approved' }), selection);
    expect((await f.row()).status).toBe('refunded');
    expect((await f.row()).paid_at).toBeInstanceOf(Date);
    expect((await f.row()).refunded_at).toBeInstanceOf(Date);
    const order = (
      await pool.query(
        'select status,access_revoked_at,creation_key_hash from orders where id=$1',
        [f.orderId],
      )
    ).rows[0];
    expect(order.status).toBe('refunded');
    expect(order.access_revoked_at).toBeInstanceOf(Date);
    expect(order.creation_key_hash).toBeNull();
    expect(
      (
        await pool.query('select status,lease_token from generation_jobs where order_id=$1', [
          f.orderId,
        ])
      ).rows,
    ).toEqual([{ status: 'cancelled', lease_token: null }]);
    expect(
      (await pool.query('select revoked_at from deliveries where order_id=$1', [f.orderId])).rows[0]
        .revoked_at,
    ).toBeInstanceOf(Date);
    expect(
      (await f.app.inject({ url: `/api/v1/orders/${f.publicId}`, headers: f.headers })).statusCode,
    ).toBe(401);
  });

  it('retries refund notification until polling confirms REFUNDED and never changes approved to expired', async () => {
    const f = await fixture();
    await f.checkout();
    f.observe({ status: 'approved' });
    await webhook(f);
    const eventId = randomUUID();
    expect((await webhook(f, 'refunded', eventId)).statusCode).toBe(503);
    expect((await f.row()).status).toBe('approved');
    await settlePayment(pool, (await f.row()).id, f.observe({ status: 'expired' }), selection);
    expect((await f.row()).status).toBe('approved');
    f.observe({ status: 'refunded' });
    expect((await webhook(f, 'refunded', eventId)).statusCode).toBe(200);
  });

  it('background reconciliation recovers a crashed creating attempt and polls paid for missed refunds', async () => {
    const f = await fixture();
    await f.checkout();
    const payment = await f.row();
    await pool.query(
      "update payments set status='creating',external_payment_id=null,created_at=now()-interval '2 minutes',reconcile_after='2000-01-01T00:00:00Z' where id=$1",
      [payment.id],
    );
    f.observe({ status: 'approved' });
    const resolver = vi.fn((name: string) => {
      expect(name).toBe('abacatepay');
      return f.adapter;
    });
    expect(await reconcileDuePayments(pool, resolver, selection, { limit: 1 })).toMatchObject({
      failed: 0,
    });
    expect((await f.row()).status).toBe('approved');
    await pool.query("update payments set reconcile_after='2000-01-01T00:00:00Z' where id=$1", [
      payment.id,
    ]);
    f.observe({ status: 'refunded' });
    await reconcileDuePayments(pool, resolver, selection, { limit: 1 });
    expect((await f.row()).status).toBe('refunded');
    expect(f.create).toHaveBeenCalledTimes(1);
  });

  const sandboxRuntime: Partial<Env> = {
    NODE_ENV: 'production',
    PAYMENT_ENVIRONMENT: 'sandbox',
    COMMERCIAL_READY: 'false',
    POLICY_VERSION: undefined,
    STORAGE_PROVIDER: 's3',
    STORAGE_S3_BUCKET: 'synthetic-sandbox-bucket',
    STORAGE_S3_REGION: 'us-east-1',
    STORAGE_S3_ENDPOINT: 'https://storage.example.test',
    STORAGE_S3_ACCESS_KEY_ID: 'synthetic-storage-key',
    STORAGE_S3_SECRET_ACCESS_KEY: 'synthetic-storage-secret',
  };
  const adminCookie = async (f: Awaited<ReturnType<typeof fixture>>) => {
    const login = await f.app.inject({
      method: 'POST',
      url: '/api/v1/admin/session',
      payload: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    expect(String(login.headers['set-cookie'])).toContain('Secure');
    return String(login.headers['set-cookie']).split(';')[0]!;
  };

  it('requires admin and the order capability for sandbox, preserving closed public commerce', async () => {
    const f = await fixture({ ...sandboxRuntime, COMMERCIAL_READY: 'true' });
    expect((await f.app.inject('/api/v1/configuration')).json()).toMatchObject({
      commercial: { ready: false },
      payment: {
        sandbox: true,
        environment: 'sandbox',
        label: 'AbacatePay — homologação sem cobrança',
      },
    });
    expect((await f.checkout()).statusCode).toBe(401);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: `/api/v1/orders/${f.publicId}/checkout?administrativeSandbox=true`,
          headers: f.headers,
          payload: { administrativeSandbox: true },
        })
      ).statusCode,
    ).toBe(401);
    const admin = await adminCookie(f);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: `/api/v1/orders/${f.publicId}/checkout`,
          headers: { cookie: admin },
        })
      ).statusCode,
    ).toBe(401);
    expect(f.create).not.toHaveBeenCalled();
    expect(
      (await pool.query('select id from payments where order_id=$1', [f.orderId])).rows,
    ).toHaveLength(0);
    const request = {
      method: 'POST' as const,
      url: `/api/v1/orders/${f.publicId}/checkout`,
      headers: { cookie: `${f.headers.cookie}; ${admin}` },
    };
    expect((await f.app.inject(request)).statusCode).toBe(200);
    expect((await f.app.inject(request)).statusCode).toBe(200);
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(await f.row()).toMatchObject({ environment: 'sandbox', status: 'pending' });
    const events = await pool.query(
      "select data from order_events where order_id=$1 and type='sandbox_checkout_requested'",
      [f.orderId],
    );
    expect(events.rows).toEqual([
      {
        data: {
          adminUserId: expect.any(String),
          paymentId: (await f.row()).id,
          environment: 'sandbox',
        },
      },
    ]);
    const notes = await pool.query('select message from admin_notes where order_id=$1', [
      f.orderId,
    ]);
    expect(notes.rows).toEqual([
      { message: 'Checkout de homologação solicitado pela administração. Sem cobrança real.' },
    ]);
    expect(
      (await f.app.inject({ url: `/api/v1/orders/${f.publicId}`, headers: f.headers })).json()
        .payment.checkoutAllowed,
    ).toBe(false);
  });

  it('keeps price and lyric approval mandatory for administrative sandbox checkout', async () => {
    const f = await fixture(sandboxRuntime);
    const admin = await adminCookie(f);
    const request = {
      method: 'POST' as const,
      url: `/api/v1/orders/${f.publicId}/checkout`,
      headers: { cookie: `${f.headers.cookie}; ${admin}` },
    };
    await pool.query('update orders set price_cents=0 where id=$1', [f.orderId]);
    expect((await f.app.inject(request)).statusCode).toBe(409);
    await pool.query("update orders set price_cents=4990,status='lyrics_ready' where id=$1", [
      f.orderId,
    ]);
    expect((await f.app.inject(request)).statusCode).toBe(409);
    expect(f.create).not.toHaveBeenCalled();
    expect(
      (await pool.query('select id from payments where order_id=$1', [f.orderId])).rows,
    ).toHaveLength(0);
  });

  it('never reuses a sandbox or unclassified attempt as a live checkout after promotion', async () => {
    const f = await fixture();
    expect((await f.checkout()).statusCode).toBe(200);
    for (const environment of ['sandbox', null]) {
      await pool.query('update payments set environment=$2 where order_id=$1', [
        f.orderId,
        environment,
      ]);
      const blocked = await f.checkout();
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().error.message).toContain('ambiente');
      expect(f.create).toHaveBeenCalledTimes(1);
    }
  });
});
