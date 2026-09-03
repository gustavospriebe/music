import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const localEnv = {
  DATABASE_URL: 'postgresql://resenha:resenha@localhost:5433/resenha_test',
  COOKIE_SECRET: 'a-local-cookie-secret-with-more-than-32-chars',
  CUSTOMER_ACCESS_TOKEN_PEPPER: 'a-local-token-pepper-with-more-than-32-chars',
  ADMIN_EMAIL: 'admin@example.test',
  ADMIN_PASSWORD: 'a-simple-local-password',
};

describe('environment validation', () => {
  it('defaults to the real provider stack', () => {
    const env = parseEnv(localEnv);

    expect(env.LYRICS_PROVIDER).toBe('openrouter');
    expect(env.MUSIC_PROVIDER).toBe('openrouter');
    expect(env.PAYMENT_PROVIDER).toBe('mercadopago');
    expect(env.EMAIL_PROVIDER).toBe('resend');
    expect(env.API_PORT).toBe(3001);
  });

  it('requires all OpenRouter settings in production', () => {
    expect(() => parseEnv({ ...localEnv, NODE_ENV: 'production' })).toThrow(
      'OpenRouter production configuration is required',
    );
  });

  it('requires Mercado Pago settings in production once OpenRouter is configured', () => {
    expect(() =>
      parseEnv({
        ...localEnv,
        NODE_ENV: 'production',
        OPENROUTER_API_KEY: 'key',
        OPENROUTER_TEXT_MODEL: 'text-model',
        OPENROUTER_MUSIC_MODEL: 'music-model',
      }),
    ).toThrow('Mercado Pago production configuration is required');
  });
});
