import {
  creativeBriefSchema,
  generatedLyricsSchema,
  lyricsContentSchema,
  lyricsJobPayloadSchema,
  type GeneratedLyrics,
} from '@resenha/contracts';
import { completeJob, failJob, withJobLease, type ClaimedJob } from '@resenha/database';
import {
  assertTransition,
  canonicalizeLyrics,
  validateLyrics,
  type AiUsageSample,
} from '@resenha/domain';
import {
  createOpenRouterLyricsProvider,
  type LyricsProvider,
  type LyricsRefinement,
} from '@resenha/providers';
import type { Pool, PoolClient } from 'pg';
import {
  beginAiCall,
  completeAiCall,
  failAiCall,
  recordAiUsage,
  rejectAiCall,
  usageOfError,
  workerError,
} from './ai-call.js';
import { sanitizeError } from './log.js';
import type { WorkerConfig } from './config.js';

export const restoreLyricsOrder = async (
  client: PoolClient,
  job: Pick<ClaimedJob, 'orderId' | 'payload'>,
): Promise<void> => {
  const parsed = lyricsJobPayloadSchema.safeParse(job.payload);
  const status = parsed.success && parsed.data.refinement ? 'lyrics_ready' : 'failed';
  assertTransition('lyrics_generating', status);
  await client.query(
    "update orders set status=$2,updated_at=now() where id=$1 and status='lyrics_generating'",
    [job.orderId, status],
  );
};

export const processLyricsJob = async (
  pool: Pool,
  job: ClaimedJob,
  config: WorkerConfig,
  lyrics?: LyricsProvider,
  signal?: AbortSignal,
): Promise<void> => {
  const parsed = lyricsJobPayloadSchema.safeParse(job.payload);
  if (!parsed.success) throw workerError('JOB_PAYLOAD_INVALID');
  const payload = parsed.data;
  const context = await withJobLease(pool, job, async (client) => {
    const existing = await client.query<{ kind: string }>(
      'select kind from lyric_versions where order_id=$1 and number=$2',
      [job.orderId, payload.targetVersion],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].kind !== 'generated') throw workerError('JOB_PRECONDITION_FAILED');
      assertTransition('lyrics_generating', 'lyrics_ready');
      await client.query(
        "update orders set status='lyrics_ready',updated_at=now() where id=$1 and status='lyrics_generating'",
        [job.orderId],
      );
      return null;
    }
    const order = (
      await client.query<{ status: string }>('select status from orders where id=$1', [job.orderId])
    ).rows[0];
    if (order?.status !== 'lyrics_generating') throw workerError('JOB_PRECONDITION_FAILED');
    const storyRow = (
      await client.query<{ data: unknown }>('select data from story_sessions where order_id=$1', [
        job.orderId,
      ])
    ).rows[0];
    const brief = creativeBriefSchema.safeParse(storyRow?.data);
    if (!brief.success) throw workerError('JOB_PRECONDITION_FAILED');
    let refinement: LyricsRefinement | undefined;
    if (payload.refinement) {
      const base = (
        await client.query<{ content: unknown }>(
          'select content from lyric_versions where order_id=$1 and number=$2',
          [job.orderId, payload.refinement.baseVersion],
        )
      ).rows[0];
      const content = lyricsContentSchema.safeParse(base?.content);
      if (!content.success) throw workerError('JOB_PRECONDITION_FAILED');
      refinement = {
        instructions: payload.refinement.instructions,
        lyrics: {
          title: content.data.title,
          fullLyrics: content.data.fullLyrics,
          musicalDirection: content.data.musicalDirection,
        },
      };
    }
    return { brief: brief.data, refinement };
  });
  if (!context) return;
  const provider =
    lyrics ??
    createOpenRouterLyricsProvider({
      apiKey: config.openRouterApiKey,
      model: config.openRouterTextModel,
      maxTokens: config.openRouterTextMaxTokens,
      webUrl: config.webUrl,
    });
  let feedback: string | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const call = await beginAiCall(pool, job, 'lyrics', 'openrouter', config.openRouterTextModel);
    const startedAt = Date.now();
    let result: { lyrics: GeneratedLyrics; usage: AiUsageSample };
    try {
      result = await provider.generate(context.brief, feedback, context.refinement, signal);
    } catch (error) {
      await failAiCall(
        pool,
        call,
        error,
        usageOfError(error, config.openRouterTextModel, startedAt),
      );
      throw error;
    }
    const output = generatedLyricsSchema.safeParse(result.lyrics);
    const errors = output.success
      ? validateLyrics(output.data, context.brief)
      : ['A resposta não corresponde ao formato de letra.'];
    if (errors.length) {
      await rejectAiCall(pool, call, result.usage);
      feedback = errors.join(' ');
      continue;
    }
    const content = canonicalizeLyrics(output.data!);
    await recordAiUsage(pool, call, result.usage, 'ok');
    await withJobLease(pool, job, async (client) => {
      const order = (
        await client.query<{ status: string; public_id: string }>(
          'select status,public_id from orders where id=$1',
          [job.orderId],
        )
      ).rows[0];
      if (order?.status !== 'lyrics_generating') throw workerError('JOB_PRECONDITION_FAILED');
      await client.query(
        "insert into lyric_versions(order_id,number,kind,content) values($1,$2,'generated',$3)",
        [job.orderId, payload.targetVersion, JSON.stringify(content)],
      );
      assertTransition(order.status, 'lyrics_ready');
      await client.query("update orders set status='lyrics_ready',updated_at=now() where id=$1", [
        job.orderId,
      ]);
      await completeAiCall(client, call, result.usage.requestId);
      await client.query(
        "insert into order_events(order_id,type,data) values($1,'lyrics_generated',$2)",
        [job.orderId, JSON.stringify({ jobId: job.id, version: payload.targetVersion })],
      );
      await client.query(
        "insert into analytics_events(event,product_type,order_public_id) values('lyrics_generated','custom_song',$1)",
        [order.public_id],
      );
    });
    return;
  }
  throw workerError('AI_VALIDATION_REJECTED');
};

/** API integration seam with an explicitly claimed job and a synthetic provider. */
export const settleLyricsJob = async (
  pool: Pool,
  job: ClaimedJob,
  config: WorkerConfig,
  lyrics?: LyricsProvider,
): Promise<void> => {
  try {
    await processLyricsJob(pool, job, config, lyrics);
    await completeJob(pool, job);
  } catch (error) {
    await withJobLease(pool, job, (client) => restoreLyricsOrder(client, job));
    await failJob(pool, job, sanitizeError(error));
  }
};
