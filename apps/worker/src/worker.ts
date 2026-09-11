import { generatedLyricsSchema, storySchema } from '@resenha/contracts';
import {
  claimNextJob,
  completeJob,
  failJob,
  releaseStaleJobs,
  retryJob,
  type ClaimedJob,
  type EmailDeliveryMessage,
} from '@resenha/database';
import {
  assertTransition,
  hashToken,
  stableDeliveryToken,
  makeMusicPrompt,
  type AiUsageSample,
  type AiUsageStatus,
} from '@resenha/domain';
import {
  createStorage,
  createEmailProvider,
  readEmailConfig,
  type EmailConfig,
  type EmailProvider,
  readStorageConfig,
  type StorageConfig,
  type StorageProvider,
} from '@resenha/providers';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export type WorkerConfig = {
  databaseUrl: string;
  workerId: string;
  pollIntervalMs: number;
  lockTimeoutMs: number;
  concurrency: number;
  storagePath: string;
  storage: StorageConfig;
  reviewMode: 'automatic' | 'manual';
  webUrl: string;
  tokenPepper: string;
  musicProvider: MusicProviderName;
  musicModel: string;
  openRouterApiKey: string;
  openRouterMusicModel: string;
  googleApiKey: string;
  googleMusicModel: string;
  openRouterCoverTextModel?: string;
  openRouterCoverReferenceModel?: string;
  email: EmailConfig;
};

export type MusicProviderName = 'openrouter' | 'google';

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
  if (isProduction && (!env.OPENROUTER_COVER_TEXT_MODEL || !env.OPENROUTER_COVER_REFERENCE_MODEL))
    throw new Error('OpenRouter cover production configuration is required');
  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    workerId: env.WORKER_ID ?? `worker-${process.pid}`,
    pollIntervalMs: positiveInt(env.WORKER_POLL_INTERVAL_MS, 1000, 'WORKER_POLL_INTERVAL_MS'),
    lockTimeoutMs: positiveInt(env.JOB_LOCK_TIMEOUT_MS, 300_000, 'JOB_LOCK_TIMEOUT_MS'),
    concurrency: positiveInt(env.WORKER_CONCURRENCY, 1, 'WORKER_CONCURRENCY'),
    storagePath: env.LOCAL_STORAGE_PATH ?? './var/storage',
    storage: readStorageConfig(env),
    // Human approval is the safe default; automatic delivery is an explicit opt-in.
    reviewMode: env.AUDIO_REVIEW_MODE === 'automatic' ? 'automatic' : 'manual',
    webUrl: env.WEB_URL ?? 'http://localhost:5175',
    tokenPepper: required(env, 'CUSTOMER_ACCESS_TOKEN_PEPPER'),
    musicProvider,
    musicModel:
      musicProvider === 'google'
        ? googleMusicModel
        : isProduction
          ? required(env, 'OPENROUTER_MUSIC_MODEL')
          : openRouterMusicModel,
    openRouterApiKey:
      isProduction && musicProvider === 'openrouter'
        ? required(env, 'OPENROUTER_API_KEY')
        : (env.OPENROUTER_API_KEY?.trim() ?? ''),
    openRouterMusicModel:
      isProduction && musicProvider === 'openrouter'
        ? required(env, 'OPENROUTER_MUSIC_MODEL')
        : openRouterMusicModel,
    googleApiKey:
      isProduction && musicProvider === 'google' ? required(env, 'GOOGLE_API_KEY') : googleApiKey,
    googleMusicModel,
    openRouterCoverTextModel: env.OPENROUTER_COVER_TEXT_MODEL || undefined,
    openRouterCoverReferenceModel: env.OPENROUTER_COVER_REFERENCE_MODEL || undefined,
    email,
  };
};

export const sanitizeError = (error: unknown): string =>
  (error instanceof Error ? error.message : 'unknown worker error')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 500);

export const jobLogContext = (
  job: ClaimedJob,
  status: 'completed' | 'permanently_failed' | 'retry_scheduled',
  durationMs: number,
  error?: unknown,
) => ({
  jobType: job.type,
  status,
  attempt: job.attempts,
  durationMs: Math.max(0, Math.round(durationMs)),
  ...(error === undefined ? {} : { error: sanitizeError(error) }),
});

export type MusicGeneration = {
  bytes: Buffer;
  mime: string;
  externalId: string;
  usage: AiUsageSample;
};
export type MusicAttempt = { sample: AiUsageSample; status: AiUsageStatus; error: string | null };
export type MusicResult = { generation: MusicGeneration; attempts: MusicAttempt[] };
export type MusicProvider = {
  generate: (prompt: string) => Promise<MusicResult>;
  provider?: MusicProviderName;
  model?: string;
};

export type CoverGeneration = {
  bytes: Buffer;
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  usage: AiUsageSample;
};
export type CoverInput = { model: string; prompt: string; reference?: Buffer };
export type CoverProvider = { generate: (input: CoverInput) => Promise<CoverGeneration> };

const detectCoverMime = (bytes: Buffer): CoverGeneration['mime'] | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP'
  )
    return 'image/webp';
  return null;
};

