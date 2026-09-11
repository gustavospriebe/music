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
    expect(env.PAYMENT_PROVIDER).toBe('abacatepay');
    expect(env.EMAIL_PROVIDER).toBe('resend');
    expect(env.API_PORT).toBe(3001);
  });

  it('uses the platform PORT when Railway injects one', () => {
    const env = parseEnv({ ...localEnv, API_PORT: '3001', PORT: '4567' });

    expect(env.API_PORT).toBe(4567);
  });

  it('requires all OpenRouter settings in production', () => {
    expect(() => parseEnv({ ...localEnv, NODE_ENV: 'production' })).toThrow(
      'OpenRouter production configuration is required',
    );
  });

  it('requires AbacatePay settings in production once OpenRouter is configured', () => {
    expect(() =>
      parseEnv({
        ...localEnv,
        NODE_ENV: 'production',
        OPENROUTER_API_KEY: 'key',
        OPENROUTER_TEXT_MODEL: 'text-model',
        OPENROUTER_MUSIC_MODEL: 'music-model',
      }),
    ).toThrow('AbacatePay production configuration is required');
  });

  it('requires cover models and an absolute local storage path in production', () => {
    const providers = {
      ...localEnv,
      NODE_ENV: 'production',
      OPENROUTER_API_KEY: 'key',
      OPENROUTER_TEXT_MODEL: 'text-model',
      OPENROUTER_MUSIC_MODEL: 'music-model',
      ABACATEPAY_API_KEY: 'ab-key',
      ABACATEPAY_PRODUCT_ID: 'prod_1',
      ABACATEPAY_WEBHOOK_SECRET: 'wh-secret',
    };
    expect(() => parseEnv(providers)).toThrow(
      'OpenRouter cover production configuration is required',
    );
    expect(() =>
      parseEnv({
        ...providers,
        OPENROUTER_COVER_TEXT_MODEL: 'cover-text',
        OPENROUTER_COVER_REFERENCE_MODEL: 'cover-reference',
      }),
    ).toThrow('LOCAL_STORAGE_PATH must be absolute in production');
    expect(
      parseEnv({
        ...providers,
        OPENROUTER_COVER_TEXT_MODEL: 'cover-text',
        OPENROUTER_COVER_REFERENCE_MODEL: 'cover-reference',
        LOCAL_STORAGE_PATH: '/data/resenha-storage',
      }).LOCAL_STORAGE_PATH,
    ).toBe('/data/resenha-storage');
  });
});
