export const enqueueJob = async (pool, input) => pool.query(`insert into generation_jobs(type,order_id,payload,idempotency_key) values($1,$2,$3,$4) on conflict(idempotency_key) do nothing returning id`, [input.type, input.orderId, JSON.stringify(input.payload), input.idempotencyKey]);
export const claimNextJob = async (pool, workerId) => {
    const client = await pool.connect();
    try {
        await client.query('begin');
        const result = await client.query(`select id, order_id, type, attempts, max_attempts, payload from generation_jobs where status='pending' and run_at<=now() order by run_at for update skip locked limit 1`);
        const job = result.rows[0];
        if (!job) {
            await client.query('commit');
            return undefined;
        }
        await client.query(`update generation_jobs set status='processing',locked_at=now(),locked_by=$1,attempts=attempts+1,updated_at=now() where id=$2`, [workerId, job.id]);
        await client.query('commit');
        return {
            id: job.id,
            orderId: job.order_id,
            type: job.type,
            attempts: job.attempts + 1,
            maxAttempts: job.max_attempts,
            payload: job.payload,
        };
    }
    catch (error) {
        await client.query('rollback');
        throw error;
    }
    finally {
        client.release();
    }
};
export const completeJob = (pool, jobId) => pool.query(`update generation_jobs set status='completed',locked_at=null,locked_by=null,updated_at=now() where id=$1`, [jobId]);
export const retryJob = (pool, job, error) => {
    const seconds = Math.min(300, 5 * 2 ** Math.max(0, job.attempts - 1)) + Math.floor(Math.random() * 4);
    return pool.query(`update generation_jobs set status=case when attempts>=max_attempts then 'failed'::job_status else 'pending'::job_status end,run_at=now()+($1 * interval '1 second'),locked_at=null,locked_by=null,last_error=$2,updated_at=now() where id=$3`, [seconds, error.slice(0, 500), job.id]);
};
export const failJob = (pool, jobId, error) => pool.query(`update generation_jobs set status='failed',locked_at=null,locked_by=null,last_error=$1,updated_at=now() where id=$2`, [error.slice(0, 500), jobId]);
export const releaseStaleJobs = (pool, lockTimeoutMs) => pool.query(`update generation_jobs set status='pending',locked_at=null,locked_by=null,updated_at=now() where status='processing' and locked_at < now() - ($1 * interval '1 millisecond')`, [lockTimeoutMs]);
