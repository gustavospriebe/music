import { z } from 'zod';
import { readPaymentConfig, readStorageConfig } from '@resenha/providers';
const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url().optional(),
);
const optionalSetting = (max: number) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().trim().min(1).max(max).optional(),
  );
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  WEB_URL: z.string().url().default('http://localhost:5173'),
  COOKIE_SECRET: z.string().min(32),
  CUSTOMER_ACCESS_TOKEN_PEPPER: z.string().min(32),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(8),
  ADMIN_SESSION_TTL: z.coerce.number().int().positive().default(28800),
  LYRICS_PROVIDER: z.enum(['openrouter']).default('openrouter'),
  MUSIC_PROVIDER: z.enum(['openrouter', 'google']).default('openrouter'),
  PAYMENT_PROVIDER: z.enum(['abacatepay', 'disabled']).default('abacatepay'),
  PAYMENT_ENVIRONMENT: z.enum(['sandbox', 'live']).optional(),
  EMAIL_PROVIDER: z.enum(['resend', 'local-log']).default('resend'),
  AUDIO_REVIEW_MODE: z.enum(['automatic_release', 'manual']).default('manual'),
  BRAND_NAME: optionalSetting(120),
  SUPPORT_EMAIL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().email().optional(),
  ),
  COMMERCIAL_READY: z.enum(['true', 'false']).optional(),
  DELIVERY_ESTIMATE: optionalSetting(500),
  REVISION_POLICY: optionalSetting(2_000),
  REFUND_POLICY: optionalSetting(2_000),
  USAGE_LICENSE: optionalSetting(2_000),
  TERMS_URL: optionalUrl,
  PRIVACY_URL: optionalUrl,
  POLICY_VERSION: optionalSetting(100),
  LOCAL_STORAGE_PATH: z.string().default('./var/storage'),
  STORAGE_PROVIDER: z.enum(['local', 's3']).optional(),
  STORAGE_S3_BUCKET: z.string().optional(),
  STORAGE_S3_REGION: z.string().optional(),
  STORAGE_S3_ENDPOINT: optionalUrl,
  STORAGE_S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).optional(),
  STORAGE_S3_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_S3_SECRET_ACCESS_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_TEXT_MODEL: z.string().optional(),
  OPENROUTER_TEXT_MAX_TOKENS: z.coerce.number().int().min(1).max(65536).default(8192),
  OPENROUTER_MUSIC_MODEL: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_MUSIC_MODEL: z.string().trim().min(1).default('lyria-3.5'),
  OPENROUTER_COVER_TEXT_MODEL: z.string().optional(),
  OPENROUTER_COVER_REFERENCE_MODEL: z.string().optional(),
  ABACATEPAY_API_KEY: z.string().optional(),
  ABACATEPAY_PRODUCT_ID: z.string().optional(),
  ABACATEPAY_WEBHOOK_SECRET: z.string().optional(),
  ABACATEPAY_REQUIRE_WEBHOOK_SIGNATURE: z.enum(['true', 'false']).optional(),
  ABACATEPAY_WEBHOOK_URL: z.string().optional(),
});
export type Env = z.infer<typeof envSchema>;
export const parseEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const platformPort = source.PORT?.trim();
  const parsed = envSchema.safeParse(platformPort ? { ...source, API_PORT: platformPort } : source);
  if (!parsed.success)
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    if (env.MUSIC_PROVIDER === 'google' && !env.GOOGLE_API_KEY?.trim())
      throw new Error('Google production configuration is required');
    if (
      env.MUSIC_PROVIDER === 'openrouter' &&
      (!env.OPENROUTER_API_KEY || !env.OPENROUTER_TEXT_MODEL || !env.OPENROUTER_MUSIC_MODEL)
    )
      throw new Error('OpenRouter production configuration is required');
    if (!env.OPENROUTER_API_KEY || !env.OPENROUTER_TEXT_MODEL)
      throw new Error('OpenRouter production configuration is required');
    if (
      env.PAYMENT_PROVIDER === 'abacatepay' &&
      (!env.ABACATEPAY_API_KEY || !env.ABACATEPAY_PRODUCT_ID || !env.ABACATEPAY_WEBHOOK_SECRET)
    )
      throw new Error('AbacatePay production configuration is required');
    if (!env.OPENROUTER_COVER_TEXT_MODEL || !env.OPENROUTER_COVER_REFERENCE_MODEL)
      throw new Error('OpenRouter cover production configuration is required');
  }
  readStorageConfig(env);
  readPaymentConfig(env);
  return env;
};
