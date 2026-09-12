import {
  audioJobPayloadSchema,
  lyricsContentSchema,
  type AudioJobPayload,
  type OrderStatus,
} from '@resenha/contracts';
import { withJobLease, type ClaimedJob } from '@resenha/database';
import { assertTransition, makeMusicPrompt, hashToken, stableDeliveryToken } from '@resenha/domain';
import {
  createStorage,
  createGoogleMusicProvider,
  createOpenRouterMusicProvider,
  detectAudioMime,
  type MusicProvider,
  type StorageProvider,
} from '@resenha/providers';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  beginAiCall,
  completeAiCall,
  failAiCall,
  recordAiUsage,
  usageOfError,
  workerError,
  type AiCall,
} from './ai-call.js';
import { validateAudio } from './audio-validation.js';
import type { MusicProviderName, WorkerConfig } from './config.js';
export {
  createGoogleMusicProvider,
  createOpenRouterMusicProvider,
  detectAudioMime,
  generateGoogleMusicOnce,
  generateMusicOnce,
  type MusicAttempt,
  type MusicGeneration,
  type MusicProvider,
  type MusicResult,
} from '@resenha/providers';
export type { AudioJobPayload };

type ProductionOrder = {
  id: string;
  public_id: string;
  status: OrderStatus;
  current_production_id: string | null;
};

export const failAudioOrder = async (client: PoolClient, job: ClaimedJob): Promise<void> => {
  const row = (
    await client.query<ProductionOrder>(
      'select id,public_id,status,current_production_id from orders where id=$1 for update',
      [job.orderId],
    )
  ).rows[0];
  const payload = audioJobPayloadSchema.safeParse(job.payload);
  if (
    !row ||
    row.status !== 'audio_generating' ||
    !payload.success ||
    payload.data.productionId !== row.current_production_id
  )
    return;
  assertTransition(row.status, 'failed');
  await client.query("update orders set status='failed',updated_at=now() where id=$1", [
    job.orderId,
  ]);
  if (row.current_production_id)
    await client.query(
      "update productions set status='failed',updated_at=now() where id=$1 and status in ('queued','processing')",
      [row.current_production_id],
    );
  await client.query("insert into order_events(order_id,type,data) values($1,'audio_failed',$2)", [
    job.orderId,
    JSON.stringify({ jobId: job.id }),
  ]);
  await client.query(
    "insert into analytics_events(event,product_type,order_public_id) values('failed','custom_song',$1)",
    [row.public_id],
  );
};

const selectionFor = (
  payload: AudioJobPayload,
  config: WorkerConfig,
): { provider: MusicProviderName; model: string } => {
  const provider = payload.provider ?? config.musicProvider;
  const model =
    payload.model ??
    (provider === 'google' ? config.googleMusicModel : config.openRouterMusicModel);
  if (!model) throw workerError('AI_CONFIGURATION_MISSING');
  return { provider, model };
};

