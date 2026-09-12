import {
  readEmailConfig,
  readStorageConfig,
  readPaymentConfig,
  type EmailConfig,
  type StorageConfig,
  type PaymentConfig,
} from '@resenha/providers';

export type MusicProviderName = 'openrouter' | 'google';

export type WorkerConfig = {
  databaseUrl: string;
  workerId: string;
  pollIntervalMs: number;
  lockTimeoutMs: number;
  concurrency: number;
  storagePath: string;
  storage: StorageConfig;
  reviewMode: 'automatic_release' | 'manual';
  webUrl: string;
  tokenPepper: string;
  musicProvider: MusicProviderName;
  musicModel: string;
  openRouterApiKey: string;
  openRouterMusicModel: string;
  openRouterTextModel: string;
  openRouterTextMaxTokens: number;
  googleApiKey: string;
  googleMusicModel: string;
  openRouterCoverTextModel?: string;
  openRouterCoverReferenceModel?: string;
  email: EmailConfig;
  payment?: PaymentConfig;
};

const positiveInt = (value: string | undefined, fallback: number, name: string): number => {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
};

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const textMaxTokens = (value: string | undefined): number => {
  const parsed = Number(value ?? 8192);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_536)
    throw new Error('OPENROUTER_TEXT_MAX_TOKENS must be an integer between 1 and 65536');
  return parsed;
};

export const readWorkerConfig = (env: NodeJS.ProcessEnv): WorkerConfig => {
  const isProduction = env.NODE_ENV === 'production';
  const providerValue = env.MUSIC_PROVIDER?.trim() || 'openrouter';
  if (providerValue !== 'openrouter' && providerValue !== 'google')
    throw new Error('MUSIC_PROVIDER must be openrouter or google');
  const musicProvider = providerValue as MusicProviderName;
  const googleMusicModel = env.GOOGLE_MUSIC_MODEL?.trim() || 'lyria-3.5';
  const openRouterMusicModel = env.OPENROUTER_MUSIC_MODEL?.trim() ?? '';
  const googleApiKey = env.GOOGLE_API_KEY?.trim() ?? '';
  const email = readEmailConfig(env);
  const payment = readPaymentConfig(env);
  const reviewMode = env.AUDIO_REVIEW_MODE ?? 'manual';
  if (!['manual', 'automatic_release'].includes(reviewMode))
    throw new Error('AUDIO_REVIEW_MODE must be manual or automatic_release');
  if (isProduction && (!env.OPENROUTER_COVER_TEXT_MODEL || !env.OPENROUTER_COVER_REFERENCE_MODEL))
    throw new Error('OpenRouter cover production configuration is required');
  if (isProduction && payment.provider !== 'disabled' && !payment.apiKey)
    throw new Error('Payment reconciliation credentials are required');
  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    workerId: env.WORKER_ID ?? `worker-${process.pid}`,
    pollIntervalMs: positiveInt(env.WORKER_POLL_INTERVAL_MS, 1000, 'WORKER_POLL_INTERVAL_MS'),
    lockTimeoutMs: positiveInt(env.JOB_LOCK_TIMEOUT_MS, 300_000, 'JOB_LOCK_TIMEOUT_MS'),
    concurrency: positiveInt(env.WORKER_CONCURRENCY, 1, 'WORKER_CONCURRENCY'),
    storagePath: env.LOCAL_STORAGE_PATH ?? './var/storage',
    storage: readStorageConfig(env),
    // Human approval is the safe default; automatic delivery is an explicit opt-in.
    reviewMode: reviewMode as WorkerConfig['reviewMode'],
    webUrl: env.WEB_URL ?? 'http://localhost:5175',
    tokenPepper: required(env, 'CUSTOMER_ACCESS_TOKEN_PEPPER'),
    musicProvider,
    musicModel:
      musicProvider === 'google'
        ? googleMusicModel
        : isProduction
          ? required(env, 'OPENROUTER_MUSIC_MODEL')
          : openRouterMusicModel,
    openRouterApiKey: isProduction
      ? required(env, 'OPENROUTER_API_KEY')
      : (env.OPENROUTER_API_KEY?.trim() ?? ''),
    openRouterMusicModel:
      isProduction && musicProvider === 'openrouter'
        ? required(env, 'OPENROUTER_MUSIC_MODEL')
        : openRouterMusicModel,
    openRouterTextModel: isProduction
      ? required(env, 'OPENROUTER_TEXT_MODEL')
      : (env.OPENROUTER_TEXT_MODEL?.trim() ?? ''),
    openRouterTextMaxTokens: textMaxTokens(env.OPENROUTER_TEXT_MAX_TOKENS),
    googleApiKey:
      isProduction && musicProvider === 'google' ? required(env, 'GOOGLE_API_KEY') : googleApiKey,
    googleMusicModel,
    openRouterCoverTextModel: env.OPENROUTER_COVER_TEXT_MODEL || undefined,
    openRouterCoverReferenceModel: env.OPENROUTER_COVER_REFERENCE_MODEL || undefined,
    email,
    payment,
  };
};
