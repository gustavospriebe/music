import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { generatedLyricsSchema, storySchema } from '@resenha/contracts';
import {
  assertTransition,
  createAccessToken,
  hashToken,
  makeMusicPrompt,
  type AiUsageSample,
  type AiUsageStatus,
} from '@resenha/domain';
import {
  claimNextJob,
  completeJob,
  failJob,
  releaseStaleJobs,
  retryJob,
  type ClaimedJob,
} from '@resenha/database';
import {
  createStorage,
  readStorageConfig,
  type StorageConfig,
  type StorageProvider,
} from '@resenha/providers';
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
  openRouterApiKey: string;
  openRouterMusicModel: string;
  openRouterCoverTextModel?: string;
  openRouterCoverReferenceModel?: string;
  /** Presente => envio real via Resend. Ausente fora de produção => registro local. */
  resendApiKey?: string;
  emailFrom: string;
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

export const readWorkerConfig = (env: NodeJS.ProcessEnv): WorkerConfig => {
  const isProduction = env.NODE_ENV === 'production';
  const resendApiKey = env.RESEND_API_KEY;
  if (isProduction && !resendApiKey) throw new Error('RESEND_API_KEY is required');
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
    openRouterApiKey: required(env, 'OPENROUTER_API_KEY'),
    openRouterMusicModel: required(env, 'OPENROUTER_MUSIC_MODEL'),
    openRouterCoverTextModel: env.OPENROUTER_COVER_TEXT_MODEL || undefined,
    openRouterCoverReferenceModel: env.OPENROUTER_COVER_REFERENCE_MODEL || undefined,
    resendApiKey: resendApiKey || undefined,
    emailFrom: env.EMAIL_FROM ?? 'Música da Resenha <onboarding@resend.dev>',
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

const safeStoragePath = (basePath: string, key: string): string => {
  const root = resolve(basePath);
  const target = resolve(root, key);
  if (relative(root, target).startsWith('..')) throw new Error('Invalid storage key');
  return target;
};

const writeLocalAsset = async (basePath: string, key: string, body: Buffer): Promise<void> => {
  const target = safeStoragePath(basePath, key);
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, body);
};

export type MusicGeneration = {
  bytes: Buffer;
  mime: string;
  externalId: string;
  usage: AiUsageSample;
};
export type MusicAttempt = { sample: AiUsageSample; status: AiUsageStatus; error: string | null };
export type MusicResult = { generation: MusicGeneration; attempts: MusicAttempt[] };
export type MusicProvider = { generate: (prompt: string) => Promise<MusicResult> };

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
      const retryable = /no audio|failed \((429|5\d\d)\)/i.test(lastError.message);
      if (!retryable) throw Object.assign(lastError, { attempts });
      console.warn({ sing, maxSings }, 'tentativa de áudio falhou; tentando novamente');
      await new Promise((done) => setTimeout(done, 3_000 * sing));
    }
    throw Object.assign(lastError, { attempts });
  },
});

type SingOutcome =
  | { ok: true; bytes: Buffer; mime: string; externalId: string; usage: AiUsageSample }
  | { ok: false; error: Error; usage: AiUsageSample };

