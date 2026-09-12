import { withJobLease, type ClaimedJob } from '@resenha/database';
import {
  sanitizeAiError,
  type AiUsageKind,
  type AiUsageSample,
  type AiUsageStatus,
} from '@resenha/domain';
import type { Pool, PoolClient } from 'pg';

export type AiCall = {
  id: string;
  job: ClaimedJob;
  kind: AiUsageKind;
  provider: string;
  model: string;
};
export const workerError = (
  code: string,
  terminal = true,
): Error & { code: string; terminal: boolean } =>
  Object.assign(new Error(code), { code, terminal });

export const beginAiCall = async (
  pool: Pool,
  job: ClaimedJob,
  kind: AiUsageKind,
  provider: string,
  model: string,
): Promise<AiCall> =>
  withJobLease(pool, job, async (client) => {
    const unresolved = await client.query(
      `select 1 from ai_calls where order_id=$1 and kind=$2 and status in ('started','unknown') limit 1`,
      [job.orderId, kind],
    );
    if (unresolved.rowCount) throw workerError('AI_RESULT_UNKNOWN');
    const result = await client.query<{ id: string }>(
      `insert into ai_calls(order_id,job_id,kind,provider,model,lease_token)
     values($1,$2,$3,$4,$5,$6) returning id`,
      [job.orderId, job.id, kind, provider, model, job.leaseToken],
    );
    return { id: result.rows[0]!.id, job, kind, provider, model };
  });

export const recordAiUsage = async (
  pool: Pool,
  call: AiCall,
  usage: AiUsageSample,
  status: AiUsageStatus,
  error?: unknown,
): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select id from orders where id=$1 for update', [call.job.orderId]);
    const inserted = await client.query(
      `insert into ai_usage(order_id,job_id,ai_call_id,kind,provider,model,external_id,input_tokens,
       output_tokens,cost_usd,cost_source,latency_ms,status,error,attempt)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     on conflict(ai_call_id) do nothing returning id`,
      [
        call.job.orderId,
        call.job.id,
        call.id,
        call.kind,
        call.provider,
        usage.model,
        usage.requestId,
        usage.inputTokens,
        usage.outputTokens,
        usage.costUsd,
        usage.costSource,
        usage.latencyMs,
        status,
        error === undefined ? null : sanitizeAiError(error),
        call.job.attempts,
      ],
    );
    if (!inserted.rowCount && usage.costSource !== 'unknown') {
      const observed = await client.query(
        `update ai_usage set external_id=$2,input_tokens=$3,output_tokens=$4,cost_usd=$5,cost_source=$6,latency_ms=$7,status=$8,error=$9
        where ai_call_id=$1 and cost_source='unknown' and cost_usd is null returning id`,
        [
          call.id,
          usage.requestId,
          usage.inputTokens,
          usage.outputTokens,
          usage.costUsd,
          usage.costSource,
          usage.latencyMs,
          status,
          error === undefined ? null : sanitizeAiError(error),
        ],
      );
      if (observed.rowCount)
        await client.query(
          "insert into order_events(order_id,type,data) values($1,'ai_cost_observed',$2)",
          [
            call.job.orderId,
            JSON.stringify({
              aiCallId: call.id,
              fromSource: 'unknown',
              toSource: usage.costSource,
            }),
          ],
        );
    }
    await client.query('commit');
  } catch (failure) {
    await client.query('rollback');
    throw failure;
  } finally {
    client.release();
  }
};

/** Called inside the transaction which materializes the successful result. */
export const completeAiCall = async (
  client: PoolClient,
  call: AiCall,
  externalId: string | null,
): Promise<void> => {
  const result = await client.query(
    `update ai_calls set status='completed',external_id=$3,finished_at=now()
     where id=$1 and lease_token=$2 and status='started' returning id`,
    [call.id, call.job.leaseToken, externalId],
  );
  if (!result.rowCount) throw workerError('AI_RESULT_UNKNOWN');
};

export const usageOfError = (error: unknown, model: string, startedAt: number): AiUsageSample => {
  if (typeof error === 'object' && error !== null && 'usage' in error) {
    const usage = error.usage;
    if (typeof usage === 'object' && usage !== null && 'costSource' in usage && 'model' in usage)
      return usage as AiUsageSample;
  }
  return {
    requestId: null,
    model,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: null,
    costSource: 'unknown',
    latencyMs: Date.now() - startedAt,
  };
};

/** Outcomes remain diagnosable after cancellation; this function never changes product state. */
export const failAiCall = async (
  pool: Pool,
  call: AiCall,
  error: unknown,
  usage: AiUsageSample,
): Promise<void> => {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  const outcome =
    typeof error === 'object' && error !== null && 'outcome' in error
      ? error.outcome
      : ['AI_INVALID_AUDIO', 'AI_AUDIO_TOO_SHORT', 'AI_VALIDATION_REJECTED'].includes(String(code))
        ? 'failed'
        : 'unknown';
  const status = outcome === 'rejected' ? 'rejected' : outcome === 'failed' ? 'failed' : 'unknown';
  await recordAiUsage(
    pool,
    call,
    usage,
    code === 'AI_CONTENT_BLOCKED' ? 'blocked' : status === 'rejected' ? 'rejected' : 'error',
    error,
  );
  await pool.query(
    `update ai_calls set status=$3,external_id=$4,finished_at=now()
     where id=$1 and lease_token=$2 and status='started'`,
    [call.id, call.job.leaseToken, status, usage.requestId],
  );
};

export const rejectAiCall = async (
  pool: Pool,
  call: AiCall,
  usage: AiUsageSample,
): Promise<void> => {
  await recordAiUsage(pool, call, usage, 'rejected', workerError('AI_VALIDATION_REJECTED'));
  await withJobLease(pool, call.job, async (client) => {
    await client.query(
      "update ai_calls set status='rejected',external_id=$2,finished_at=now() where id=$1 and status='started'",
      [call.id, usage.requestId],
    );
  });
};
