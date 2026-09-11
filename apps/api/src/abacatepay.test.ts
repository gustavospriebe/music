import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { createDb, orders, paymentWebhookEvents, payments, products } from '@resenha/database';
import { buildApp } from './app.js';
import type { Env } from './env.js';
import { createAbacatePayProvider, verifyAbacatePaySecret } from './providers.js';

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
  PAYMENT_PROVIDER: 'abacatepay',
  EMAIL_PROVIDER: 'resend',
  AUDIO_REVIEW_MODE: 'automatic',
  LOCAL_STORAGE_PATH: './var/abacatepay-test-storage',
  ABACATEPAY_API_KEY: 'test-abacate-key',
  ABACATEPAY_PRODUCT_ID: 'prod_test_123',
  ABACATEPAY_WEBHOOK_SECRET: 'test-webhook-secret',
};

const { db, pool } = createDb(env.DATABASE_URL);
const apps: FastifyInstance[] = [];

beforeAll(async () => {
  await db.execute(sql`truncate table orders cascade`);
  await db
    .insert(products)
    .values({ type: 'friend_roast', name: 'Produto de teste', priceCents: 4990 })
    .onConflictDoUpdate({ target: products.type, set: { priceCents: 4990 } });
});
afterAll(async () => {
  for (const app of apps) await app.close();
  await pool.end();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const stubAbacatePay = (billing: {
  id: string;
  status: string;
  amount: number;
  externalId: string | null;
}) => {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/checkouts/create')) {
        const payload = JSON.parse(init?.body ?? '{}') as {
          items?: Array<{ id?: string }>;
          externalId?: string;
        };
        expect(payload.items).toEqual([{ id: 'prod_test_123', quantity: 1 }]);
        return jsonResponse({
          data: {
            id: 'bill_test_1',
            url: 'https://app.abacatepay.com/pay/bill_test_1',
            amount: 4990,
            externalId: payload.externalId ?? null,
          },
          success: true,
          error: null,
        });
      }
      return jsonResponse({ data: billing, success: true, error: null });
    }),
  );
  return calls;
};

const createLyricsApprovedOrder = async (app: FastifyInstance) => {
  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    payload: { productType: 'friend_roast', creationKey: randomUUID() },
  });
  expect(created.statusCode).toBe(201);
  const { publicId } = created.json() as { publicId: string };
  const cookie = String(created.headers['set-cookie']).split(';')[0] ?? '';
  await db.update(orders).set({ status: 'lyrics_approved' }).where(eq(orders.publicId, publicId));
  return { publicId, cookie };
};

describe('AbacatePay checkout', () => {
  it('cria checkout com o produto do dashboard e confere o valor', async () => {
    const app = await buildApp(env);
    apps.push(app);
    stubAbacatePay({ id: 'bill_test_1', status: 'PENDING', amount: 4990, externalId: null });
    const { publicId, cookie } = await createLyricsApprovedOrder(app);
    const checkout = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${publicId}/checkout`,
      headers: { cookie },
    });
    expect(checkout.statusCode).toBe(200);
    const body = checkout.json() as { checkoutUrl: string };
    expect(body.checkoutUrl).toBe('https://app.abacatepay.com/pay/bill_test_1');
    const [orderRow] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, orderRow?.id ?? ''), eq(payments.status, 'pending')));
    expect(payment?.provider).toBe('abacate-pay');
    expect(payment?.amountCents).toBe(4990);
  });

  it('recusa checkout quando o valor do produto diverge do pedido', async () => {
    const app = await buildApp(env);
    apps.push(app);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: { id: 'bill_x', url: 'https://app.abacatepay.com/pay/bill_x', amount: 1 },
          success: true,
          error: null,
        }),
      ),
    );
    const { publicId, cookie } = await createLyricsApprovedOrder(app);
    const checkout = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${publicId}/checkout`,
      headers: { cookie },
    });
    expect(checkout.statusCode).toBe(500);
  });
});

describe('AbacatePay webhook', () => {
  const paidBilling = (externalId: string) => ({
    id: 'bill_test_1',
    status: 'PAID',
    amount: 4990,
    externalId,
  });

  it('confirma pagamento, enfileira áudio e deduplica repetição', async () => {
    const app = await buildApp(env);
    apps.push(app);
    stubAbacatePay(paidBilling('placeholder'));
    const { publicId, cookie } = await createLyricsApprovedOrder(app);
    await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${publicId}/checkout`,
      headers: { cookie },
    });
    vi.unstubAllGlobals();
    stubAbacatePay(paidBilling(publicId));

    const payload = {
      id: 'log_1',
      event: 'checkout.completed',
      apiVersion: 2,
      devMode: true,
      data: { id: 'bill_test_1' },
    };
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/abacate-pay?webhookSecret=test-webhook-secret',
      payload,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ processed: true });

    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    expect(order?.status).toBe('audio_queued');
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, order?.id ?? ''), eq(payments.status, 'approved')));
    expect(payment?.externalPaymentId).toBe('bill_test_1');

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/abacate-pay?webhookSecret=test-webhook-secret',
      payload,
    });
    expect(second.json()).toEqual({ duplicate: true });
    const events = await db
      .select()
      .from(paymentWebhookEvents)
      .where(eq(paymentWebhookEvents.provider, 'abacate-pay'));
    expect(events.length).toBe(1);
  });

  it('rejeita secret inválido e ignora eventos desconhecidos', async () => {
    const app = await buildApp(env);
    apps.push(app);
    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/abacate-pay?webhookSecret=errado',
      payload: { event: 'checkout.completed', data: { id: 'bill_x' } },
    });
    expect(bad.statusCode).toBe(401);
    const ignored = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/abacate-pay?webhookSecret=test-webhook-secret',
      payload: { event: 'subscription.renewed', data: { id: 'bill_x' } },
    });
    expect(ignored.json()).toEqual({ ignored: true });
  });

  it('exige o secret do webhook mesmo sem query string', async () => {
    const app = await buildApp(env);
    apps.push(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/abacate-pay',
      payload: { event: 'checkout.completed', data: { id: 'bill_x' } },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('AbacatePay provider', () => {
  it('valida o secret do webhook em tempo constante', () => {
    expect(verifyAbacatePaySecret({ received: 'abc', expected: 'abc' })).toBe(true);
    expect(verifyAbacatePaySecret({ received: 'abc', expected: 'abd' })).toBe(false);
    expect(verifyAbacatePaySecret({ received: undefined, expected: 'abc' })).toBe(false);
    expect(verifyAbacatePaySecret({ received: 'abc', expected: undefined })).toBe(false);
  });

  it('mapeia o billing da API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          data: { id: 'bill_9', status: 'PAID', amount: 4990, externalId: 'pedido-9' },
          success: true,
          error: null,
        }),
      ),
    );
    const provider = createAbacatePayProvider(env);
    const billing = await provider.getBilling('bill_9');
    expect(billing).toEqual({
      id: 'bill_9',
      status: 'PAID',
      amountCents: 4990,
      currency: 'BRL',
      externalReference: 'pedido-9',
    });
  });
});