/** Exportada como seam de teste (o provider real cobra por chamada). */
export const generateMusicOnce = async (
  config: { apiKey: string; model: string; webUrl: string },
  prompt: string,
): Promise<SingOutcome> => {
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
      const detail = await response.text().catch(() => '');
      return {
        ok: false,
        error: new Error(
          `OpenRouter music failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`,
        ),
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

/** Cria (ou rotaciona, se o e-mail ainda não saiu) o link privado de entrega. */
const ensureDeliveryToken = async (
  pool: Pool,
  config: WorkerConfig,
  orderId: string,
): Promise<string> => {
  const token = createAccessToken();
  const tokenHash = hashToken(token, config.tokenPepper);
  await pool.query(
    `insert into deliveries(order_id,token_hash,delivered_at) values($1,$2,now())
     on conflict(order_id) do update set token_hash=excluded.token_hash,delivered_at=now()`,
    [orderId, tokenHash],
  );
  return token;
};

const deliveryEmail = async (
  pool: Pool,
  config: WorkerConfig,
  orderId: string,
  recipient: string,
  publicId: string,
): Promise<void> => {
  const existing = await pool.query(
    "select id from email_deliveries where order_id=$1 and template='music_delivered' and status='sent' limit 1",
    [orderId],
  );
  if (existing.rowCount) return;
  const token = await ensureDeliveryToken(pool, config, orderId);
  const link = `${config.webUrl}/entrega/${token}`;
  if (!config.resendApiKey) {
    const emailsPath = config.storagePath.replace(/storage$/, 'emails');
    await writeLocalAsset(
      emailsPath,
      `${publicId}-entrega.txt`,
      Buffer.from(
        `Para: ${recipient}\nAssunto: Sua Música da Resenha está pronta\n\nOuça as duas versões no link privado:\n${link}\n`,
      ),
    );
    await pool.query(
      "insert into email_deliveries(order_id,template,recipient,provider,status) values($1,'music_delivered',$2,'local-log','sent')",
      [orderId, recipient],
    );
    console.info(
      { orderPublicId: publicId },
      'e-mail de entrega registrado localmente (sem RESEND_API_KEY)',
    );
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let externalId: string | null = null;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${config.resendApiKey}`,
        'content-type': 'application/json',
        'idempotency-key': `music_delivered:${orderId}`,
      },
      body: JSON.stringify({
        from: config.emailFrom,
        to: [recipient],
        subject: 'Sua Música da Resenha está pronta',
        html: `<p>Sua música foi entregue! Use o link privado abaixo para ouvir e baixar as duas versões.</p><p><a href="${link}">Ouvir minhas músicas</a></p><p>Este link é privado; não compartilhe publicamente.</p>`,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Resend failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`,
      );
    }
    const body = (await response.json()) as { id?: string };
    externalId = body.id ?? null;
  } finally {
    clearTimeout(timeout);
  }
  await pool.query(
    "insert into email_deliveries(order_id,template,recipient,provider,status,external_id) values($1,'music_delivered',$2,'resend','sent',$3)",
    [orderId, recipient, externalId],
  );
  console.info({ orderPublicId: publicId }, 'delivery email sent');
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

/** Uma linha por sing do provedor, inclusive bloqueios (visibilidade do filtro). */
const recordAudioUsage = async (
  pool: Pool,
  orderId: string,
  jobId: string,
  attempt: MusicAttempt,
  jobAttempts: number,
): Promise<void> => {
  await pool.query(
    `insert into ai_usage(order_id,job_id,kind,provider,model,external_id,input_tokens,output_tokens,cost_usd,latency_ms,status,error,attempt)
     values($1,$2,'audio','openrouter',$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict do nothing`,
    [
      orderId,
      jobId,
      attempt.sample.model,
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
/** `music`/`variants` são seams de teste e contenção de custo (produção: OpenRouter, [1, 2]). */
export const processAudioJob = async (
  pool: Pool,
  job: ClaimedJob,
  config: WorkerConfig,
  music: MusicProvider = createOpenRouterMusicProvider({
    apiKey: config.openRouterApiKey,
    model: config.openRouterMusicModel,
    webUrl: config.webUrl,
  }),
  variants: readonly number[] = [1, 2],
  storage: StorageProvider = createStorage(config.storage),
): Promise<void> => {
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
      if (recipient) await deliveryEmail(pool, config, order.id, recipient, order.public_id);
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
    // Instruções extras (prefixos de variante) aumentam falsos positivos do filtro
    // de áudio; o modelo já produz faixas distintas a cada chamada (sem seed fixa).
    let result: MusicResult;
    try {
      result = await music.generate(basePrompt);
    } catch (error) {
      for (const attempt of musicAttemptsOf(error))
        await recordAudioUsage(pool, order.id, job.id, attempt, job.attempts);
      throw error;
    }
    for (const attempt of result.attempts)
      await recordAudioUsage(pool, order.id, job.id, attempt, job.attempts);
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
       values($1,$2,'completed',$3,'openrouter',$4,$5,$6)
       on conflict(order_id,variant) do update set status='completed',asset_id=excluded.asset_id,provider='openrouter',model=excluded.model,external_id=excluded.external_id,attempt=excluded.attempt,updated_at=now()`,
      [
        order.id,
        variant,
        asset.rows[0]?.id,
        config.openRouterMusicModel,
        generation.externalId || null,
        job.attempts,
      ],
    );
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
         values('delivered',(select product_type from orders where id=$1),$2,
           (select visitor_id from analytics_events where order_public_id=$2 and event='order_created' limit 1))`,
        [order.id, order.public_id],
      );
    } catch (error) {
      console.warn({ error: sanitizeError(error) }, 'analytics delivered event dropped');
    }
    const story = await pool.query('select data from story_sessions where order_id=$1', [order.id]);
    const recipient = (story.rows[0]?.data as { buyerEmail?: string } | null)?.buyerEmail;
    if (recipient) await deliveryEmail(pool, config, order.id, recipient, order.public_id);
  }
};

type CoverJobPayload = { attempt: 1 | 2 };
type CoverJobRow = {
  id: string;
  status: string;
  model: string;
  reference_asset_id: string | null;
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
       and c.created_at < now()-interval '7 days'
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
    `select c.id,c.status,c.model,c.reference_asset_id,c.cover_asset_id,o.public_id,
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
      if (job.type === 'generate_audio' || job.type === 'deliver-notify')
        await processAudioJob(pool, job, config, undefined, undefined, storage);
      else if (job.type === 'generate_cover')
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
