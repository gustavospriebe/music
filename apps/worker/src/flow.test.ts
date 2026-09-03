import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { ClaimedJob } from '@resenha/database';
import { processAudioJob, type MusicResult, type WorkerConfig } from './worker.js';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL_TEST ?? 'postgresql://resenha:resenha@localhost:5433/resenha_test',
});

const config: WorkerConfig = {
  databaseUrl: 'postgresql://resenha:resenha@localhost:5433/resenha_test',
  workerId: 'flow-test',
  pollIntervalMs: 1000,
  lockTimeoutMs: 300_000,
  concurrency: 1,
  storagePath: mkdtempSync(join(tmpdir(), 'worker-flow-')),
  reviewMode: 'manual',
  webUrl: 'http://localhost:5175',
  tokenPepper: 'a-local-token-pepper-with-more-than-32-chars',
  openRouterApiKey: 'test-key',
  openRouterMusicModel: 'test-music-model',
  emailFrom: 'test@example.test',
};

const approvedContent = {
  title: 'A música da Bia',
  summary: 'resumo',
  language: 'pt-BR',
  musicalDirection: {
    genre: 'pagode',
    mood: 'animado',
    tempo: 'medium',
    voice: 'female',
    instrumentation: ['violão'],
  },
  pronunciationNotes: [],
  sections: [
    { type: 'verse', label: 'Verso', lyrics: 'verso' },
    { type: 'chorus', label: 'Refrão', lyrics: 'refrão' },
    { type: 'outro', label: 'Final', lyrics: 'fim' },
  ],
  fullLyrics: 'verso\nrefrão\nfim',
  safetyNotes: [],
};

const mp3Bytes = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x01, 0x02]);

const okMusic = (requestId: string): MusicResult => ({
  generation: {
    bytes: mp3Bytes,
    mime: 'audio/mpeg',
    externalId: requestId,
    usage: {
      requestId,
      model: 'test-music-model',
      inputTokens: 50,
      outputTokens: 900,
      costUsd: '0.08',
      latencyMs: 42,
    },
  },
  attempts: [
    {
      sample: {
        requestId,
        model: 'test-music-model',
        inputTokens: 50,
        outputTokens: 900,
        costUsd: '0.08',
        latencyMs: 42,
      },
      status: 'ok',
      error: null,
    },
  ],
});

const setupOrder = async (publicId: string, key: string) => {
  const order = await pool.query<{ id: string }>(
    `insert into orders(public_id,product_type,status,price_cents,access_token_hash)
     values($1,'friend_roast','paid',4990,'hash') returning id`,
    [publicId],
  );
  const orderId = order.rows[0]?.id as string;
  await pool.query(
    `insert into lyric_versions(order_id,number,kind,content,approved_at)
     values($1,1,'generated',$2,now())`,
    [orderId, JSON.stringify(approvedContent)],
  );
  const job = await pool.query<{ id: string }>(
    `insert into generation_jobs(type,order_id,payload,idempotency_key,max_attempts)
     values('generate_audio',$1,'{}',$2,6) returning id`,
    [orderId, key],
  );
  const jobId = job.rows[0]?.id as string;
  return { orderId, jobId };
};

beforeAll(async () => {
  await pool.query('truncate table orders cascade');
});

afterAll(async () => {
  await pool.end();
});

