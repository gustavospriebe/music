import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from './env.js';
import { createAbacatePayProvider } from './providers.js';

const env = parseEnv({
  DATABASE_URL: 'postgresql://resenha:resenha@localhost:5433/resenha_test',
  COOKIE_SECRET: 'a-local-cookie-secret-with-more-than-32-chars',
  CUSTOMER_ACCESS_TOKEN_PEPPER: 'a-local-token-pepper-with-more-than-32-chars',
  ADMIN_EMAIL: 'admin@example.test',
  ADMIN_PASSWORD: 'a-simple-local-password',
  PAYMENT_PROVIDER: 'abacatepay',
  ABACATEPAY_API_KEY: 'test-abacate-key',
  ABACATEPAY_PRODUCT_ID: 'prod_test_123',
  ABACATEPAY_WEBHOOK_SECRET: 'test-webhook-secret',
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AbacatePay provider', () => {
  it('cria checkout com o produto do dashboard e confere o valor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
        expect(url).toBe('https://api.abacatepay.com/v2/checkouts/create');
        const payload = JSON.parse(init?.body ?? '{}') as {
          items?: Array<{ id?: string; quantity?: number }>;
          externalId?: string;
        };
        expect(payload.items).toEqual([{ id: 'prod_test_123', quantity: 1 }]);
        expect(payload.externalId).toBe('pedido-1');
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
      }),
    );
    const checkout = await createAbacatePayProvider(env).createCheckout({
      title: 'Sua música',
      priceCents: 4990,
      externalReference: 'pedido-1',
      backUrl: 'http://localhost:5175/pedido/pedido-1',
      idempotencyKey: 'checkout:pedido-1:0',
    });
    expect(checkout).toEqual({
      id: 'bill_test_1',
      initPoint: 'https://app.abacatepay.com/pay/bill_test_1',
    });
  });

  it('recusa checkout quando o valor do produto diverge do pedido', async () => {
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
    await expect(
      createAbacatePayProvider(env).createCheckout({
        title: 'Sua música',
        priceCents: 4990,
        externalReference: 'pedido-1',
        backUrl: 'http://localhost:5175/pedido/pedido-1',
        idempotencyKey: 'checkout:pedido-1:0',
      }),
    ).rejects.toThrow('AbacatePay checkout amount does not match the order total.');
  });

  it('mapeia billing pago para status approved', async () => {
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
    await expect(createAbacatePayProvider(env).getBilling('bill_9')).resolves.toEqual({
      id: 'bill_9',
      status: 'approved',
      amountCents: 4990,
      currency: 'BRL',
      externalReference: 'pedido-9',
    });
  });
});
