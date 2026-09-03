import dotenv from 'dotenv';
import { createDb } from '@resenha/database';
import { createWorker, readWorkerConfig } from './worker.js';

dotenv.config({ path: new URL('../../../.env', import.meta.url).pathname });

const config = readWorkerConfig(process.env);
const { pool } = createDb(config.databaseUrl);
const worker = createWorker({ pool, config });

let stopping = false;
let timer: NodeJS.Timeout | undefined;

const schedule = (): void => {
  if (!stopping) timer = setTimeout(run, config.pollIntervalMs);
};

const run = async (): Promise<void> => {
  try {
    await worker.tick();
  } catch (error) {
    console.error({ error: worker.sanitizeError(error) }, 'worker tick failed');
  }
  schedule();
};

const shutdown = async (signal: string): Promise<void> => {
  if (stopping) return;
  stopping = true;
  if (timer) clearTimeout(timer);
  console.info({ signal }, 'worker stopping');
  await worker.waitForIdle();
  await pool.end();
  console.info('worker stopped');
};

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
void run();
