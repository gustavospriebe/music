import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import {
  claimNextJob,
  completeJob,
  readQueueMetrics,
  releaseStaleJobs,
  renewJobLease,
  withJobLease,
} from './jobs.js';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl) throw new Error('DATABASE_URL_TEST must identify the isolated audit database');
const parsedUrl = new URL(databaseUrl);
if (
  !['localhost', '127.0.0.1'].includes(parsedUrl.hostname) ||
  !/(?:_test|_remediation_[a-z_]+)$/.test(parsedUrl.pathname)
)
  throw new Error('Queue tests require an isolated local audit database');
const pool = new Pool({ connectionString: databaseUrl });
const orderIds: string[] = [];
const setup = async () => {
  const orderId = randomUUID();
  orderIds.push(orderId);
  await pool.query(
    "insert into orders(id,public_id,product_type,price_cents,access_token_hash) values($1,$2,'custom_song',1000,'test')",
    [orderId, randomUUID().replaceAll('-', '')],
  );
  const jobId = randomUUID();
  await pool.query(
    "insert into generation_jobs(id,order_id,type,payload,idempotency_key,run_at) values($1,$2,'generate_lyrics','{}',$3,'1970-01-01')",
    [jobId, orderId, randomUUID()],
  );
  return { orderId, jobId };
};
afterEach(async () => {
  if (orderIds.length)
    await pool.query('delete from orders where id=any($1::uuid[])', [orderIds.splice(0)]);
});
afterAll(async () => {
  await pool.end();
});

describe('durable queue ownership', () => {
  it('claims once under concurrency and renews only the current lease', async () => {
    const { jobId } = await setup();
    const claims = await Promise.all([
      claimNextJob(pool, 'worker-a', 60_000),
      claimNextJob(pool, 'worker-b', 60_000),
    ]);
    const owned = claims.filter((job) => job?.id === jobId);
    expect(owned).toHaveLength(1);
    const job = owned[0]!;
    expect(job.attempts).toBe(1);
    expect(job.leaseToken).toMatch(/^[\da-f-]{36}$/);
    const before = (
      await pool.query('select lease_expires_at from generation_jobs where id=$1', [jobId])
    ).rows[0].lease_expires_at;
    expect(await renewJobLease(pool, job, 120_000)).toBe(true);
    expect(
      (
        await pool.query('select lease_expires_at from generation_jobs where id=$1', [jobId])
      ).rows[0].lease_expires_at.getTime(),
    ).toBeGreaterThan(before.getTime());
    expect(await renewJobLease(pool, { ...job, leaseToken: randomUUID() }, 120_000)).toBe(false);
    await completeJob(pool, job);
    expect(
      (await pool.query('select status,lease_token from generation_jobs where id=$1', [jobId]))
        .rows[0],
    ).toEqual({ status: 'completed', lease_token: null });
  });

  it('permits a new lease before provider I/O and rolls back the former owner effects', async () => {
    const { orderId, jobId } = await setup();
    const old = await claimNextJob(pool, 'worker-a', 60_000);
    expect(old?.id).toBe(jobId);
    await pool.query(
      "update generation_jobs set lease_expires_at=now()-interval '1 second' where id=$1",
      [jobId],
    );
    expect((await releaseStaleJobs(pool, 60_000)).find((job) => job.id === jobId)?.status).toBe(
      'pending',
    );
    const current = await claimNextJob(pool, 'worker-b', 60_000);
    expect(current?.id).toBe(jobId);
    expect(current?.leaseToken).not.toBe(old!.leaseToken);
    await expect(
      withJobLease(pool, old!, async (client) => {
        await client.query('update orders set price_cents=9999 where id=$1', [orderId]);
      }),
    ).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
    expect(
      (await pool.query('select price_cents from orders where id=$1', [orderId])).rows[0]
        .price_cents,
    ).toBe(1000);
    await expect(completeJob(pool, old!)).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
    await completeJob(pool, current!);
  });

  it('marks an interrupted provider call unknown and refuses automatic re-execution', async () => {
    const { orderId, jobId } = await setup();
    const job = await claimNextJob(pool, 'worker-a', 60_000);
    expect(job?.id).toBe(jobId);
    await pool.query(
      "insert into ai_calls(order_id,job_id,kind,provider,model,lease_token) values($1,$2,'lyrics','openrouter','synthetic',$3)",
      [orderId, jobId, job!.leaseToken],
    );
    await pool.query(
      "update generation_jobs set lease_expires_at=now()-interval '1 second' where id=$1",
      [jobId],
    );
    expect((await releaseStaleJobs(pool, 60_000)).find((row) => row.id === jobId)).toMatchObject({
      status: 'failed',
      last_error: 'AI_RESULT_UNKNOWN',
    });
    expect((await pool.query('select status from ai_calls where job_id=$1', [jobId])).rows).toEqual(
      [{ status: 'unknown' }],
    );
    expect((await claimNextJob(pool, 'worker-b', 60_000))?.id).not.toBe(jobId);
    await expect(completeJob(pool, job!)).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
    expect((await readQueueMetrics(pool)).unknownCalls).toBeGreaterThanOrEqual(1);
  });

  it('does not finalize a cancelled job or claim an exhausted pending job', async () => {
    const { jobId } = await setup();
    const job = await claimNextJob(pool, 'worker-a', 60_000);
    await pool.query("update generation_jobs set status='cancelled' where id=$1", [jobId]);
    await expect(completeJob(pool, job!)).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
    expect(await renewJobLease(pool, job!, 60_000)).toBe(false);
    await pool.query(
      "update generation_jobs set status='pending',attempts=max_attempts where id=$1",
      [jobId],
    );
    expect((await claimNextJob(pool, 'worker-b', 60_000))?.id).not.toBe(jobId);
  });
});
