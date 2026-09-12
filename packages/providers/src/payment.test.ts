import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  authenticateAbacatePayWebhook,
  createAbacatePayProvider,
  createPaymentProvider,
  readPaymentConfig,
} from './payment.js';

const config = readPaymentConfig({
  NODE_ENV: 'test',
  PAYMENT_ENVIRONMENT: 'live',
  ABACATEPAY_API_KEY: 'synthetic-key',
  ABACATEPAY_PRODUCT_ID: 'synthetic-product',
  ABACATEPAY_WEBHOOK_SECRET: 'synthetic-secret',
});
const charge = {
  id: 'charge-a',
  externalId: 'attempt-a',
  amount: 4990,
  paidAmount: 4990,
  status: 'PAID',
  devMode: false,
};
const response = (data: unknown, extra = {}) =>
  new Response(JSON.stringify({ success: true, error: null, data, ...extra }));
afterEach(() => vi.unstubAllGlobals());

describe('strict PIX adapter', () => {
  it('rejects a different billing instead of selecting the first result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response([{ ...charge, id: 'charge-b', externalId: 'attempt-b' }])),
    );
    await expect(createAbacatePayProvider(config).getPayment('charge-a')).rejects.toThrow(
      'different identity',
    );
  });

  it.each([
    { id: '' },
    { externalId: null },
    { amount: 49.9 },
    { amount: -1 },
    { paidAmount: 1 },
    { paidAmount: undefined },
    { status: 'SOMETHING_NEW' },
  ])('rejects invalid or underpaid provider data: %j', async (change) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response([{ ...charge, ...change }])),
    );
    await expect(createAbacatePayProvider(config).getPayment('charge-a')).rejects.toThrow();
  });

  it('preserves refund and exact reference when recovering an unknown creation', async () => {
    const fetch = vi.fn(async (url: string) => {
      expect(url).toContain('externalId=attempt-a');
      return response([{ ...charge, status: 'REFUNDED' }]);
    });
    vi.stubGlobal('fetch', fetch);
    await expect(createAbacatePayProvider(config).findPayment('attempt-a')).resolves.toMatchObject({
      provider: 'abacatepay',
      id: 'charge-a',
      externalReference: 'attempt-a',
      status: 'refunded',
      amountCents: 4990,
      currency: 'BRL',
    });
  });

  it('distinguishes no match from an ambiguous recovery without creating another checkout', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([charge, { ...charge, id: 'charge-b' }]));
    vi.stubGlobal('fetch', fetch);
    const adapter = createAbacatePayProvider(config);
    await expect(adapter.findPayment('attempt-a')).resolves.toBeNull();
    await expect(adapter.findPayment('attempt-a')).rejects.toThrow('ambiguous');
    expect(fetch.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true);
  });

  it('rejects sandbox money in production and resolves historical provider while new sales are disabled', async () => {
    const production = { ...config, production: true, provider: 'disabled' as const };
    const adapter = createPaymentProvider(production, 'abacatepay');
    expect(adapter.name).toBe('abacatepay');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response([{ ...charge, devMode: true }])),
    );
    await expect(adapter.getPayment('charge-a')).rejects.toThrow('environment');
  });
});

describe('payment environment independent of the runtime', () => {
  it('does not reuse a credential for another environment when resolving a historical attempt', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(() => createPaymentProvider(config, 'abacatepay', 'sandbox')).toThrow('environment');
    expect(() => createPaymentProvider(config, 'abacatepay', 'local')).toThrow('environment');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('defaults to live in production and sandbox outside production without relaxing production HMAC', () => {
    expect(readPaymentConfig({ NODE_ENV: 'production' })).toMatchObject({
      environment: 'live',
      requireWebhookSignature: true,
    });
    expect(readPaymentConfig({ NODE_ENV: 'test' })).toMatchObject({ environment: 'sandbox' });
    expect(
      readPaymentConfig({ NODE_ENV: 'production', PAYMENT_ENVIRONMENT: 'sandbox' }),
    ).toMatchObject({ environment: 'sandbox', production: true, requireWebhookSignature: true });
    expect(() => readPaymentConfig({ PAYMENT_ENVIRONMENT: 'unknown' })).toThrow('environment');
  });

  it.each([
    { environment: 'sandbox' as const, devMode: false },
    { environment: 'live' as const, devMode: true },
    { environment: 'sandbox' as const, devMode: undefined },
    { environment: 'live' as const, devMode: undefined },
  ])('rejects a different or absent mode at create and lookup: %j', async (mode) => {
    const adapter = createAbacatePayProvider({ ...config, environment: mode.environment });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) =>
        response(
          init.method === 'POST'
            ? { ...charge, devMode: mode.devMode, url: 'https://example.test/checkout' }
            : [{ ...charge, devMode: mode.devMode }],
        ),
      ),
    );
    await expect(adapter.getPayment('charge-a')).rejects.toThrow('environment');
    await expect(
      adapter.createCheckout({
        title: 'Synthetic music',
        priceCents: 4990,
        externalReference: 'attempt-a',
        idempotencyKey: 'checkout:attempt-a',
        backUrl: 'https://example.test/order',
      }),
    ).rejects.toThrow('environment');
  });

  it.each(['sandbox', 'live'] as const)(
    'preserves the verified %s environment',
    async (environment) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response([{ ...charge, devMode: environment === 'sandbox' }])),
      );
      await expect(
        createAbacatePayProvider({ ...config, environment }).getPayment('charge-a'),
      ).resolves.toMatchObject({ environment, amountCents: 4990, status: 'approved' });
    },
  );
});

