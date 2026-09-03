import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
export * from './schema.js';
export * from './jobs.js';
export const createDb = (url: string) => {
  const pool = new Pool({ connectionString: url });
  return { db: drizzle(pool), pool };
};
