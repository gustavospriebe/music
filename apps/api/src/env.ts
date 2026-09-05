import { z } from 'zod';
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
  MUSIC_PROVIDER: z.enum(['openrouter']).default('openrouter'),
  PAYMENT_PROVIDER: z.enum(['mercadopago']).default('mercadopago'),
  EMAIL_PROVIDER: z.enum(['resend']).default('resend'),
  AUDIO_REVIEW_MODE: z.enum(['automatic', 'manual']).default('automatic'),
  LOCAL_STORAGE_PATH: z.string().default('./var/storage'),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_TEXT_MODEL: z.string().optional(),
  OPENROUTER_MUSIC_MODEL: z.string().optional(),
  OPENROUTER_COVER_TEXT_MODEL: z.string().optional(),
  OPENROUTER_COVER_REFERENCE_MODEL: z.string().optional(),
  MERCADO_PAGO_ACCESS_TOKEN: z.string().optional(),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().optional(),
  MERCADO_PAGO_WEBHOOK_URL: z.string().optional(),
});
export type Env = z.infer<typeof envSchema>;
export const parseEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success)
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    if (!env.OPENROUTER_API_KEY || !env.OPENROUTER_TEXT_MODEL || !env.OPENROUTER_MUSIC_MODEL)
      throw new Error('OpenRouter production configuration is required');
    if (!env.MERCADO_PAGO_ACCESS_TOKEN || !env.MERCADO_PAGO_WEBHOOK_SECRET)
      throw new Error('Mercado Pago production configuration is required');
    if (!env.OPENROUTER_COVER_TEXT_MODEL || !env.OPENROUTER_COVER_REFERENCE_MODEL)
      throw new Error('OpenRouter cover production configuration is required');
  }
  return env;
};
