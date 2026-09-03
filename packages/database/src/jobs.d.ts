import type { Pool } from 'pg';
export type ClaimedJob = {
    id: string;
    orderId: string;
    type: string;
    attempts: number;
    maxAttempts: number;
    payload: unknown;
};
export declare const enqueueJob: (pool: Pool, input: {
    type: string;
    orderId: string;
    payload: unknown;
    idempotencyKey: string;
}) => Promise<import("pg").QueryResult<any>>;
export declare const claimNextJob: (pool: Pool, workerId: string) => Promise<ClaimedJob | undefined>;
export declare const completeJob: (pool: Pool, jobId: string) => Promise<import("pg").QueryResult<any>>;
export declare const retryJob: (pool: Pool, job: ClaimedJob, error: string) => Promise<import("pg").QueryResult<any>>;
export declare const failJob: (pool: Pool, jobId: string, error: string) => Promise<import("pg").QueryResult<any>>;
export declare const releaseStaleJobs: (pool: Pool, lockTimeoutMs: number) => Promise<import("pg").QueryResult<any>>;