describe('authenticated v2 notifications', () => {
  const body = {
    id: 'event-a',
    event: 'checkout.refunded',
    apiVersion: 2,
    devMode: false,
    data: { checkout: { id: 'charge-a' }, customer: { ignored: 'not persisted' } },
  };
  const rawBody = Buffer.from(JSON.stringify(body));
  const publicKey =
    't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9';
  const signature = createHmac('sha256', publicKey).update(rawBody).digest('base64');
  const secured = { ...config, requireWebhookSignature: true };

  it('requires the private secret even with a valid public-key HMAC', () => {
    expect(() => authenticateAbacatePayWebhook(secured, { body, rawBody, signature })).toThrow(
      'authentication',
    );
    expect(() =>
      authenticateAbacatePayWebhook(secured, { body, rawBody, signature, secret: 'wrong' }),
    ).toThrow('authentication');
  });

  it('verifies original bytes and exposes only minimal notification identity', () => {
    expect(
      authenticateAbacatePayWebhook(secured, {
        body,
        rawBody,
        signature,
        secret: 'synthetic-secret',
      }),
    ).toEqual({
      provider: 'abacatepay',
      environment: 'live',
      eventId: 'event-a',
      externalPaymentId: 'charge-a',
      kind: 'refunded',
    });
    expect(() =>
      authenticateAbacatePayWebhook(secured, {
        body,
        rawBody: Buffer.from('changed'),
        signature,
        secret: 'synthetic-secret',
      }),
    ).toThrow('signature');
    expect(() =>
      authenticateAbacatePayWebhook(secured, { body, rawBody, secret: 'synthetic-secret' }),
    ).toThrow('signature');
  });

  it('rejects an undocumented flat billing payload and a missing event identifier', () => {
    expect(() =>
      authenticateAbacatePayWebhook(config, {
        body: { ...body, data: { id: 'charge-a' } },
        secret: 'synthetic-secret',
      }),
    ).toThrow();
    expect(() =>
      authenticateAbacatePayWebhook(config, {
        body: { ...body, id: undefined },
        secret: 'synthetic-secret',
      }),
    ).toThrow('identity');
  });

  it.each(['sandbox', 'live'] as const)(
    'validates the exact %s webhook mode with production signatures',
    (environment) => {
      const runtime = readPaymentConfig({
        NODE_ENV: 'production',
        PAYMENT_ENVIRONMENT: environment,
        ABACATEPAY_WEBHOOK_SECRET: 'synthetic-secret',
      });
      const notification = { ...body, devMode: environment === 'sandbox' };
      const bytes = Buffer.from(JSON.stringify(notification));
      const input = {
        body: notification,
        rawBody: bytes,
        secret: 'synthetic-secret',
        signature: createHmac('sha256', publicKey).update(bytes).digest('base64'),
      };
      expect(authenticateAbacatePayWebhook(runtime, input)).toMatchObject({ eventId: 'event-a' });
      expect(() =>
        authenticateAbacatePayWebhook(runtime, { ...input, signature: undefined }),
      ).toThrow('signature');
      const wrongMode = { ...notification, devMode: !notification.devMode };
      const wrongBytes = Buffer.from(JSON.stringify(wrongMode));
      expect(() =>
        authenticateAbacatePayWebhook(runtime, {
          ...input,
          body: wrongMode,
          rawBody: wrongBytes,
          signature: createHmac('sha256', publicKey).update(wrongBytes).digest('base64'),
        }),
      ).toThrow('environment');
    },
  );
});
