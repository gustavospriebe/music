import { Pool } from 'pg';
export * from './schema.js';
export * from './jobs.js';
export declare const createDb: (url: string) => {
    db: import("drizzle-orm/node-postgres").NodePgDatabase<Record<string, never>> & {
        $client: Pool;
    };
    pool: Pool;
};