describe('processAudioJob cost persistence', () => {
  it('persists one ok audio usage row per variant', async () => {
    const { orderId, jobId } = await setupOrder('audio-ok-1', 'audio:ok-1');
    const job: ClaimedJob = {
      id: jobId,
      orderId,
      type: 'generate_audio',
      attempts: 1,
      maxAttempts: 6,
      payload: {},
    };
    let calls = 0;
    await processAudioJob(pool, job, config, {
      generate: async () => {
        calls += 1;
        return okMusic(`gen-ok-${calls}`);
      },
    });
    const audio = await pool.query(
      'select variant, status from audio_generations where order_id=$1 order by variant',
      [orderId],
    );
    expect(audio.rows).toHaveLength(2);
    expect(audio.rows.every((row) => row.status === 'completed')).toBe(true);
    const usage = await pool.query(
      'select kind, status, model, external_id, input_tokens, output_tokens, cost_usd, latency_ms, job_id, attempt from ai_usage where order_id=$1 order by external_id',
      [orderId],
    );
    expect(usage.rows).toHaveLength(2);
    for (const row of usage.rows) {
      expect(row).toMatchObject({
        kind: 'audio',
        status: 'ok',
        model: 'test-music-model',
        input_tokens: 50,
        output_tokens: 900,
        job_id: jobId,
        attempt: 1,
      });
      expect(Number(row.cost_usd)).toBeCloseTo(0.08, 6);
    }
    expect(usage.rows.map((row) => row.external_id).sort()).toEqual(['gen-ok-1', 'gen-ok-2']);
    const status = await pool.query('select status from orders where id=$1', [orderId]);
    expect(status.rows[0]?.status).toBe('review_required');
  });

  it('persists blocked sings before rethrowing', async () => {
    const { orderId, jobId } = await setupOrder('audio-blocked-1', 'audio:blocked-1');
    const job: ClaimedJob = {
      id: jobId,
      orderId,
      type: 'generate_audio',
      attempts: 1,
      maxAttempts: 6,
      payload: {},
    };
    const blocked = {
      sample: {
        requestId: 'gen-blocked-1',
        model: 'test-music-model',
        inputTokens: 50,
        outputTokens: 0,
        costUsd: null,
        latencyMs: 30,
      },
      status: 'blocked' as const,
      error: 'PROHIBITED_CONTENT',
    };
    await expect(
      processAudioJob(pool, job, config, {
        generate: async () => {
          throw Object.assign(new Error('PROHIBITED_CONTENT'), { attempts: [blocked] });
        },
      }),
    ).rejects.toThrow('PROHIBITED_CONTENT');
    const usage = await pool.query(
      'select kind, status, external_id, error from ai_usage where order_id=$1',
      [orderId],
    );
    expect(usage.rows).toHaveLength(1);
    expect(usage.rows[0]).toMatchObject({
      kind: 'audio',
      status: 'blocked',
      external_id: 'gen-blocked-1',
      error: 'PROHIBITED_CONTENT',
    });
  });

  it('persists transport errors with latency before rethrowing', async () => {
    const { orderId, jobId } = await setupOrder('audio-error-1', 'audio:error-1');
    const job: ClaimedJob = {
      id: jobId,
      orderId,
      type: 'generate_audio',
      attempts: 1,
      maxAttempts: 6,
      payload: {},
    };
    const failed = {
      sample: {
        requestId: null,
        model: 'test-music-model',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: null,
        latencyMs: 120,
      },
      status: 'error' as const,
      error: 'fetch failed',
    };
    await expect(
      processAudioJob(pool, job, config, {
        generate: async () => {
          throw Object.assign(new Error('fetch failed'), { attempts: [failed] });
        },
      }),
    ).rejects.toThrow('fetch failed');
    const usage = await pool.query(
      'select kind, status, external_id, latency_ms, error from ai_usage where order_id=$1',
      [orderId],
    );
    expect(usage.rows).toHaveLength(1);
    expect(usage.rows[0]).toMatchObject({
      kind: 'audio',
      status: 'error',
      external_id: null,
      latency_ms: 120,
      error: 'fetch failed',
    });
  });

  it('partial runs never deliver without both variants', async () => {
    const { orderId, jobId } = await setupOrder('audio-partial-1', 'audio:partial-1');
    const job: ClaimedJob = {
      id: jobId,
      orderId,
      type: 'generate_audio',
      attempts: 1,
      maxAttempts: 6,
      payload: {},
    };
    await processAudioJob(
      pool,
      job,
      config,
      {
        generate: async () => okMusic('gen-partial-1'),
      },
      [1],
    );
    const audio = await pool.query(
      "select variant from audio_generations where order_id=$1 and status='completed'",
      [orderId],
    );
    expect(audio.rows).toHaveLength(1);
    const usage = await pool.query(
      'select count(*)::int as count from ai_usage where order_id=$1',
      [orderId],
    );
    expect(usage.rows[0]?.count).toBe(1);
    const status = await pool.query('select status from orders where id=$1', [orderId]);
    expect(status.rows[0]?.status).toBe('audio_generating');
    const delivery = await pool.query(
      'select count(*)::int as count from deliveries where order_id=$1',
      [orderId],
    );
    expect(delivery.rows[0]?.count).toBe(0);
  });
});
