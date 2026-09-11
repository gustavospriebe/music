import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';
import { orderPaymentConfiguration, publicConfiguration } from './configuration.js';
const env = parseEnv({
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  COOKIE_SECRET: 'test-cookie-secret-32-characters-long',
  CUSTOMER_ACCESS_TOKEN_PEPPER: 'test-token-pepper-32-characters-long',
  ADMIN_EMAIL: 'test@example.test',
  ADMIN_PASSWORD: 'test-password',
  ABACATEPAY_API_KEY: 'private-key',
  ABACATEPAY_PRODUCT_ID: 'prod_test_123',
  ABACATEPAY_WEBHOOK_SECRET: 'private-webhook-secret',
  COMMERCIAL_READY: 'true',
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
});
