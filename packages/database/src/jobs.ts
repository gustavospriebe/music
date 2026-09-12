import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export type ClaimedJob = {
  id: string;
  orderId: string;
  type: string;
  attempts: number;
  maxAttempts: number;
  payload: unknown;
  leaseToken: string;
};

export class JobLeaseLostError extends Error {
  readonly code = 'JOB_LEASE_LOST';
  readonly terminal = true;
  constructor() {
    super('A posse deste trabalho expirou.');
  }
}

export const enqueueJob = async (
  pool: Pool,
  input: { type: string; orderId: string; payload: unknown; idempotencyKey: string },
) =>
  pool.query(
    `insert into generation_jobs(type,order_id,payload,idempotency_key) values($1,$2,$3,$4)
     on conflict(idempotency_key) do nothing returning id`,
    [input.type, input.orderId, JSON.stringify(input.payload), input.idempotencyKey],
  );

export const claimNextJob = async (
  pool: Pool,
  workerId: string,
  lockTimeoutMs = 300_000,
): Promise<ClaimedJob | undefined> => {
  const token = randomUUID();
  const result = await pool.query<{
    id: string;
    order_id: string;
    type: string;
    attempts: number;
    max_attempts: number;
    payload: unknown;
  }>(
    `with candidate as (
       select id from generation_jobs
       where status='pending' and run_at<=now() and attempts<max_attempts
       order by run_at,id for update skip locked limit 1
     )
     update generation_jobs j set status='processing',locked_at=now(),locked_by=$1,
       lease_token=$2,lease_expires_at=now()+($3*interval '1 millisecond'),
       attempts=attempts+1,updated_at=now()
     from candidate c where j.id=c.id
     returning j.id,j.order_id,j.type,j.attempts,j.max_attempts,j.payload`,
    [workerId, token, lockTimeoutMs],
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        orderId: row.order_id,
        type: row.type,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        payload: row.payload,
        leaseToken: token,
      }
    : undefined;
};

/** Lock the current lease in the same transaction as every persisted effect. */
export const assertJobLease = async (client: PoolClient, job: ClaimedJob): Promise<void> => {
  const result = await client.query(
    `select id from generation_jobs where id=$1 and status='processing'
       and lease_token=$2 and lease_expires_at>clock_timestamp() for update`,
    [job.id, job.leaseToken],
  );
  if (!result.rowCount) throw new JobLeaseLostError();
};

export const withJobLease = async <T>(
  pool: Pool,
  job: ClaimedJob,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Financial settlement/refund takes the same order -> job lock order.
    await client.query('select id from orders where id=$1 for update', [job.orderId]);
    await assertJobLease(client, job);
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};

export const renewJobLease = async (
  pool: Pool,
  job: ClaimedJob,
  lockTimeoutMs: number,
): Promise<boolean> => {
  const result = await pool.query(
    `update generation_jobs set locked_at=now(),lease_expires_at=now()+($3*interval '1 millisecond'),updated_at=now()
     where id=$1 and status='processing' and lease_token=$2 and lease_expires_at>clock_timestamp()`,
    [job.id, job.leaseToken, lockTimeoutMs],
  );
  return result.rowCount === 1;
};

export const completeJob = (pool: Pool, job: ClaimedJob) =>
  withJobLease(pool, job, async (client) => {
    await client.query(
      `update generation_jobs set status='completed',locked_at=null,locked_by=null,
       lease_token=null,lease_expires_at=null,updated_at=now() where id=$1`,
      [job.id],
    );
  });

export const retryJob = (pool: Pool, job: ClaimedJob, error: string) =>
  withJobLease(pool, job, async (client) => {
    const seconds = Math.min(300, 5 * 2 ** Math.max(0, job.attempts - 1));
    await client.query(
      `update generation_jobs set status=case when attempts>=max_attempts then 'failed'::job_status else 'pending'::job_status end,
       run_at=now()+($1*interval '1 second'),locked_at=null,locked_by=null,lease_token=null,
       lease_expires_at=null,last_error=$2,updated_at=now() where id=$3`,
      [seconds, error.slice(0, 500), job.id],
    );
  });