const finalizeProduction = async (
  pool: Pool,
  job: ClaimedJob,
  productionId: string,
  config: WorkerConfig,
): Promise<void> => {
  await withJobLease(pool, job, async (client) => {
    const order = (
      await client.query<ProductionOrder>(
        'select id,public_id,status,current_production_id from orders where id=$1',
        [job.orderId],
      )
    ).rows[0];
    if (
      !order ||
      order.current_production_id !== productionId ||
      !['audio_generating', 'review_required'].includes(order.status)
    )
      throw workerError('JOB_PRECONDITION_FAILED');
    const result = await client.query<{ variant: number }>(
      "select variant from audio_generations where production_id=$1 and selected and status='completed' and file_id is not null and duration_ms>=10000",
      [productionId],
    );
    if (![1, 2].every((variant) => result.rows.some((row) => row.variant === variant))) return;
    const next = config.reviewMode === 'manual' ? 'review_required' : 'delivered';
    if (order.status !== next) assertTransition(order.status, next);
    if (next === 'delivered') {
      const delivery = (
        await client.query<{
          id: string;
          token_hash: string;
          revoked_at: Date | null;
          expires_at: Date | null;
        }>(
          'select id,token_hash,revoked_at,expires_at from deliveries where order_id=$1 for update',
          [order.id],
        )
      ).rows[0];
      if (
        delivery &&
        (delivery.revoked_at || (delivery.expires_at && delivery.expires_at <= new Date()))
      )
        throw workerError('JOB_PRECONDITION_FAILED');
      const deliveryId = delivery?.id ?? randomUUID();
      const tokenHash = hashToken(
        stableDeliveryToken(deliveryId, config.tokenPepper),
        config.tokenPepper,
      );
      if (delivery && delivery.token_hash !== tokenHash)
        throw workerError('JOB_EMAIL_REVIEW_REQUIRED');
      if (delivery)
        await client.query(
          'update deliveries set production_id=$2,delivered_at=now(),updated_at=now() where id=$1',
          [deliveryId, productionId],
        );
      else
        await client.query(
          'insert into deliveries(id,order_id,production_id,token_hash,delivered_at) values($1,$2,$3,$4,now())',
          [deliveryId, order.id, productionId, tokenHash],
        );
    }
    await client.query('update orders set status=$2,updated_at=now() where id=$1', [
      order.id,
      next,
    ]);
    await client.query('update productions set status=$2,updated_at=now() where id=$1', [
      productionId,
      next === 'delivered' ? 'completed' : 'review_required',
    ]);
    await client.query(
      "insert into order_events(order_id,type,data) values($1,'production_ready',$2)",
      [order.id, JSON.stringify({ productionId, releaseMode: config.reviewMode })],
    );
    if (next === 'delivered') {
      await client.query(
        `insert into generation_jobs(type,order_id,payload,idempotency_key,max_attempts)
         values('deliver_notify',$1,'{}',$2,6) on conflict(idempotency_key) do nothing`,
        [order.id, `notification:${productionId}`],
      );
      await client.query(
        "insert into analytics_events(event,product_type,order_public_id) values('delivered','custom_song',$1)",
        [order.public_id],
      );
    }
  });
};

