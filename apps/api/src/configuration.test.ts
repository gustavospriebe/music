import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';
import { orderPaymentConfiguration, publicConfiguration } from './configuration.js';
const env = parseEnv({
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  COOKIE_SECRET: 'test-cookie-secret-32-characters-long',
  CUSTOMER_ACCESS_TOKEN_PEPPER: 'test-token-pepper-32-characters-long',
  ADMIN_EMAIL: 'test@example.test',
  ADMIN_PASSWORD: 'test-password',
  PAYMENT_ENVIRONMENT: 'live',
  ABACATEPAY_API_KEY: 'private-key',
  ABACATEPAY_PRODUCT_ID: 'prod_test_123',
  ABACATEPAY_WEBHOOK_SECRET: 'private-webhook-secret',
  COMMERCIAL_READY: 'true',
  POLICY_VERSION: '2026-09-v1',
  SUPPORT_EMAIL: 'support@example.test',
  DELIVERY_ESTIMATE: 'Prazo aprovado',
  REVISION_POLICY: 'Ajustes aprovados',
  REFUND_POLICY: 'Reembolso aprovado',
  USAGE_LICENSE: 'Licença aprovada',
  TERMS_URL: 'https://example.test/terms',
  PRIVACY_URL: 'https://example.test/privacy',
});

describe('commercial activation gates', () => {
  it.each([
    'SUPPORT_EMAIL',
    'DELIVERY_ESTIMATE',
    'REVISION_POLICY',
    'REFUND_POLICY',
    'USAGE_LICENSE',
    'TERMS_URL',
    'PRIVACY_URL',
    'POLICY_VERSION',
  ] as const)('requires %s alongside the ready flag', (setting) => {
    const missing = { ...env, [setting]: undefined };
    expect(publicConfiguration(missing).commercial.ready).toBe(false);
    expect(orderPaymentConfiguration(missing, 4990).checkoutAllowed).toBe(false);
  });
  it('allows a priced real checkout only after every condition is defined', () => {
    expect(orderPaymentConfiguration(env, 4990)).toMatchObject({
      checkoutAllowed: true,
      priceConfigured: true,
      configured: true,
      devFallback: false,
    });
    expect(orderPaymentConfiguration(env, 0)).toMatchObject({
      checkoutAllowed: false,
      priceConfigured: false,
    });
    expect(
      orderPaymentConfiguration({ ...env, COMMERCIAL_READY: 'false' }, 4990).checkoutAllowed,
    ).toBe(false);
  });
  it('never falls back to simulated payment in production', () => {
    expect(
      orderPaymentConfiguration(
        { ...env, NODE_ENV: 'production', PAYMENT_PROVIDER: 'disabled' },
        4990,
      ),
    ).toMatchObject({ configured: false, devFallback: false, checkoutAllowed: false });
  });

  it('keeps real sandbox checkout closed publicly even with a complete commercial configuration', () => {
    const sandbox = {
      ...env,
      NODE_ENV: 'production' as const,
      PAYMENT_ENVIRONMENT: 'sandbox' as const,
    };
    expect(publicConfiguration(sandbox)).toMatchObject({
      commercial: { ready: false },
      payment: {
        sandbox: true,
        environment: 'sandbox',
        label: 'AbacatePay — homologação sem cobrança',
        devFallback: false,
      },
    });
    expect(orderPaymentConfiguration(sandbox, 4990).checkoutAllowed).toBe(false);
    expect(
      orderPaymentConfiguration(sandbox, 4990, { administrativeSandbox: true }).checkoutAllowed,
    ).toBe(true);
  });

  it('restricts the administrative exception to configured sandbox with a positive integer price', () => {
    const administrativeSandbox = { administrativeSandbox: true };
    const sandbox = {
      ...env,
      NODE_ENV: 'production' as const,
      PAYMENT_ENVIRONMENT: 'sandbox' as const,
    };
    for (const price of [0, -1, 49.9, Number.NaN])
      expect(orderPaymentConfiguration(sandbox, price, administrativeSandbox).checkoutAllowed).toBe(
        false,
      );
    expect(
      orderPaymentConfiguration(
        { ...sandbox, ABACATEPAY_PRODUCT_ID: undefined },
        4990,
        administrativeSandbox,
      ).checkoutAllowed,
    ).toBe(false);
    expect(
      orderPaymentConfiguration({ ...env, COMMERCIAL_READY: 'false' }, 4990, administrativeSandbox)
        .checkoutAllowed,
    ).toBe(false);
  });
});