export const failJob = (pool: Pool, job: ClaimedJob, error: string) =>
  withJobLease(pool, job, async (client) => {
    await client.query(
      `update generation_jobs set status='failed',locked_at=null,locked_by=null,lease_token=null,
       lease_expires_at=null,last_error=$1,updated_at=now() where id=$2`,
      [error.slice(0, 500), job.id],
    );
  });

export type ReleasedJob = {
  id: string;
  order_id: string;
  type: string;
  payload: unknown;
  status: string;
  last_error: string | null;
};

/** A missing provider response is not evidence that its request was free. */
/** Interrupted I/O has an explicit unknown ledger entry, never a fabricated zero cost. */
export const markInterruptedAiCalls = async (
  client: PoolClient,
  jobIds: string[],
): Promise<void> => {
  await client.query(
    "update ai_calls set status='unknown',finished_at=now() where job_id=any($1::uuid[]) and status='started'",
    [jobIds],
  );
  await client.query(
    `insert into ai_usage(order_id,job_id,ai_call_id,kind,provider,model,external_id,input_tokens,output_tokens,cost_usd,cost_source,latency_ms,status,error,attempt)
    select c.order_id,c.job_id,c.id,c.kind,c.provider,c.model,c.external_id,0,0,null,'unknown',least(2147483647,greatest(0,extract(epoch from c.finished_at-c.created_at)*1000))::int,'error','AI_RESULT_UNKNOWN',j.attempts
    from ai_calls c join generation_jobs j on j.id=c.job_id where c.job_id=any($1::uuid[]) and c.status='unknown'
    on conflict(ai_call_id) do nothing`,
    [jobIds],
  );
};

export const releaseStaleJobs = async (
  pool: Pool,
  lockTimeoutMs: number,
): Promise<ReleasedJob[]> => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const orders = await client.query<{ order_id: string }>(
      `select distinct order_id from generation_jobs where status='processing' and (lease_expires_at<=now() or (lease_expires_at is null and locked_at<now()-($1*interval '1 millisecond')))`,
      [lockTimeoutMs],
    );
    if (orders.rows.length)
      await client.query('select id from orders where id=any($1::uuid[]) order by id for update', [
        orders.rows.map((row) => row.order_id),
      ]);
    const expired = await client.query<{ id: string }>(
      `select id from generation_jobs where status='processing' and
        (lease_expires_at<=now() or (lease_expires_at is null and locked_at<now()-($1*interval '1 millisecond')))
        for update skip locked`,
      [lockTimeoutMs],
    );
    const ids = expired.rows.map((row) => row.id);
    if (!ids.length) {
      await client.query('commit');
      return [];
    }
    await markInterruptedAiCalls(client, ids);
    const result = await client.query<ReleasedJob>(
      `update generation_jobs j set status=case
         when exists(select 1 from ai_calls c where c.job_id=j.id and c.status='unknown') or attempts>=max_attempts
         then 'failed'::job_status else 'pending'::job_status end,
       last_error=case when exists(select 1 from ai_calls c where c.job_id=j.id and c.status='unknown')
         then 'AI_RESULT_UNKNOWN' when attempts>=max_attempts then 'JOB_ATTEMPTS_EXHAUSTED' else last_error end,
       locked_at=null,locked_by=null,lease_token=null,lease_expires_at=null,updated_at=now()
       where id=any($1::uuid[]) returning id,order_id,type,payload,status,last_error`,
      [ids],
    );
    await client.query('commit');
    return result.rows;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};

export const readQueueMetrics = async (pool: Pool) => {
  const result = await pool.query<{
    pending: number;
    processing: number;
    failed: number;
    expiredLeases: number;
    oldestPendingAgeSeconds: number;
    unknownCalls: number;
  }>(`select
      count(*) filter(where status='pending')::int as pending,
      count(*) filter(where status='processing')::int as processing,
      count(*) filter(where status='failed')::int as failed,
      count(*) filter(where status='processing' and lease_expires_at<=now())::int as "expiredLeases",
      coalesce(greatest(0,extract(epoch from now()-min(run_at) filter(where status='pending'))),0)::float8 as "oldestPendingAgeSeconds",
      (select count(*)::int from ai_calls where status='unknown') as "unknownCalls"
     from generation_jobs`);
  return result.rows[0]!;
};