export const processAudioJob = async (
  pool: Pool,
  job: ClaimedJob,
  config: WorkerConfig,
  music?: MusicProvider,
  variants: readonly number[] = [1, 2],
  storage: StorageProvider = createStorage(config.storage),
  signal?: AbortSignal,
): Promise<void> => {
  const parsed = audioJobPayloadSchema.safeParse(job.payload);
  if (!parsed.success) throw workerError('JOB_PAYLOAD_INVALID');
  const payload = parsed.data;
  const selection = selectionFor(payload, config);
  const provider =
    music ??
    (selection.provider === 'google'
      ? createGoogleMusicProvider({ apiKey: config.googleApiKey, model: selection.model })
      : createOpenRouterMusicProvider({
          apiKey: config.openRouterApiKey,
          model: selection.model,
          webUrl: config.webUrl,
        }));
  const context = await withJobLease(pool, job, async (client) => {
    const order = (
      await client.query<ProductionOrder>(
        'select id,public_id,status,current_production_id from orders where id=$1',
        [job.orderId],
      )
    ).rows[0];
    if (!order || order.current_production_id !== payload.productionId)
      throw workerError('JOB_PRECONDITION_FAILED');
    const production = (
      await client.query<{
        status: string;
        provenance: string;
        content: unknown;
        approved_at: Date | null;
      }>(
        `select p.status,p.provenance,l.content,l.approved_at from productions p
       left join lyric_versions l on l.id=p.lyric_version_id and l.order_id=p.order_id
       where p.id=$1 and p.order_id=$2`,
        [payload.productionId, order.id],
      )
    ).rows[0];
    if (!production || production.provenance !== 'recorded')
      throw workerError('JOB_LEGACY_PROVENANCE');
    if (!production.approved_at) throw workerError('JOB_PRECONDITION_FAILED');
    if (order.status === 'delivered' && production.status === 'completed')
      return { order, finished: true, lyrics: lyricsContentSchema.parse(production.content) };
    if (
      !['paid', 'audio_queued', 'audio_generating', 'review_required', 'failed'].includes(
        order.status,
      )
    )
      throw workerError('JOB_PRECONDITION_FAILED');
    let status = order.status;
    if (status === 'paid' || status === 'failed') {
      assertTransition(status, 'audio_queued');
      status = 'audio_queued';
    }
    if (status === 'audio_queued') {
      assertTransition(status, 'audio_generating');
      status = 'audio_generating';
    }
    await client.query('update orders set status=$2,updated_at=now() where id=$1', [
      order.id,
      status,
    ]);
    await client.query("update productions set status='processing',updated_at=now() where id=$1", [
      payload.productionId,
    ]);
    return {
      order: { ...order, status },
      finished: false,
      lyrics: lyricsContentSchema.parse(production.content),
    };
  });
  if (context.finished) return;
  const prompt = makeMusicPrompt(context.lyrics);
  const requested = payload.variant ? [payload.variant] : variants;
  for (const variant of requested) {
    if (variant !== 1 && variant !== 2) throw workerError('JOB_PAYLOAD_INVALID');
    const generationId = await withJobLease(pool, job, async (client) => {
      const existing = await client.query(
        "select 1 from audio_generations where production_id=$1 and variant=$2 and selected and status='completed'",
        [payload.productionId, variant],
      );
      if (existing.rowCount) return null;
      const next = (
        await client.query<{ attempt: number }>(
          'select coalesce(max(attempt),0)+1 as attempt from audio_generations where production_id=$1 and variant=$2',
          [payload.productionId, variant],
        )
      ).rows[0]!.attempt;
      const id = randomUUID();
      await client.query(
        `insert into audio_generations(id,order_id,production_id,variant,status,provider,model,attempt,job_id,lease_token)
         values($1,$2,$3,$4,'processing',$5,$6,$7,$8,$9)`,
        [
          id,
          job.orderId,
          payload.productionId,
          variant,
          selection.provider,
          selection.model,
          next,
          job.id,
          job.leaseToken,
        ],
      );
      return id;
    });
    if (!generationId) continue;
    let call: AiCall | undefined;
    const startedAt = Date.now();
    let storedKey: string | undefined;
    try {
      call = await beginAiCall(pool, job, 'audio', selection.provider, selection.model);
      const result = await provider.generate(prompt, signal);
      const generation = result.generation;
      await recordAiUsage(pool, call, generation.usage, 'ok');
      const { durationMs } = await validateAudio(generation.bytes);
      const { mime, ext } = detectAudioMime(generation.bytes);
      if (ext === 'bin') throw workerError('AI_INVALID_AUDIO');
      storedKey = `orders/${context.order.public_id}/audio/${generationId}.${ext}`;
      await withJobLease(pool, job, async () => undefined);
      await storage.put(storedKey, generation.bytes, mime);
      const completedCall = call;
      await withJobLease(pool, job, async (client) => {
        const selected = await client.query(
          'select 1 from audio_generations where production_id=$1 and variant=$2 and selected',
          [payload.productionId, variant],
        );
        if (selected.rowCount) throw workerError('JOB_PRECONDITION_FAILED');
        const fileId = randomUUID();
        await client.query(
          'insert into stored_files(id,order_id,storage_key,mime_type,size_bytes) values($1,$2,$3,$4,$5)',
          [fileId, job.orderId, storedKey, mime, generation.bytes.length],
        );
        const updated = await client.query(
          `update audio_generations set status='completed',file_id=$2,external_id=$3,duration_ms=$4,selected=true,updated_at=now()
           where id=$1 and status='processing' and lease_token=$5 returning id`,
          [generationId, fileId, generation.externalId || null, durationMs, job.leaseToken],
        );
        if (!updated.rowCount) throw workerError('JOB_LEASE_LOST');
        await completeAiCall(client, completedCall, generation.externalId || null);
      });
      storedKey = undefined;
    } catch (error) {
      if (call)
        await failAiCall(pool, call, error, usageOfError(error, selection.model, startedAt));
      if (storedKey) await storage.delete(storedKey).catch(() => undefined);
      await withJobLease(pool, job, async (client) => {
        await client.query(
          "update audio_generations set status='failed',updated_at=now() where id=$1 and status='processing' and lease_token=$2",
          [generationId, job.leaseToken],
        );
      }).catch(() => undefined);
      throw error;
    }
  }
  await finalizeProduction(pool, job, payload.productionId, config);
};
