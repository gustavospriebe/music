import {
  audioJobPayloadSchema,
  coverJobPayloadSchema,
  lyricsJobPayloadSchema,
  notifyJobPayloadSchema,
} from '@resenha/contracts';
import {
  claimNextJob,
  completeJob,
  markInterruptedAiCalls,
  JobLeaseLostError,
  reconcileDuePayments,
  releaseStaleJobs,
  renewJobLease,
  withJobLease,
  type ClaimedJob,
  type ReleasedJob,
} from '@resenha/database';
import { createStorage, createPaymentProvider, type LyricsProvider } from '@resenha/providers';
import type { Pool } from 'pg';
import { failAudioOrder, processAudioJob } from './audio.js';
import { cleanupExpiredCoverReferences, processCoverJob } from './cover.js';
import { processLyricsJob, restoreLyricsOrder } from './lyrics.js';
import { jobLogContext, sanitizeError } from './log.js';
import { processNotificationJob } from './notify.js';
import { workerError } from './ai-call.js';
import type { WorkerConfig } from './config.js';
export { readWorkerConfig, type MusicProviderName, type WorkerConfig } from './config.js';
export { processLyricsJob, settleLyricsJob } from './lyrics.js';
export { sanitizeError, jobLogContext } from './log.js';
export type { AudioJobPayload } from '@resenha/contracts';
export {
  createGoogleMusicProvider,
  createOpenRouterMusicProvider,
  detectAudioMime,
  generateGoogleMusicOnce,
  generateMusicOnce,
  processAudioJob,
  type MusicAttempt,
  type MusicGeneration,
  type MusicProvider,
  type MusicResult,
} from './audio.js';
export {
  cleanupExpiredCoverReferences,
  createOpenRouterCoverProvider,
  generateCoverOnce,
  processCoverJob,
  type CoverGeneration,
  type CoverInput,
  type CoverProvider,
} from './cover.js';
export { deliveryEmail, processNotificationJob } from './notify.js';

const parsePayload = <T>(
  schema: { safeParse: (value: unknown) => { success: boolean } },
  payload: T,
): void => {
  if (!schema.safeParse(payload).success) throw workerError('JOB_PAYLOAD_INVALID');
};

const restoreReleased = async (pool: Pool, released: ReleasedJob): Promise<void> => {
  if (released.status !== 'failed') return;
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select id from orders where id=$1 for update', [released.order_id]);
    const current = await client.query(
      "select id from generation_jobs where id=$1 and status='failed' for update",
      [released.id],
    );
    if (current.rowCount) {
      if (released.type === 'generate_lyrics')
        await restoreLyricsOrder(client, { orderId: released.order_id, payload: released.payload });
      if (released.type === 'generate_audio')
        await failAudioOrder(client, {
          id: released.id,
          orderId: released.order_id,
          type: released.type,
          payload: released.payload,
          attempts: 0,
          maxAttempts: 1,
          leaseToken: '',
        });
      if (released.type === 'generate_cover')
        await client.query(
          "update album_covers set status='failed',last_error=$2,updated_at=now() where order_id=$1 and status='processing'",
          [released.order_id, released.last_error],
        );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};

const settleFailure = async (
  pool: Pool,
  job: ClaimedJob,
  error: unknown,
): Promise<'failed' | 'retry_scheduled'> =>
  withJobLease(pool, job, async (client) => {
    await markInterruptedAiCalls(client, [job.id]);
    const unknown = await client.query(
      "select 1 from ai_calls where job_id=$1 and status='unknown' limit 1",
      [job.id],
    );
    const terminal =
      typeof error === 'object' && error !== null && 'terminal' in error && error.terminal === true;
    const failed = terminal || Boolean(unknown.rowCount) || job.attempts >= job.maxAttempts;
    const message = unknown.rowCount ? 'AI_RESULT_UNKNOWN' : sanitizeError(error);
    if (failed) {
      if (job.type === 'generate_audio') await failAudioOrder(client, job);
      if (job.type === 'generate_lyrics') await restoreLyricsOrder(client, job);
    }
    await client.query(
      `update generation_jobs set status=$2,last_error=$3,run_at=now()+($4*interval '1 second'),
       locked_at=null,locked_by=null,lease_token=null,lease_expires_at=null,updated_at=now() where id=$1`,
      [
        job.id,
        failed ? 'failed' : 'pending',
        message,
        Math.min(300, 5 * 2 ** Math.max(0, job.attempts - 1)),
      ],
    );
    return failed ? 'failed' : 'retry_scheduled';
  });

export const createWorker = ({
  pool,
  config,
  lyrics,
}: {
  pool: Pool;
  config: WorkerConfig;
  lyrics?: LyricsProvider;
}) => {
  let active = 0;
  const storage = createStorage(config.storage);
  let nextReconciliation = 0;
  const processOne = async (): Promise<boolean> => {
    const job = await claimNextJob(pool, config.workerId, config.lockTimeoutMs);
    if (!job) return false;
    const startedAt = Date.now();
    const controller = new AbortController();
    let renewing = false;
    let renewal: Promise<void> = Promise.resolve();
    const heartbeat = setInterval(
      () => {
        if (renewing) return;
        renewing = true;
        renewal = renewJobLease(pool, job, config.lockTimeoutMs)
          .then((ok) => {
            if (!ok) controller.abort();
          })
          .catch(() => controller.abort())
          .finally(() => {
            renewing = false;
          });
      },
      Math.max(10, Math.floor(config.lockTimeoutMs / 3)),
    );
    try {
      if (job.type === 'generate_lyrics') {
        parsePayload(lyricsJobPayloadSchema, job.payload);
        await processLyricsJob(pool, job, config, lyrics, controller.signal);
      } else if (job.type === 'generate_audio') {
        parsePayload(audioJobPayloadSchema, job.payload);
        await processAudioJob(pool, job, config, undefined, undefined, storage, controller.signal);
      } else if (job.type === 'generate_cover') {
        parsePayload(coverJobPayloadSchema, job.payload);
        await processCoverJob(pool, job, config, undefined, storage, controller.signal);
      } else if (job.type === 'deliver_notify') {
        parsePayload(notifyJobPayloadSchema, job.payload);
        await processNotificationJob(pool, job, config);
      } else throw workerError('JOB_PAYLOAD_INVALID');
      await completeJob(pool, job);
      console.info(jobLogContext(job, 'completed', Date.now() - startedAt), 'worker job completed');
    } catch (error) {
      const lost =
        error instanceof JobLeaseLostError ||
        (typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'JOB_LEASE_LOST');
      if (!lost) {
        try {
          const result = await settleFailure(pool, job, error);
          console.warn(
            jobLogContext(
              job,
              result === 'failed' ? 'permanently_failed' : 'retry_scheduled',
              Date.now() - startedAt,
              error,
            ),
            'worker execution settled',
          );
        } catch (failure) {
          if (!(failure instanceof JobLeaseLostError)) throw failure;
        }
      }
    } finally {
      clearInterval(heartbeat);
      await renewal;
    }
    return true;
  };
  return {
    sanitizeError,
    tick: async (): Promise<void> => {
      for (const job of await releaseStaleJobs(pool, config.lockTimeoutMs))
        await restoreReleased(pool, job);
      await cleanupExpiredCoverReferences(pool, storage);
      if (config.payment && Date.now() >= nextReconciliation) {
        nextReconciliation = Date.now() + 30_000;
        const payment = config.payment;
        await reconcileDuePayments(
          pool,
          (name, environment) => createPaymentProvider(payment, name, environment),
          { provider: config.musicProvider, model: config.musicModel },
          { limit: 5 },
        );
      }
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
