import {
  coverJobPayloadSchema,
  creativeBriefSchema,
  lyricsContentSchema,
} from '@resenha/contracts';
import { withJobLease, type ClaimedJob } from '@resenha/database';
import {
  createOpenRouterCoverProvider,
  createStorage,
  type CoverProvider,
  type StorageProvider,
} from '@resenha/providers';
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
import type { WorkerConfig } from './config.js';
import { sanitizeError } from './log.js';
export {
  createOpenRouterCoverProvider,
  generateCoverOnce,
  type CoverGeneration,
  type CoverInput,
  type CoverProvider,
} from '@resenha/providers';

type CoverRow = {
  id: string;
  status: string;
  model: string;
  reference_file_id: string | null;
  had_reference: boolean;
  public_id: string;
  reference_key: string | null;
  story: unknown;
  lyrics: unknown;
};
const cleanupCoverReference = async (
  pool: Pool,
  storage: StorageProvider,
  cover: Pick<CoverRow, 'id' | 'reference_file_id' | 'reference_key'>,
  job?: ClaimedJob,
): Promise<void> => {
  const referenceId = cover.reference_file_id;
  const referenceKey = cover.reference_key;
  if (!referenceId || !referenceKey) return;
  const remove = async (client: PoolClient): Promise<void> => {
    const current = await client.query(
      'select id from album_covers where id=$1 and reference_file_id=$2 for update',
      [cover.id, referenceId],
    );
    if (!current.rowCount) return;
    // Hold the ownership lock through DELETE: a stale execution cannot erase a resumed reference.
    await storage.delete(referenceKey);
    await client.query(
      'update album_covers set reference_file_id=null,updated_at=now() where id=$1 and reference_file_id=$2',
      [cover.id, referenceId],
    );
    await client.query('delete from stored_files where id=$1', [referenceId]);
  };
  if (job) {
    await withJobLease(pool, job, remove);
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('begin');
    await remove(client);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};
export const cleanupExpiredCoverReferences = async (
  pool: Pool,
  storage: StorageProvider,
): Promise<number> => {
  const expired = await pool.query<{
    id: string;
    reference_file_id: string;
    reference_key: string;
  }>(
    `select c.id,c.reference_file_id,f.storage_key as reference_key from album_covers c join stored_files f on f.id=c.reference_file_id where f.created_at<now()-interval '7 days' order by c.created_at limit 100`,
  );
  let removed = 0;
  for (const cover of expired.rows) {
    try {
      await cleanupCoverReference(pool, storage, cover);
      removed++;
    } catch (error) {
      console.warn({ error: sanitizeError(error) }, 'expired cover reference cleanup failed');
    }
  }
  return removed;
};
const makeCoverPrompt = (storyValue: unknown, lyricsValue: unknown): string => {
  const story = creativeBriefSchema.parse(storyValue);
  const lyrics = lyricsContentSchema.parse(lyricsValue);
  return [
    'Crie uma capa de single original, quadrada, expressiva e presenteável.',
    'Use composição editorial brasileira, contraste forte e espaço visual limpo.',
    'Não inclua logotipos, celebridades, artistas reconhecíveis, nudez ou imitação de estilo de artista vivo.',
    'Não dependa de texto legível dentro da imagem; o título será aplicado pela interface.',
    'Se houver foto, preserve a identidade geral das pessoas sem inventar outras pessoas.',
    `Contexto: ${JSON.stringify({ title: lyrics.title, subject: story.subjectName, occasion: story.occasion, genre: lyrics.musicalDirection.genre, mood: lyrics.musicalDirection.mood, summary: lyrics.summary, memories: story.facts.slice(0, 5), lyricExcerpt: lyrics.fullLyrics.slice(0, 1200) })}`,
  ].join('\n');
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
  signal?: AbortSignal,
): Promise<void> => {
  const payload = coverJobPayloadSchema.safeParse(job.payload);
  if (!payload.success) throw workerError('JOB_PAYLOAD_INVALID');
  const cover = await withJobLease(pool, job, async (client) => {
    const result = await client.query<CoverRow>(
      `select c.id,c.status,c.model,c.reference_file_id,c.had_reference,o.public_id,reference.storage_key as reference_key,s.data as story,l.content as lyrics from album_covers c join orders o on o.id=c.order_id join story_sessions s on s.order_id=o.id join productions p on p.id=o.current_production_id and p.provenance='recorded' join lyric_versions l on l.id=p.lyric_version_id left join stored_files reference on reference.id=c.reference_file_id where c.order_id=$1 and c.attempt=$2 and o.status not in ('refunded','cancelled')`,
      [job.orderId, payload.data.attempt],
    );
    const row = result.rows[0];
    if (!row) throw workerError('JOB_PRECONDITION_FAILED');
    if (row.status === 'completed') return row;
    if (row.status !== 'pending') throw workerError('AI_RESULT_UNKNOWN');
    await client.query("update album_covers set status='processing',updated_at=now() where id=$1", [
      row.id,
    ]);
    return row;
  });
  if (cover.status === 'completed') {
    await cleanupCoverReference(pool, storage, cover, job);
    return;
  }
  let call: AiCall | undefined;
  let key: string | undefined;
  let saved = false;
  const startedAt = Date.now();
  try {
    if (!config.openRouterCoverTextModel || !config.openRouterCoverReferenceModel)
      throw workerError('AI_CONFIGURATION_MISSING');
    if (cover.had_reference && !cover.reference_key) throw workerError('JOB_PRECONDITION_FAILED');
    const reference = cover.reference_key ? await storage.get(cover.reference_key) : undefined;
    const prompt = makeCoverPrompt(cover.story, cover.lyrics);
    call = await beginAiCall(pool, job, 'album_cover', 'openrouter', cover.model);
    const generation = await provider.generate({
      model: cover.model,
      prompt,
      ...(reference ? { reference } : {}),
      ...(signal ? { signal } : {}),
    });
    await recordAiUsage(pool, call, generation.usage, 'ok');
    const extension =
      generation.mime === 'image/png' ? 'png' : generation.mime === 'image/webp' ? 'webp' : 'jpg';
    key = `orders/${cover.public_id}/covers/${cover.id}/${call.id}.${extension}`;
    await withJobLease(pool, job, async () => undefined);
    await storage.put(key, generation.bytes, generation.mime);
    const completedCall = call;
    await withJobLease(pool, job, async (client) => {
      const file = await client.query<{ id: string }>(
        `insert into stored_files(order_id,storage_key,mime_type,size_bytes) values($1,$2,$3,$4) returning id`,
        [job.orderId, key, generation.mime, generation.bytes.length],
      );
      await client.query(
        "update album_covers set status='completed',cover_file_id=$2,last_error=null,updated_at=now() where id=$1",
        [cover.id, file.rows[0]!.id],
      );
      await completeAiCall(client, completedCall, generation.usage.requestId);
    });
    saved = true;
  } catch (error) {
    if (call) await failAiCall(pool, call, error, usageOfError(error, cover.model, startedAt));
    if (key && !saved) await storage.delete(key).catch(() => undefined);
    const retryable =
      typeof error === 'object' &&
      error !== null &&
      'terminal' in error &&
      error.terminal === false;
    await withJobLease(pool, job, async (client) => {
      await client.query(
        'update album_covers set status=$2,last_error=$3,updated_at=now() where id=$1',
        [cover.id, retryable ? 'pending' : 'failed', sanitizeError(error)],
      );
    }).catch(() => undefined);
    if (!retryable) await cleanupCoverReference(pool, storage, cover, job).catch(() => undefined);
    throw error;
  }
  await cleanupCoverReference(pool, storage, cover, job).catch((error) =>
    console.warn({ error: sanitizeError(error) }, 'completed cover reference cleanup failed'),
  );
};
