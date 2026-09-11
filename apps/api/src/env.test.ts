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
    expect(env.GOOGLE_MUSIC_MODEL).toBe('lyria-3.5');
    expect(env.PAYMENT_PROVIDER).toBe('abacatepay');
    expect(env.EMAIL_PROVIDER).toBe('resend');
    expect(env.API_PORT).toBe(3001);
  });

  it('uses the platform PORT when Railway injects one', () => {
    const env = parseEnv({ ...localEnv, API_PORT: '3001', PORT: '4567' });

    expect(env.API_PORT).toBe(4567);
  });

  it('accepts Google music selection and its configured model', () => {
    const env = parseEnv({
      ...localEnv,
      MUSIC_PROVIDER: 'google',
      GOOGLE_API_KEY: 'google-test-key',
      GOOGLE_MUSIC_MODEL: 'lyria-3.5-custom',
    });

    expect(env.MUSIC_PROVIDER).toBe('google');
    expect(env.GOOGLE_MUSIC_MODEL).toBe('lyria-3.5-custom');
  });

  it('rejects unsupported music providers and an empty Google model', () => {
    expect(() => parseEnv({ ...localEnv, MUSIC_PROVIDER: 'mureka' })).toThrow(
      'Invalid environment: MUSIC_PROVIDER',
    );
    expect(() => parseEnv({ ...localEnv, GOOGLE_MUSIC_MODEL: '' })).toThrow(
      'Invalid environment: GOOGLE_MUSIC_MODEL',
    );
  });

  it('requires all OpenRouter settings in production', () => {
    expect(() => parseEnv({ ...localEnv, NODE_ENV: 'production' })).toThrow(
      'OpenRouter production configuration is required',
    );
  });

  it('requires the selected Google credential in production without requiring an OpenRouter music model', () => {
    const productionGoogle = {
      ...localEnv,
      NODE_ENV: 'production',
      MUSIC_PROVIDER: 'google',
      PAYMENT_PROVIDER: 'disabled',
      OPENROUTER_API_KEY: 'openrouter-text-key',
      OPENROUTER_TEXT_MODEL: 'text-model',
      OPENROUTER_COVER_TEXT_MODEL: 'cover-text',
      OPENROUTER_COVER_REFERENCE_MODEL: 'cover-reference',
      STORAGE_PROVIDER: 's3',
      STORAGE_S3_BUCKET: 'private-bucket',
      STORAGE_S3_REGION: 'us-east-1',
    };

    expect(() => parseEnv(productionGoogle)).toThrow('Google production configuration is required');
    expect(parseEnv({ ...productionGoogle, GOOGLE_API_KEY: 'google-key' }).MUSIC_PROVIDER).toBe(
      'google',
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

  it('requires cover models and managed private storage in production', () => {
    const providers = {
      ...localEnv,
      NODE_ENV: 'production',
      OPENROUTER_API_KEY: 'key',
      OPENROUTER_TEXT_MODEL: 'text-model',
      OPENROUTER_MUSIC_MODEL: 'music-model',
      ABACATEPAY_API_KEY: 'abc-token',
      ABACATEPAY_PRODUCT_ID: 'prod_test',
      ABACATEPAY_WEBHOOK_SECRET: 'abc-secret',
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
    ).toThrow('STORAGE_PROVIDER=s3 is required in production');
    expect(
      parseEnv({
        ...providers,
        OPENROUTER_COVER_TEXT_MODEL: 'cover-text',
        OPENROUTER_COVER_REFERENCE_MODEL: 'cover-reference',
        STORAGE_PROVIDER: 's3',
        STORAGE_S3_BUCKET: 'private-bucket',
        STORAGE_S3_REGION: 'us-east-1',
      }).STORAGE_PROVIDER,
    ).toBe('s3');
  });
});

it('accepts an unselected gateway and local email while keeping manual review and empty settings safe', () => {
  const env = parseEnv({
    ...localEnv,
    PAYMENT_PROVIDER: 'disabled',
    EMAIL_PROVIDER: 'local-log',
    SUPPORT_EMAIL: '',
    DELIVERY_ESTIMATE: '',
    REFUND_POLICY: '',
    TERMS_URL: '',
  });
  expect(env.PAYMENT_PROVIDER).toBe('disabled');
  expect(env.EMAIL_PROVIDER).toBe('local-log');
  expect(env.AUDIO_REVIEW_MODE).toBe('manual');
  expect(env.SUPPORT_EMAIL).toBeUndefined();
  expect(env.DELIVERY_ESTIMATE).toBeUndefined();
  expect(env.TERMS_URL).toBeUndefined();
});

it('caps lyrics output with an explicit validated token budget', () => {
  expect(parseEnv(localEnv).OPENROUTER_TEXT_MAX_TOKENS).toBe(8192);
  expect(
    parseEnv({ ...localEnv, OPENROUTER_TEXT_MAX_TOKENS: '4096' }).OPENROUTER_TEXT_MAX_TOKENS,
  ).toBe(4096);
  for (const value of ['0', '65537', '1.5', 'invalid'])
    expect(() => parseEnv({ ...localEnv, OPENROUTER_TEXT_MAX_TOKENS: value })).toThrow(
      'OPENROUTER_TEXT_MAX_TOKENS',
    );
});