/** OpenRouter Images API. Exportada como seam porque qualquer chamada real pode cobrar. */
export const generateCoverOnce = async (
  config: { apiKey: string; webUrl: string },
  input: CoverInput,
): Promise<CoverGeneration> => {
  if (!config.apiKey || !input.model)
    throw Object.assign(new Error('OpenRouter cover is unavailable: configure API key and model'), {
      terminal: true,
    });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  const startedAt = Date.now();
  const blankUsage = (): AiUsageSample => ({
    requestId: null,
    model: input.model,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: null,
    latencyMs: Date.now() - startedAt,
  });
  try {
    const response = await fetch('https://openrouter.ai/api/v1/images', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
        'http-referer': config.webUrl,
        'x-title': 'Musica da Resenha',
      },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        resolution: '1K',
        aspect_ratio: '1:1',
        n: 1,
        ...(input.reference
          ? {
              input_references: [
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${input.reference.toString('base64')}`,
                  },
                },
              ],
            }
          : {}),
      }),
    });
    if (!response.ok)
      throw Object.assign(new Error(`OpenRouter cover failed (${response.status})`), {
        terminal: true,
        usage: blankUsage(),
      });
    const body = (await response.json()) as {
      data?: Array<{ b64_json?: string; media_type?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number | string };
    };
    const encoded = body.data?.[0]?.b64_json;
    if (!encoded || encoded.length > 28_000_000)
      throw Object.assign(new Error('OpenRouter cover returned no valid image'), {
        terminal: true,
        usage: blankUsage(),
      });
    const bytes = Buffer.from(encoded, 'base64');
    const mime = detectCoverMime(bytes);
    const declared = body.data?.[0]?.media_type;
    if (!mime || (declared && declared !== mime))
      throw Object.assign(new Error('OpenRouter cover returned an unsupported image'), {
        terminal: true,
        usage: blankUsage(),
      });
    return {
      bytes,
      mime,
      usage: {
        requestId: null,
        model: input.model,
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
        costUsd: body.usage?.cost === undefined ? null : String(body.usage.cost),
        latencyMs: Date.now() - startedAt,
      },
    };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'terminal' in error) throw error;
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      terminal: true,
      usage: blankUsage(),
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const createOpenRouterCoverProvider = (config: {
  apiKey: string;
  webUrl: string;
}): CoverProvider => ({ generate: (input) => generateCoverOnce(config, input) });

/** Detecta o contêiner real retornado pelo modelo (o format pedido pode ser ignorado). */
export const detectAudioMime = (bytes: Buffer): { mime: string; ext: string } => {
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WAVE'
  )
    return { mime: 'audio/wav', ext: 'wav' };
  if (bytes.subarray(0, 3).toString('latin1') === 'ID3') return { mime: 'audio/mpeg', ext: 'mp3' };
  if (bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)
    return { mime: 'audio/mpeg', ext: 'mp3' };
  if (bytes.subarray(0, 4).toString() === 'OggS') return { mime: 'audio/ogg', ext: 'ogg' };
  return { mime: 'application/octet-stream', ext: 'bin' };
};

/**
 * Gera áudio via OpenRouter (chat completions com saída de áudio). O contrato oficial
 * exige streaming: os blocos chegam em `choices[0].delta.audio.data` (base64).
 */
export const createOpenRouterMusicProvider = (config: {
  apiKey: string;
  model: string;
  webUrl: string;
}): MusicProvider => ({
  provider: 'openrouter',
  model: config.model,
  generate: async (prompt) => {
    const maxSings = 5;
    // O filtro de áudio é probabilístico: dois bloqueios seguidos encerram o orçamento
    // (sem alegar determinismo) e o erro sai como terminal — nova tentativa só com
    // nova edição/admin, sem as 30 queimas no mesmo prompt.
    let blockedCount = 0;
    const blockedBudget = 2;
    const attempts: MusicAttempt[] = [];
    let lastError: Error = new Error('OpenRouter music produced no result');
    for (let sing = 1; sing <= maxSings; sing += 1) {
      const outcome = await generateMusicOnce(config, prompt);
      if (outcome.ok) {
        attempts.push({ sample: outcome.usage, status: 'ok', error: null });
        return {
          generation: {
            bytes: outcome.bytes,
            mime: outcome.mime,
            externalId: outcome.externalId,
            usage: outcome.usage,
          },
          attempts,
        };
      }
      lastError = outcome.error;
      const blocked = /PROHIBITED_CONTENT/i.test(lastError.message);
      attempts.push({
        sample: outcome.usage,
        status: blocked ? 'blocked' : 'error',
        error: sanitizeError(lastError),
      });
      if (blocked) {
        blockedCount += 1;
        if (blockedCount >= blockedBudget)
          throw Object.assign(lastError, { attempts, terminal: true });
        console.warn({ sing, blockedBudget }, 'áudio bloqueado pelo filtro; nova tentativa curta');
        await new Promise((done) => setTimeout(done, 3_000 * sing));
        continue;
      }
      const retryable = /no audio|failed \((408|429|5\d\d)\)/i.test(lastError.message);
      if (!retryable) throw Object.assign(lastError, { attempts });
      console.warn({ sing, maxSings }, 'tentativa de áudio falhou; tentando novamente');
      await new Promise((done) => setTimeout(done, 3_000 * sing));
    }
    throw Object.assign(lastError, { attempts });
  },
});

/** Keep retry classification and diagnostics independent of raw provider payloads. */
const musicHttpError = (status: number): Error => {
  const terminal = status >= 400 && status < 500 && ![408, 429].includes(status);
  const message =
    status === 402
      ? 'A geração está indisponível por limite do provedor. O suporte precisa revisar a configuração.'
      : status === 401 || status === 403
        ? 'A geração está indisponível. O suporte precisa revisar a autorização do provedor.'
        : terminal
          ? 'A solicitação de áudio foi recusada. O suporte precisa revisar os dados e a configuração do provedor.'
          : `OpenRouter music failed (${status})`;
  return Object.assign(new Error(message), { terminal, httpStatus: status });
};

type SingOutcome =
  | { ok: true; bytes: Buffer; mime: string; externalId: string; usage: AiUsageSample }
  | { ok: false; error: Error; usage: AiUsageSample };

/** Exportada como seam de teste (o provider real cobra por chamada). */
export const generateMusicOnce = async (
  config: { apiKey: string; model: string; webUrl: string },
  prompt: string,
): Promise<SingOutcome> => {
  if (!config.apiKey || !config.model)
    throw Object.assign(new Error('OpenRouter music is unavailable: configure API key and model'), {
      terminal: true,
    });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);
  const startedAt = Date.now();
  const blankUsage = (): AiUsageSample => ({
    requestId: null,
    model: config.model,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: null,
    latencyMs: Date.now() - startedAt,
  });
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
        'http-referer': config.webUrl,
        'x-title': 'Musica da Resenha',
      },
      body: JSON.stringify({
        model: config.model,
        modalities: ['text', 'audio'],
        audio: { format: 'wav' },
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => undefined);
      return {
        ok: false,
        error: musicHttpError(response.status),
        usage: blankUsage(),
      };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const audioChunks: string[] = [];
    let buffer = '';
    let externalId = '';
    let upstreamError = '';
    let streamedUsage: AiUsageSample | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice('data:'.length).trim();
        if (!data || data === '[DONE]') continue;
        let chunk: {
          id?: string;
          error?: { message?: string };
          usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number | string };
          choices?: Array<{
            delta?: { audio?: { data?: string } };
            message?: { audio?: { data?: string } };
          }>;
        };
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        if (chunk.id) externalId = chunk.id;
        if (chunk.error?.message) upstreamError = chunk.error.message;
        if (chunk.usage)
          streamedUsage = {
            requestId: externalId || null,
            model: config.model,
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
            costUsd: chunk.usage.cost === undefined ? null : String(chunk.usage.cost),
            latencyMs: Date.now() - startedAt,
          };
        const choice = chunk.choices?.[0];
        if (choice?.delta?.audio?.data) audioChunks.push(choice.delta.audio.data);
        if (choice?.message?.audio?.data) audioChunks.push(choice.message.audio.data);
      }
    }
    if (!audioChunks.length)
      return {
        ok: false,
        error: new Error(
          `OpenRouter music returned no audio${upstreamError ? `: ${upstreamError}` : ''}`,
        ),
        usage: streamedUsage ?? { ...blankUsage(), requestId: externalId || null },
      };
    const bytes = Buffer.from(audioChunks.join(''), 'base64');
    return {
      ok: true,
      bytes,
      mime: detectAudioMime(bytes).mime,
      externalId,
      usage: streamedUsage ?? { ...blankUsage(), requestId: externalId || null },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
      usage: blankUsage(),
    };
  } finally {
    clearTimeout(timeout);
  }
};

type GoogleMusicError = Error & {
  terminal?: boolean;
  category?: 'safety' | 'no_audio' | 'unsupported_audio' | 'timeout' | 'http';
  httpStatus?: number;
};

const googleMusicError = (
  message: string,
  details: Pick<GoogleMusicError, 'terminal' | 'category' | 'httpStatus'> = {},
): GoogleMusicError => Object.assign(new Error(message), details);

const googleHttpError = (status: number): GoogleMusicError => {
  const retryable = status === 408 || status === 429 || status >= 500;
  return googleMusicError(
    retryable
      ? `Google music failed (${status})`
      : 'Google music request was rejected by the provider',
    { terminal: !retryable, category: 'http', httpStatus: status },
  );
};

const isGoogleSafetyRefusal = (body: unknown): boolean => {
  if (typeof body !== 'object' || body === null) return false;
  const error = 'error' in body ? body.error : undefined;
  const text =
    typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : '';
  return /safety|content|prohibited|blocked|refus/i.test(text);
};

const googleAudioData = (body: unknown): string | null => {
  if (typeof body !== 'object' || body === null) return null;
  const outputAudio = 'output_audio' in body ? body.output_audio : undefined;
  if (typeof outputAudio === 'string' && outputAudio) return outputAudio;
  if (typeof outputAudio === 'object' && outputAudio !== null) {
    if ('data' in outputAudio && typeof outputAudio.data === 'string' && outputAudio.data)
      return outputAudio.data;
    if (
      'audio_data' in outputAudio &&
      typeof outputAudio.audio_data === 'string' &&
      outputAudio.audio_data
    )
      return outputAudio.audio_data;
  }
  const steps = 'steps' in body && Array.isArray(body.steps) ? body.steps : [];
  for (const step of steps) {
    if (typeof step !== 'object' || step === null || !('content' in step)) continue;
    const content = Array.isArray(step.content) ? step.content : [];
    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue;
      const type = 'type' in block ? block.type : undefined;
      if (type !== undefined && type !== 'audio') continue;
      if ('data' in block && typeof block.data === 'string' && block.data) return block.data;
      if ('audio_data' in block && typeof block.audio_data === 'string' && block.audio_data)
        return block.audio_data;
      if ('audio' in block && typeof block.audio === 'object' && block.audio !== null) {
        if ('data' in block.audio && typeof block.audio.data === 'string' && block.audio.data)
          return block.audio.data;
      }
    }
  }
  return null;
};

/** One Google Interactions request. It never retries because a full song may be billable. */
export const generateGoogleMusicOnce = async (
  config: { apiKey: string; model: string },
  prompt: string,
): Promise<SingOutcome> => {
  if (!config.apiKey || !config.model)
    throw Object.assign(new Error('Google music is unavailable: configure API key and model'), {
      terminal: true,
    });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);
  const startedAt = Date.now();
  const blankUsage = (requestId: string | null = null): AiUsageSample => ({
    requestId,
    model: config.model,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: null,
    latencyMs: Date.now() - startedAt,
  });
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-goog-api-key': config.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: config.model, input: prompt, store: false }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, error: googleHttpError(response.status), usage: blankUsage() };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return {
        ok: false,
        error: googleMusicError('Google music returned an invalid response', {
          terminal: true,
          category: 'no_audio',
        }),
        usage: blankUsage(),
      };
    }
    const requestId =
      typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string'
        ? body.id
        : null;
    const encoded = googleAudioData(body);
    if (!encoded) {
      const safety = isGoogleSafetyRefusal(body);
      return {
        ok: false,
        error: googleMusicError(
          safety
            ? 'Google music generation was refused by safety or content policy'
            : 'Google music returned no audio',
          { terminal: true, category: safety ? 'safety' : 'no_audio' },
        ),
        usage: blankUsage(requestId),
      };
    }
    const bytes = Buffer.from(encoded, 'base64');
    const detected = detectAudioMime(bytes);
    if (detected.mime === 'application/octet-stream')
      return {
        ok: false,
        error: googleMusicError('Google music returned an unsupported audio container', {
          terminal: true,
          category: 'unsupported_audio',
        }),
        usage: blankUsage(requestId),
      };
    return {
      ok: true,
      bytes,
      mime: detected.mime,
      externalId: requestId ?? '',
      usage: { ...blankUsage(requestId), costUsd: '0.08' },
    };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    return {
      ok: false,
      error: googleMusicError(
        aborted ? 'Google music request timed out' : 'Google music request failed',
        { category: aborted ? 'timeout' : 'http' },
      ),
      usage: blankUsage(),
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const createGoogleMusicProvider = (config: {
  apiKey: string;
  model: string;
}): MusicProvider => ({
  provider: 'google',
  model: config.model,
  generate: async (prompt) => {
    const outcome = await generateGoogleMusicOnce(config, prompt);
    if (outcome.ok)
      return {
        generation: {
          bytes: outcome.bytes,
          mime: outcome.mime,
          externalId: outcome.externalId,
          usage: outcome.usage,
        },
        attempts: [{ sample: outcome.usage, status: 'ok', error: null }],
      };
    const error = outcome.error as GoogleMusicError;
    const status: AiUsageStatus =
      error.category === 'safety' ? 'blocked' : error.terminal ? 'rejected' : 'error';
    throw Object.assign(error, {
      attempts: [
        {
          sample: outcome.usage,
          status,
          error: sanitizeError(error),
        },
      ],
    });
  },
});

type OrderRow = { id: string; public_id: string; status: Parameters<typeof assertTransition>[0] };

/** Falha de áudio esgotada/terminal: `failed` por transição de domínio + evento público. */
const failAudioOrder = async (pool: Pool, orderId: string): Promise<void> => {
  const result = await pool.query<{ id: string; public_id: string; status: string }>(
    'select id, public_id, status from orders where id=$1',
    [orderId],
  );
  const row = result.rows[0];
  if (!row || row.status !== 'audio_generating') return;
  const order = await transitionOrder(
    pool,
    { id: row.id, public_id: row.public_id, status: row.status } as OrderRow,
    'failed',
  );
  try {
    const visitor = await pool.query<{ visitor_id: string | null }>(
      'select visitor_id from analytics_events where order_public_id=$1 and event=$2 limit 1',
      [order.public_id, 'order_created'],
    );
    await pool.query(
      `insert into analytics_events(event,product_type,order_public_id,visitor_id)
       values('failed',(select product_type from orders where id=$1),$2,$3)`,
      [order.id, order.public_id, visitor.rows[0]?.visitor_id ?? null],
    );
  } catch (error) {
    console.warn({ error: sanitizeError(error) }, 'analytics failed event dropped');
  }
};

const transitionOrder = async (
  pool: Pool,
  order: OrderRow,
  next: Parameters<typeof assertTransition>[1],
): Promise<OrderRow> => {
  if (order.status === next) return order;
  assertTransition(order.status, next);
  await pool.query('update orders set status=$1, updated_at=now() where id=$2', [next, order.id]);
  return { ...order, status: next };
};

type EmailIntent = {
  id: string;
  recipient: string;
  provider: EmailConfig['kind'];
  status: string;
  message: EmailDeliveryMessage;
};
/** Commit a stable intent before I/O. Concurrent attempts reuse the provider's idempotency key. */
export const deliveryEmail = async (
  pool: Pool,
  config: WorkerConfig,
  orderId: string,
  recipient: string,
  provider: EmailProvider = createEmailProvider(config.email),
): Promise<void> => {
  const client = await pool.connect();
  let intent: EmailIntent | undefined;
  let token = '';
  try {
    await client.query('begin');
    const order = await client.query('select status from orders where id=$1 for update', [orderId]);
    if (order.rows[0]?.status !== 'delivered') throw new Error('Order is not delivered');
    const sent = await client.query(
      "select id from email_deliveries where order_id=$1 and template='music_delivered' and status='sent' limit 1",
      [orderId],
    );
    if (sent.rowCount) {
      await client.query('commit');
      return;
    }
    intent = (
      await client.query<EmailIntent>(
        "select id,recipient,provider,status,message from email_deliveries where order_id=$1 and template='music_delivered' and message is not null",
        [orderId],
      )
    ).rows[0];
    const delivery = (
      await client.query<{
        id: string;
        token_hash: string;
        revoked_at: Date | null;
        expires_at: Date | null;
      }>(
        'select id,token_hash,revoked_at,expires_at from deliveries where order_id=$1 for update',
        [orderId],
      )
    ).rows[0];
    if (
      delivery &&
      (delivery.revoked_at || (delivery.expires_at && delivery.expires_at <= new Date()))
    )
      throw Object.assign(new Error('Delivery access is revoked or expired'), { terminal: true });
    const deliveryId = intent?.message.deliveryId ?? delivery?.id ?? randomUUID();
    token = stableDeliveryToken(deliveryId, config.tokenPepper);
    const tokenHash = hashToken(token, config.tokenPepper);
    if (intent) {
      if (!delivery || delivery.id !== deliveryId || delivery.token_hash !== tokenHash)
        throw Object.assign(new Error('Delivery access changed; notification requires review'), {
          terminal: true,
        });
    } else {
      // Never rotate an existing untracked link: its previous send outcome is unknown.
      if (delivery && delivery.token_hash !== tokenHash)
        throw Object.assign(new Error('Legacy delivery notification requires review'), {
          terminal: true,
        });
      if (!delivery)
        await client.query(
          'insert into deliveries(id,order_id,token_hash,delivered_at) values($1,$2,$3,now())',
          [deliveryId, orderId, tokenHash],
        );
      const message: EmailDeliveryMessage = {
        deliveryId,
        webUrl: config.webUrl.replace(/\/$/, ''),
        from: config.email.from,
        subject: 'Sua música está pronta',
        textTemplate:
          'Ouça e baixe suas duas versões no link privado:\n{{delivery_link}}\nEste link é privado; não compartilhe publicamente.',
        htmlTemplate:
          '<p>Sua música está pronta! Ouça e baixe suas duas versões.</p><p><a href="{{delivery_link}}">Ouvir minhas músicas</a></p><p>Este link é privado; não compartilhe publicamente.</p>',
      };
      intent = (
        await client.query<EmailIntent>(
          `insert into email_deliveries(order_id,template,recipient,provider,status,message)
         values($1,'music_delivered',$2,$3,'pending',$4) returning id,recipient,provider,status,message`,
          [orderId, recipient, provider.kind, JSON.stringify(message)],
        )
      ).rows[0];
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  if (!intent) throw new Error('Email intent was not persisted');
  if (intent.provider !== provider.kind)
    throw new Error('Pending email provider changed; restore its configuration before retry');
  const link = `${intent.message.webUrl}/entrega/${token}`;
  const escapedLink = link
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  const result = await provider.send(
    {
      from: intent.message.from,
      to: intent.recipient,
      subject: intent.message.subject,
      text: intent.message.textTemplate.replaceAll('{{delivery_link}}', link),
      html: intent.message.htmlTemplate.replaceAll('{{delivery_link}}', escapedLink),
    },
    `music_delivered:${intent.id}`,
  );
  await pool.query(
    "update email_deliveries set status='sent',external_id=$2,updated_at=now() where id=$1",
    [intent.id, result.externalId],
  );
  console.info({ provider: intent.provider }, 'delivery notification recorded');
};

/** Sings anexadas ao erro pelo provider (fronteira interna; forma validada campo a campo). */
const isMusicAttempt = (value: unknown): value is MusicAttempt => {
  if (typeof value !== 'object' || value === null) return false;
  if (!('sample' in value) || !('status' in value) || !('error' in value)) return false;
  const { sample, status, error } = value;
  if (typeof sample !== 'object' || sample === null) return false;
  if (
    !('requestId' in sample) ||
    !('model' in sample) ||
    !('inputTokens' in sample) ||
    !('outputTokens' in sample) ||
    !('costUsd' in sample) ||
    !('latencyMs' in sample)
  )
    return false;
  const { requestId, model, inputTokens, outputTokens, costUsd, latencyMs } = sample;
  if (requestId !== null && typeof requestId !== 'string') return false;
  if (typeof model !== 'string') return false;
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') return false;
  if (costUsd !== null && typeof costUsd !== 'string') return false;
  if (typeof latencyMs !== 'number') return false;
  if (!['ok', 'blocked', 'error', 'rejected'].includes(status as string)) return false;
  return error === null || typeof error === 'string';
};
const musicAttemptsOf = (error: unknown): MusicAttempt[] => {
  if (typeof error !== 'object' || error === null || !('attempts' in error)) return [];
  const { attempts } = error;
  return Array.isArray(attempts) ? attempts.filter(isMusicAttempt) : [];
};

export type AudioJobPayload = {
  variant?: 1 | 2;
  provider?: MusicProviderName;
  model?: string;
};

const audioSelection = (
  payload: unknown,
  config: WorkerConfig,
): { provider: MusicProviderName; model: string } => {
  const value = typeof payload === 'object' && payload !== null ? payload : {};
  const providerValue = 'provider' in value ? value.provider : undefined;
  if (providerValue !== undefined && providerValue !== 'openrouter' && providerValue !== 'google')
    throw Object.assign(new Error('Invalid audio provider'), { terminal: true });
  const provider = (providerValue ?? 'openrouter') as MusicProviderName;
  const modelValue = 'model' in value ? value.model : undefined;
  if (modelValue !== undefined && (typeof modelValue !== 'string' || !modelValue.trim()))
    throw Object.assign(new Error('Invalid audio model'), { terminal: true });
  const model =
    typeof modelValue === 'string' && modelValue.trim()
      ? modelValue.trim()
      : provider === 'google'
        ? config.googleMusicModel
        : config.openRouterMusicModel;
  if (!model)
    throw Object.assign(new Error(`Audio provider ${provider} is unavailable: configure model`), {
      terminal: true,
    });
  return { provider, model };
};

/** Uma linha por sing do provedor, inclusive bloqueios (visibilidade do filtro). */
const recordAudioUsage = async (
  pool: Pool,
  orderId: string,
  jobId: string,
  attempt: MusicAttempt,
  jobAttempts: number,
  provider: MusicProviderName,
  model: string,
): Promise<void> => {
  await pool.query(
    `insert into ai_usage(order_id,job_id,kind,provider,model,external_id,input_tokens,output_tokens,cost_usd,latency_ms,status,error,attempt)
     values($1,$2,'audio',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     on conflict do nothing`,
    [
      orderId,
      jobId,
      provider,
      model,
      attempt.sample.requestId,
      attempt.sample.inputTokens,
      attempt.sample.outputTokens,
      attempt.sample.costUsd,
      attempt.sample.latencyMs,
      attempt.status,
      attempt.error,
      jobAttempts,
    ],
  );
};
/** `music`/`variants` são seams de teste e contenção de custo. */
export const processAudioJob = async (
  pool: Pool,
  job: ClaimedJob,
  config: WorkerConfig,
  music: MusicProvider | undefined = undefined,
  variants: readonly number[] = [1, 2],
  storage: StorageProvider = createStorage(config.storage),
): Promise<void> => {
  const selection = audioSelection(job.payload, config);
  const selectedMusic =
    music ??
    (selection.provider === 'google'
      ? createGoogleMusicProvider({ apiKey: config.googleApiKey, model: selection.model })
      : createOpenRouterMusicProvider({
          apiKey: config.openRouterApiKey,
          model: selection.model,
          webUrl: config.webUrl,
        }));
  const orderResult = await pool.query<OrderRow>(
    'select id, public_id, status from orders where id=$1',
    [job.orderId],
  );
  const order = orderResult.rows[0];
  if (!order) throw new Error('Order for job was not found');
  const existingAudio = await pool.query(
    "select count(*)::int as count from audio_generations where order_id=$1 and status='completed'",
    [order.id],
  );
  if (
    Number(existingAudio.rows[0]?.count) === 2 &&
    ['review_required', 'delivered'].includes(order.status)
  ) {
    if (order.status === 'delivered') {
      const story = await pool.query('select data from story_sessions where order_id=$1', [
        order.id,
      ]);
      const recipient = (story.rows[0]?.data as { buyerEmail?: string } | null)?.buyerEmail;
      if (recipient) await deliveryEmail(pool, config, order.id, recipient);
    }
    return;
  }
  let current: OrderRow = order;
  if (current.status === 'paid' || current.status === 'failed')
    current = await transitionOrder(pool, current, 'audio_queued');
  if (current.status === 'audio_queued')
    current = await transitionOrder(pool, current, 'audio_generating');
  if (current.status !== 'audio_generating' && current.status !== 'review_required')
    throw new Error(`Order is not ready for audio generation (${order.status})`);

  const lyrics = await pool.query(
    'select content from lyric_versions where order_id=$1 and approved_at is not null order by number desc limit 1',
    [order.id],
  );
  if (!lyrics.rowCount) throw new Error('Approved lyrics are required before audio generation');
  const approvedLyrics = generatedLyricsSchema.parse(lyrics.rows[0]?.content);
  const basePrompt = makeMusicPrompt(approvedLyrics);

  const completedVariants = new Set(
    (
      await pool.query(
        "select variant from audio_generations where order_id=$1 and status='completed'",
        [order.id],
      )
    ).rows.map((row: { variant: number }) => Number(row.variant)),
  );
  for (const variant of variants) {
    if (completedVariants.has(variant)) continue;
    const claimed = await pool.query(
      `insert into audio_generations(order_id,variant,status,provider,model,attempt)
       values($1,$2,'processing',$3,$4,$5)
       on conflict(order_id,variant) do update set status='processing',asset_id=null,external_id=null,provider=excluded.provider,model=excluded.model,attempt=excluded.attempt,updated_at=now()
       where audio_generations.status <> 'completed'
       returning id`,
      [order.id, variant, selection.provider, selection.model, job.attempts],
    );
    if (!claimed.rowCount) continue;
    try {
      // Instruções extras (prefixos de variante) aumentam falsos positivos do filtro
      // de áudio; o modelo já produz faixas distintas a cada chamada (sem seed fixa).
      let result: MusicResult;
      try {
        result = await selectedMusic.generate(basePrompt);
      } catch (error) {
        for (const attempt of musicAttemptsOf(error))
          await recordAudioUsage(
            pool,
            order.id,
            job.id,
            attempt,
            job.attempts,
            selection.provider,
            selection.model,
          );
        throw error;
      }
      for (const attempt of result.attempts)
        await recordAudioUsage(
          pool,
          order.id,
          job.id,
          attempt,
          job.attempts,
          selection.provider,
          selection.model,
        );
      const generation = result.generation;
      const { mime, ext } = detectAudioMime(generation.bytes);
      const key = `orders/${order.public_id}/audio-${variant}.${ext}`;
      await storage.put(key, generation.bytes, mime);
      const asset = await pool.query<{ id: string }>(
        `insert into stored_files(order_id,storage_key,mime_type,size_bytes)
       values($1,$2,$3,$4)
       on conflict(storage_key) do update set mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,updated_at=now()
       returning id`,
        [order.id, key, mime, generation.bytes.length],
      );
      await pool.query(
        `insert into audio_generations(order_id,variant,status,asset_id,provider,model,external_id,attempt)
       values($1,$2,'completed',$3,$4,$5,$6,$7)
       on conflict(order_id,variant) do update set status='completed',asset_id=excluded.asset_id,provider=excluded.provider,model=excluded.model,external_id=excluded.external_id,attempt=excluded.attempt,updated_at=now()`,
        [
          order.id,
          variant,
          asset.rows[0]?.id,
          selection.provider,
          selection.model,
          generation.externalId || null,
          job.attempts,
        ],
      );
    } catch (error) {
      await pool.query(
        "update audio_generations set status='failed',updated_at=now() where order_id=$1 and variant=$2 and status='processing' and attempt=$3",
        [order.id, variant, job.attempts],
      );
      throw error;
    }
  }

  // Execuções parciais (seam de contenção/teste) nunca entregam: só o par 1+2 fecha a venda.
  const finished = await pool.query(
    "select variant from audio_generations where order_id=$1 and status='completed'",
    [order.id],
  );
  const finishedSet = new Set(finished.rows.map((row: { variant: number }) => Number(row.variant)));
  if (![1, 2].every((variant) => finishedSet.has(variant))) return;
  const readyOrder = { ...order, status: 'audio_generating' } as OrderRow;
  const finalStatus = config.reviewMode === 'manual' ? 'review_required' : 'delivered';
  await transitionOrder(pool, readyOrder, finalStatus);
  if (finalStatus === 'delivered') {
    try {
      await pool.query(
        `insert into analytics_events(event,product_type,order_public_id,visitor_id)
         values('delivered',(select product_type from orders where id=$1),$2::varchar,
           (select visitor_id from analytics_events where order_public_id=$2 and event='order_created' limit 1))`,
        [order.id, order.public_id],
      );
    } catch (error) {
      console.warn({ error: sanitizeError(error) }, 'analytics delivered event dropped');
    }
    const story = await pool.query('select data from story_sessions where order_id=$1', [order.id]);
    const recipient = (story.rows[0]?.data as { buyerEmail?: string } | null)?.buyerEmail;
    if (recipient) await deliveryEmail(pool, config, order.id, recipient);
  }
};

type CoverJobPayload = { attempt: 1 | 2 };
type CoverJobRow = {
  id: string;
  status: string;
  model: string;
  reference_asset_id: string | null;
  had_reference: boolean;
  cover_asset_id: string | null;
  public_id: string;
  reference_key: string | null;
};

const coverPayload = (payload: unknown): CoverJobPayload => {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('attempt' in payload) ||
    (payload.attempt !== 1 && payload.attempt !== 2)
  )
    throw Object.assign(new Error('Invalid cover job payload'), { terminal: true });
  return { attempt: payload.attempt };
};

const cleanupCoverReference = async (
  pool: Pool,
  storage: StorageProvider,
  cover: Pick<CoverJobRow, 'id' | 'reference_asset_id' | 'reference_key'>,
): Promise<void> => {
  if (!cover.reference_asset_id || !cover.reference_key) return;
  await storage.delete(cover.reference_key);
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      'update album_covers set reference_asset_id=null,updated_at=now() where id=$1',
      [cover.id],
    );
    await client.query('delete from stored_files where id=$1', [cover.reference_asset_id]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};

/** Safety net for abandoned jobs; successful and terminal attempts erase immediately. */
export const cleanupExpiredCoverReferences = async (
  pool: Pool,
  storage: StorageProvider,
): Promise<number> => {
  const expired = await pool.query<{
    id: string;
    reference_asset_id: string;
    reference_key: string;
  }>(
    `select c.id,c.reference_asset_id,f.storage_key as reference_key
     from album_covers c
     join stored_files f on f.id=c.reference_asset_id
     where c.reference_asset_id is not null
       and f.created_at < now()-interval '7 days'
     order by c.created_at
     limit 100`,
  );
  let removed = 0;
  for (const cover of expired.rows) {
    try {
      await cleanupCoverReference(pool, storage, cover);
      removed += 1;
    } catch (error) {
      console.warn({ error: sanitizeError(error) }, 'expired cover reference cleanup failed');
    }
  }
  return removed;
};

const makeCoverPrompt = (storyValue: unknown, lyricsValue: unknown): string => {
  const story = storySchema.parse(storyValue);
  const lyrics = generatedLyricsSchema.parse(lyricsValue);
  const context = {
    title: lyrics.title,
    subject: story.subjectName,
    occasion: story.occasion,
    genre: lyrics.musicalDirection.genre,
    mood: lyrics.musicalDirection.mood,
    summary: lyrics.summary,
    memories: story.facts.slice(0, 5),
    lyricExcerpt: lyrics.fullLyrics.slice(0, 1_200),
  };
  return [
    'Crie uma capa de single original, quadrada, expressiva e presenteável.',
    'Use composição editorial brasileira, contraste forte e espaço visual limpo.',
    'Não inclua logotipos, celebridades, artistas reconhecíveis, nudez ou imitação de estilo de artista vivo.',
    'Não dependa de texto legível dentro da imagem; o título será aplicado pela interface.',
    'Se houver foto, preserve a identidade geral das pessoas sem inventar outras pessoas.',
    `Contexto: ${JSON.stringify(context)}`,
  ].join('\n');
};

const usageFromCoverError = (error: unknown): AiUsageSample | null => {
  if (typeof error !== 'object' || error === null || !('usage' in error)) return null;
  const usage = error.usage;
  if (typeof usage !== 'object' || usage === null || !('model' in usage)) return null;
  return usage as AiUsageSample;
};

export const processCoverJob = async (
  pool: Pool,
  job: ClaimedJob,
  config: WorkerConfig,
  provider: CoverProvider = createOpenRouterCoverProvider({
    apiKey: config.openRouterApiKey,
    webUrl: config.webUrl,
  }),
  storage: StorageProvider = createStorage(config.storage),
): Promise<void> => {
  const { attempt } = coverPayload(job.payload);
  const result = await pool.query<CoverJobRow>(
    `select c.id,c.status,c.model,c.reference_asset_id,c.had_reference,c.cover_asset_id,o.public_id,
            reference.storage_key as reference_key
     from album_covers c
     join orders o on o.id=c.order_id
     left join stored_files reference on reference.id=c.reference_asset_id
     where c.order_id=$1 and c.attempt=$2`,
    [job.orderId, attempt],
  );
  const cover = result.rows[0];
  if (!cover) throw Object.assign(new Error('Cover attempt was not found'), { terminal: true });
  if (cover.status === 'completed') {
    await cleanupCoverReference(pool, storage, cover);
    return;
  }
  if (cover.status !== 'pending')
    throw Object.assign(new Error('Cover provider call was already claimed'), { terminal: true });
  const claimed = await pool.query(
    "update album_covers set status='processing',updated_at=now() where id=$1 and status='pending' returning id",
    [cover.id],
  );
  if (!claimed.rowCount)
    throw Object.assign(new Error('Cover provider call was already claimed'), { terminal: true });

  let generation: CoverGeneration | undefined;
  try {
    if (!config.openRouterCoverTextModel || !config.openRouterCoverReferenceModel)
      throw Object.assign(new Error('Cover models are not configured'), { terminal: true });
    const [storyResult, lyricsResult] = await Promise.all([
      pool.query('select data from story_sessions where order_id=$1', [job.orderId]),
      pool.query(
        'select content from lyric_versions where order_id=$1 and approved_at is not null order by number desc limit 1',
        [job.orderId],
      ),
    ]);
    if (!storyResult.rowCount || !lyricsResult.rowCount)
      throw Object.assign(
        new Error('Story and approved lyrics are required for cover generation'),
        {
          terminal: true,
        },
      );
    if (cover.had_reference && !cover.reference_key)
      throw Object.assign(
        new Error('A foto de referência foi removida. Envie uma nova foto antes de retomar.'),
        { terminal: true },
      );
    const reference = cover.reference_key ? await storage.get(cover.reference_key) : undefined;
    generation = await provider.generate({
      model: cover.model,
      prompt: makeCoverPrompt(storyResult.rows[0]?.data, lyricsResult.rows[0]?.content),
      ...(reference ? { reference } : {}),
    });
    const extension =
      generation.mime === 'image/png' ? 'png' : generation.mime === 'image/webp' ? 'webp' : 'jpg';
    const key = `orders/${cover.public_id}/cover-${attempt}.${extension}`;
    await storage.put(key, generation.bytes, generation.mime);
    const client = await pool.connect();
    try {
      await client.query('begin');
      const asset = await client.query<{ id: string }>(
        `insert into stored_files(order_id,storage_key,mime_type,size_bytes)
         values($1,$2,$3,$4)
         on conflict(storage_key) do update set mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,updated_at=now()
         returning id`,
        [job.orderId, key, generation.mime, generation.bytes.length],
      );
      await client.query(
        "update album_covers set status='completed',cover_asset_id=$1,last_error=null,updated_at=now() where id=$2",
        [asset.rows[0]?.id, cover.id],
      );
      await client.query(
        `insert into ai_usage(order_id,job_id,kind,provider,model,external_id,input_tokens,output_tokens,cost_usd,latency_ms,status,error,attempt)
         values($1,$2,'album_cover','openrouter',$3,$4,$5,$6,$7,$8,'ok',null,$9)`,
        [
          job.orderId,
          job.id,
          generation.usage.model,
          generation.usage.requestId,
          generation.usage.inputTokens,
          generation.usage.outputTokens,
          generation.usage.costUsd,
          generation.usage.latencyMs,
          attempt,
        ],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const message = sanitizeError(error);
    const usage = generation?.usage ?? usageFromCoverError(error);
    await pool.query(
      "update album_covers set status='failed',last_error=$1,updated_at=now() where id=$2 and status!='completed'",
      [message, cover.id],
    );
    if (usage)
      await pool.query(
        `insert into ai_usage(order_id,job_id,kind,provider,model,external_id,input_tokens,output_tokens,cost_usd,latency_ms,status,error,attempt)
         values($1,$2,'album_cover','openrouter',$3,$4,$5,$6,$7,$8,'error',$9,$10)`,
        [
          job.orderId,
          job.id,
          usage.model,
          usage.requestId,
          usage.inputTokens,
          usage.outputTokens,
          usage.costUsd,
          usage.latencyMs,
          message,
          attempt,
        ],
      );
    await cleanupCoverReference(pool, storage, cover).catch((cleanupError) =>
      console.warn(
        { error: sanitizeError(cleanupError) },
        'terminal cover reference cleanup failed',
      ),
    );
    throw Object.assign(error instanceof Error ? error : new Error(message), { terminal: true });
  }
  await cleanupCoverReference(pool, storage, cover).catch((error) =>
    console.warn({ error: sanitizeError(error) }, 'completed cover reference cleanup failed'),
  );
};

export const processNotificationJob = async (
  pool: Pool,
  job: ClaimedJob,
  config: WorkerConfig,
  provider?: EmailProvider,
): Promise<void> => {
  const [order, story] = await Promise.all([
    pool.query('select status from orders where id=$1', [job.orderId]),
    pool.query('select data from story_sessions where order_id=$1', [job.orderId]),
  ]);
  if (order.rows[0]?.status !== 'delivered')
    throw Object.assign(new Error('A entrega ainda não foi concluída.'), { terminal: true });
  const audio = await pool.query(
    "select variant from audio_generations where order_id=$1 and status='completed' and asset_id is not null",
    [job.orderId],
  );
  if (![1, 2].every((variant) => audio.rows.some((row) => row.variant === variant)))
    throw Object.assign(
      new Error('As duas versões de áudio precisam estar prontas para notificar.'),
      { terminal: true },
    );
  const recipient = (story.rows[0]?.data as { buyerEmail?: string } | undefined)?.buyerEmail;
  if (!recipient)
    throw Object.assign(new Error('O destinatário da entrega não está disponível.'), {
      terminal: true,
    });
  await deliveryEmail(pool, config, job.orderId, recipient, provider);
};

export const createWorker = ({ pool, config }: { pool: Pool; config: WorkerConfig }) => {
  let active = 0;
  const storage = createStorage(config.storage);

  const processOne = async (): Promise<boolean> => {
    const job = await claimNextJob(pool, config.workerId);
    if (!job) return false;
    const startedAt = Date.now();
    try {
      if (job.payload === null || typeof job.payload !== 'object')
        throw new Error('Invalid job payload');
      if (job.maxAttempts < job.attempts) throw new Error('Job retry limit exceeded');
      if (job.type === 'deliver-notify') await processNotificationJob(pool, job, config);
      else if (job.type === 'generate_audio') {
        const order = await pool.query('select status from orders where id=$1', [job.orderId]);
        if (order.rows[0]?.status === 'delivered') await processNotificationJob(pool, job, config);
        else {
          const payload = job.payload as { variant?: unknown };
          if (payload.variant !== undefined && payload.variant !== 1 && payload.variant !== 2)
            throw Object.assign(new Error('Invalid audio variant'), { terminal: true });
          await processAudioJob(
            pool,
            job,
            config,
            undefined,
            payload.variant ? [payload.variant as number] : undefined,
            storage,
          );
        }
      } else if (job.type === 'generate_cover')
        await processCoverJob(pool, job, config, undefined, storage);
      else throw Object.assign(new Error(`Unsupported job type: ${job.type}`), { terminal: true });
      await completeJob(pool, job.id);
      console.info(jobLogContext(job, 'completed', Date.now() - startedAt), 'worker job completed');
    } catch (error) {
      const message = sanitizeError(error);
      const terminal =
        typeof error === 'object' &&
        error !== null &&
        'terminal' in error &&
        (error as { terminal?: unknown }).terminal === true;
      if (terminal || job.attempts >= job.maxAttempts) {
        await failJob(pool, job.id, message);
        if (job.type === 'generate_audio') await failAudioOrder(pool, job.orderId);
        console.error(
          jobLogContext(job, 'permanently_failed', Date.now() - startedAt, error),
          'worker job permanently failed',
        );
      } else {
        await retryJob(pool, job, message);
        console.warn(
          jobLogContext(job, 'retry_scheduled', Date.now() - startedAt, error),
          'worker job retry scheduled',
        );
      }
    }
    return true;
  };

  return {
    sanitizeError,
    tick: async (): Promise<void> => {
      await releaseStaleJobs(pool, config.lockTimeoutMs);
      await cleanupExpiredCoverReferences(pool, storage);
      const capacity = Math.max(0, config.concurrency - active);
      if (!capacity) return;
      active += capacity;
      try {
        await Promise.all(Array.from({ length: capacity }, () => processOne()));
      } finally {
        active -= capacity;
      }
    },
    waitForIdle: async (): Promise<void> => {
      while (active > 0) await new Promise((resolve) => setTimeout(resolve, 20));
    },
  };
};
