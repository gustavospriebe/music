import { randomUUID } from 'node:crypto';
import { createDb } from '@resenha/database';
import { settleLyricsJob, type WorkerConfig } from '@resenha/worker/worker';
import type { LyricsProvider } from '@resenha/providers';

type Pool = ReturnType<typeof createDb>['pool'];

export const testWorkerConfig = (databaseUrl: string): WorkerConfig => ({
  databaseUrl,
  workerId: 'api-lyrics-test',
  pollIntervalMs: 1_000,
  lockTimeoutMs: 300_000,
  concurrency: 1,
  storagePath: './var/flow-test-storage',
  storage: { kind: 'local', basePath: './var/flow-test-storage' },
  reviewMode: 'manual',
  webUrl: 'http://localhost:5175',
  tokenPepper: 'a-local-token-pepper-with-more-than-32-chars',
  musicProvider: 'openrouter',
  musicModel: 'test-music-model',
  openRouterApiKey: 'test-key',
  openRouterMusicModel: 'test-music-model',
  openRouterTextModel: 'test-model',
  openRouterTextMaxTokens: 8192,
  googleApiKey: '',
  googleMusicModel: 'lyria-3.5',
  email: { kind: 'local-log', from: 'test@example.test', basePath: './var/emails' },
});

export const settlePublicLyrics = async (
  pool: Pool,
  publicId: string,
  lyrics: LyricsProvider,
  databaseUrl: string,
): Promise<void> => {
  const { rows } = await pool.query<{
    id: string;
    order_id: string;
    type: string;
    attempts: number;
    max_attempts: number;
    payload: unknown;
  }>(
    `select j.id, j.order_id, j.type, j.attempts, j.max_attempts, j.payload
     from generation_jobs j
     join orders o on o.id = j.order_id
     where o.public_id = $1 and j.type = 'generate_lyrics'
     order by j.created_at desc, j.id desc
     limit 1`,
    [publicId],
  );
  const job = rows[0];
  if (!job) throw new Error('generate_lyrics job missing');
  const leaseToken = randomUUID();
  const claim = await pool.query(
    `update generation_jobs set status='processing', attempts=attempts+1, locked_at=now(),locked_by='api-lyrics-test',lease_token=$2,lease_expires_at=now()+interval '5 minutes' where id=$1 and status='pending' and attempts<max_attempts returning attempts`,
    [job.id, leaseToken],
  );
  if (!claim.rows[0]) throw new Error('generate_lyrics job was not claimable');
  await settleLyricsJob(
    pool,
    {
      id: job.id,
      orderId: job.order_id,
      type: job.type,
      attempts: claim.rows[0].attempts,
      leaseToken,
      maxAttempts: job.max_attempts,
      payload: job.payload,
    },
    testWorkerConfig(databaseUrl),
    lyrics,
  );
};

export const latestGeneratedNumber = async (pool: Pool, publicId: string): Promise<number> => {
  const { rows } = await pool.query<{ number: number }>(
    `select lv.number from lyric_versions lv
     join orders o on o.id = lv.order_id
     where o.public_id = $1
     order by lv.number desc
     limit 1`,
    [publicId],
  );
  const number = rows[0]?.number;
  if (!number) throw new Error('lyric version missing');
  return number;
};
