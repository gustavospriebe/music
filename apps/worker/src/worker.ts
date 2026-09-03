import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { generatedLyricsSchema } from '@resenha/contracts';
import { assertTransition, createAccessToken, hashToken, makeMusicPrompt } from '@resenha/domain';
import {
  claimNextJob,
  completeJob,
  failJob,
  releaseStaleJobs,
  retryJob,
  type ClaimedJob,
} from '@resenha/database';
import type { Pool } from 'pg';

export type WorkerConfig = {
  databaseUrl: string;
  workerId: string;
  pollIntervalMs: number;
  lockTimeoutMs: number;
  concurrency: number;
  storagePath: string;
  reviewMode: 'automatic' | 'manual';
  webUrl: string;
  tokenPepper: string;
  openRouterApiKey: string;
  openRouterMusicModel: string;
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
  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    workerId: env.WORKER_ID ?? `worker-${process.pid}`,
    pollIntervalMs: positiveInt(env.WORKER_POLL_INTERVAL_MS, 1000, 'WORKER_POLL_INTERVAL_MS'),
    lockTimeoutMs: positiveInt(env.JOB_LOCK_TIMEOUT_MS, 300_000, 'JOB_LOCK_TIMEOUT_MS'),
    concurrency: positiveInt(env.WORKER_CONCURRENCY, 1, 'WORKER_CONCURRENCY'),
    storagePath: env.LOCAL_STORAGE_PATH ?? './var/storage',
    // Human approval is the safe default; automatic delivery is an explicit opt-in.
    reviewMode: env.AUDIO_REVIEW_MODE === 'automatic' ? 'automatic' : 'manual',
    webUrl: env.WEB_URL ?? 'http://localhost:5175',
    tokenPepper: required(env, 'CUSTOMER_ACCESS_TOKEN_PEPPER'),
    openRouterApiKey: required(env, 'OPENROUTER_API_KEY'),
    openRouterMusicModel: required(env, 'OPENROUTER_MUSIC_MODEL'),
    resendApiKey: resendApiKey || undefined,
    emailFrom: env.EMAIL_FROM ?? 'Música da Resenha <onboarding@resend.dev>',
  };
};

export const sanitizeError = (error: unknown): string =>
  (error instanceof Error ? error.message : 'unknown worker error')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 500);

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

export type MusicGeneration = { bytes: Buffer; mime: string; externalId: string };
export type MusicProvider = { generate: (prompt: string) => Promise<MusicGeneration> };

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
    let lastError: Error = new Error('OpenRouter music produced no result');
    for (let sing = 1; sing <= maxSings; sing += 1) {
      try {
        return await generateMusicOnce(config, prompt);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const blocked = /PROHIBITED_CONTENT|no audio|failed \((429|5\d\d)\)/i.test(
          lastError.message,
        );
        if (!blocked) throw lastError;
        console.warn({ sing, maxSings }, 'filtro de conteúdo bloqueou; tentando novamente');
        await new Promise((done) => setTimeout(done, 3_000 * sing));
      }
    }
    throw lastError;
  },
});

const generateMusicOnce = async (
  config: { apiKey: string; model: string; webUrl: string },
  prompt: string,
): Promise<MusicGeneration> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);
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
      throw new Error(
        `OpenRouter music failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`,
      );
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const audioChunks: string[] = [];
    let buffer = '';
    let externalId = '';
    let upstreamError = '';
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
        const choice = chunk.choices?.[0];
        if (choice?.delta?.audio?.data) audioChunks.push(choice.delta.audio.data);
        if (choice?.message?.audio?.data) audioChunks.push(choice.message.audio.data);
      }
    }
    if (!audioChunks.length)
      throw new Error(
        `OpenRouter music returned no audio${upstreamError ? `: ${upstreamError}` : ''}`,
      );
    const bytes = Buffer.from(audioChunks.join(''), 'base64');
    return { bytes, mime: detectAudioMime(bytes).mime, externalId };
  } finally {
    clearTimeout(timeout);
  }
};

type OrderRow = { id: string; public_id: string; status: Parameters<typeof assertTransition>[0] };

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

const processAudioJob = async (
  pool: Pool,
  job: ClaimedJob,
  config: WorkerConfig,
): Promise<void> => {
  const music = createOpenRouterMusicProvider({
    apiKey: config.openRouterApiKey,
    model: config.openRouterMusicModel,
    webUrl: config.webUrl,
  });
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
  for (const variant of [1, 2] as const) {
    if (completedVariants.has(variant)) continue;
    // Instruções extras (prefixos de variante) aumentam falsos positivos do filtro
    // de áudio; o modelo já produz faixas distintas a cada chamada (sem seed fixa).
    const generation = await music.generate(basePrompt);
    const { mime, ext } = detectAudioMime(generation.bytes);
    const key = `orders/${order.public_id}/audio-${variant}.${ext}`;
    await writeLocalAsset(config.storagePath, key, generation.bytes);
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

  const readyOrder = { ...order, status: 'audio_generating' } as OrderRow;
  const finalStatus = config.reviewMode === 'manual' ? 'review_required' : 'delivered';
  await transitionOrder(pool, readyOrder, finalStatus);
  if (finalStatus === 'delivered') {
    const story = await pool.query('select data from story_sessions where order_id=$1', [order.id]);
    const recipient = (story.rows[0]?.data as { buyerEmail?: string } | null)?.buyerEmail;
    if (recipient) await deliveryEmail(pool, config, order.id, recipient, order.public_id);
  }
};

export const createWorker = ({ pool, config }: { pool: Pool; config: WorkerConfig }) => {
  let active = 0;

  const processOne = async (): Promise<boolean> => {
    const job = await claimNextJob(pool, config.workerId);
    if (!job) return false;
    try {
      if (job.payload === null || typeof job.payload !== 'object')
        throw new Error('Invalid job payload');
      if (job.maxAttempts < job.attempts) throw new Error('Job retry limit exceeded');
      await processAudioJob(pool, job, config);
      await completeJob(pool, job.id);
      console.info({ jobId: job.id }, 'worker job completed');
    } catch (error) {
      const message = sanitizeError(error);
      if (job.attempts >= job.maxAttempts) {
        await failJob(pool, job.id, message);
        if (job.type === 'generate_audio')
          await pool.query(
            "update orders set status='failed', updated_at=now() where id=$1 and status='audio_generating'",
            [job.orderId],
          );
        console.error({ jobId: job.id, error: message }, 'worker job permanently failed');
      } else {
        await retryJob(pool, job, message);
        console.warn(
          { jobId: job.id, attempts: job.attempts, error: message },
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
