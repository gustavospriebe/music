import { existsSync, mkdtempSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import type { ClaimedJob } from '@resenha/database';
import {
  cleanupExpiredCoverReferences,
  processAudioJob,
  processCoverJob,
  type CoverProvider,
  type MusicResult,
  type WorkerConfig,
} from './worker.js';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL_TEST ?? 'postgresql://resenha:resenha@localhost:5433/resenha_test',
});

const flowStoragePath = mkdtempSync(join(tmpdir(), 'worker-flow-'));
const config: WorkerConfig = {
  databaseUrl: 'postgresql://resenha:resenha@localhost:5433/resenha_test',
  workerId: 'flow-test',
  pollIntervalMs: 1000,
  lockTimeoutMs: 300_000,
  concurrency: 1,
  storagePath: flowStoragePath,
  storage: { kind: 'local', basePath: flowStoragePath },
  reviewMode: 'manual',
  webUrl: 'http://localhost:5175',
  tokenPepper: 'a-local-token-pepper-with-more-than-32-chars',
  openRouterApiKey: 'test-key',
  openRouterMusicModel: 'test-music-model',
  openRouterCoverTextModel: 'google/gemini-3.1-flash-lite-image',
  openRouterCoverReferenceModel: 'google/gemini-3.1-flash-image',
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

describe('processCoverJob persistence', () => {
  it('stores one private raster and usage, removes the reference and never calls again', async () => {
    const publicId = 'cover-worker-1';
    const order = await pool.query<{ id: string }>(
      `insert into orders(public_id,product_type,status,price_cents,access_token_hash)
       values($1,'friend_roast','audio_queued',4990,'hash') returning id`,
      [publicId],
    );
    const orderId = order.rows[0]?.id as string;
    await pool.query(`insert into story_sessions(order_id,data) values($1,$2)`, [
      orderId,
      JSON.stringify({
        productType: 'friend_roast',
        buyerEmail: 'ana@example.test',
        subjectName: 'Bia',
        occasion: 'Aniversário',
        genre: 'pagode',
        voice: 'female',
        mood: 'animado',
        facts: ['Fato um', 'Fato dois'],
        relationship: 'Amiga',
        traits: ['Leal'],
        biggestStory: 'Fato um',
        roastLevel: 'light',
        safetyConfirmed: true,
        termsAccepted: true,
        marketingAccepted: false,
      }),
    ]);
    await pool.query(
      `insert into lyric_versions(order_id,number,kind,content,approved_at)
       values($1,1,'approved',$2,now())`,
      [orderId, JSON.stringify(approvedContent)],
    );
    const referenceKey = `orders/${publicId}/references/ref.jpg`;
    await mkdir(join(config.storagePath, 'orders', publicId, 'references'), { recursive: true });
    const referenceBytes = Buffer.from([0xff, 0xd8, 0xff, 0x01]);
    await writeFile(join(config.storagePath, referenceKey), referenceBytes);
    const reference = await pool.query<{ id: string }>(
      `insert into stored_files(order_id,storage_key,mime_type,size_bytes)
       values($1,$2,'image/jpeg',$3) returning id`,
      [orderId, referenceKey, referenceBytes.length],
    );
    await pool.query(
      `insert into album_covers(order_id,attempt,status,reference_asset_id,had_reference,model)
       values($1,1,'pending',$2,true,$3)`,
      [orderId, reference.rows[0]?.id, config.openRouterCoverReferenceModel],
    );
    const insertedJob = await pool.query<{ id: string }>(
      `insert into generation_jobs(type,order_id,payload,idempotency_key,max_attempts)
       values('generate_cover',$1,'{"attempt":1}',$2,1) returning id`,
      [orderId, `cover:${orderId}:1`],
    );
    const job: ClaimedJob = {
      id: insertedJob.rows[0]?.id as string,
      orderId,
      type: 'generate_cover',
      attempts: 1,
      maxAttempts: 1,
      payload: { attempt: 1 },
    };
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const calls: Parameters<CoverProvider['generate']>[0][] = [];
    const provider: CoverProvider = {
      generate: async (input) => {
        calls.push(input);
        return {
          bytes: png,
          mime: 'image/png',
          usage: {
            requestId: null,
            model: input.model,
            inputTokens: 35,
            outputTokens: 1120,
            costUsd: '0.067',
            latencyMs: 90,
          },
        };
      },
    };
    await processCoverJob(pool, job, config, provider);
    await processCoverJob(pool, job, config, provider);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      model: config.openRouterCoverReferenceModel,
      reference: referenceBytes,
    });
    expect(calls[0]?.prompt).toContain('Bia');
    const cover = await pool.query(
      `select c.status,c.reference_asset_id,c.had_reference,f.mime_type,f.storage_key
       from album_covers c join stored_files f on f.id=c.cover_asset_id
       where c.order_id=$1`,
      [orderId],
    );
    expect(cover.rows[0]).toMatchObject({
      status: 'completed',
      reference_asset_id: null,
      had_reference: true,
      mime_type: 'image/png',
    });
    expect(existsSync(join(config.storagePath, referenceKey))).toBe(false);
    expect(existsSync(join(config.storagePath, cover.rows[0]?.storage_key))).toBe(true);
    const usage = await pool.query(
      'select kind,provider,model,input_tokens,output_tokens,cost_usd,status from ai_usage where order_id=$1',
      [orderId],
    );
    expect(usage.rows).toHaveLength(1);
    expect(usage.rows[0]).toMatchObject({
      kind: 'album_cover',
      provider: 'openrouter',
      model: config.openRouterCoverReferenceModel,
      input_tokens: 35,
      output_tokens: 1120,
      status: 'ok',
    });
  });

  it('marks a provider failure terminal and still erases the reference', async () => {
    const publicId = 'cover-worker-failed-1';
    const order = await pool.query<{ id: string }>(
      `insert into orders(public_id,product_type,status,price_cents,access_token_hash)
       values($1,'friend_roast','audio_queued',4990,'hash') returning id`,
      [publicId],
    );
    const orderId = order.rows[0]?.id as string;
    await pool.query('insert into story_sessions(order_id,data) values($1,$2)', [
      orderId,
      JSON.stringify({
        productType: 'friend_roast',
        buyerEmail: 'ana@example.test',
        subjectName: 'Bia',
        occasion: 'Aniversário',
        genre: 'pagode',
        voice: 'female',
        mood: 'animado',
        facts: ['Fato um', 'Fato dois'],
        relationship: 'Amiga',
        traits: ['Leal'],
        biggestStory: 'Fato um',
        roastLevel: 'light',
        safetyConfirmed: true,
        termsAccepted: true,
        marketingAccepted: false,
      }),
    ]);
    await pool.query(
      `insert into lyric_versions(order_id,number,kind,content,approved_at)
       values($1,1,'approved',$2,now())`,
      [orderId, JSON.stringify(approvedContent)],
    );
    const referenceKey = `orders/${publicId}/references/ref.jpg`;
    await mkdir(join(config.storagePath, 'orders', publicId, 'references'), { recursive: true });
    await writeFile(join(config.storagePath, referenceKey), Buffer.from([0xff, 0xd8, 0xff]));
    const reference = await pool.query<{ id: string }>(
      `insert into stored_files(order_id,storage_key,mime_type,size_bytes)
       values($1,$2,'image/jpeg',3) returning id`,
      [orderId, referenceKey],
    );
    await pool.query(
      `insert into album_covers(order_id,attempt,status,reference_asset_id,had_reference,model)
       values($1,1,'pending',$2,true,$3)`,
      [orderId, reference.rows[0]?.id, config.openRouterCoverReferenceModel],
    );
    const insertedJob = await pool.query<{ id: string }>(
      `insert into generation_jobs(type,order_id,payload,idempotency_key,max_attempts)
       values('generate_cover',$1,'{"attempt":1}',$2,1) returning id`,
      [orderId, `cover:${orderId}:1`],
    );
    const job: ClaimedJob = {
      id: insertedJob.rows[0]?.id as string,
      orderId,
      type: 'generate_cover',
      attempts: 1,
      maxAttempts: 1,
      payload: { attempt: 1 },
    };
    const usage = {
      requestId: null,
      model: config.openRouterCoverReferenceModel as string,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: null,
      latencyMs: 12,
    };
    await expect(
      processCoverJob(pool, job, config, {
        generate: async () => {
          throw Object.assign(new Error('provider rejected image'), { usage });
        },
      }),
    ).rejects.toMatchObject({ terminal: true });
    const cover = await pool.query(
      'select status,reference_asset_id,last_error from album_covers where order_id=$1',
      [orderId],
    );
    expect(cover.rows[0]).toMatchObject({
      status: 'failed',
      reference_asset_id: null,
      last_error: 'provider rejected image',
    });
    expect(existsSync(join(config.storagePath, referenceKey))).toBe(false);
    const usageRows = await pool.query('select kind,status,error from ai_usage where order_id=$1', [
      orderId,
    ]);
    expect(usageRows.rows[0]).toMatchObject({
      kind: 'album_cover',
      status: 'error',
      error: 'provider rejected image',
    });
  });

  it('removes abandoned reference objects after seven days', async () => {
    const order = await pool.query<{ id: string }>(
      `insert into orders(public_id,product_type,status,price_cents,access_token_hash)
       values('cover-expired-ref-1','friend_roast','paid',4990,'hash') returning id`,
    );
    const orderId = order.rows[0]?.id as string;
    const reference = await pool.query<{ id: string }>(
      `insert into stored_files(order_id,storage_key,mime_type,size_bytes)
       values($1,'orders/cover-expired-ref-1/references/ref.jpg','image/jpeg',3) returning id`,
      [orderId],
    );
    await pool.query(
      `insert into album_covers(order_id,attempt,status,reference_asset_id,had_reference,model,created_at)
       values($1,1,'pending',$2,true,'cover-model',now()-interval '8 days')`,
      [orderId, reference.rows[0]?.id],
    );
    const remove = vi.fn(async () => undefined);

    await expect(
      cleanupExpiredCoverReferences(pool, {
        put: vi.fn(),
        get: vi.fn(),
        delete: remove,
      }),
    ).resolves.toBe(1);
    expect(remove).toHaveBeenCalledWith('orders/cover-expired-ref-1/references/ref.jpg');
    const cover = await pool.query(
      'select reference_asset_id,had_reference from album_covers where order_id=$1',
      [orderId],
    );
    expect(cover.rows[0]).toMatchObject({ reference_asset_id: null, had_reference: true });
    const asset = await pool.query('select 1 from stored_files where id=$1', [
      reference.rows[0]?.id,
    ]);
    expect(asset.rowCount).toBe(0);
  });

  it('records provider cost without recalling it when cover storage fails', async () => {
    const order = await pool.query<{ id: string }>(
      `insert into orders(public_id,product_type,status,price_cents,access_token_hash)
       values('cover-storage-failure-1','friend_roast','audio_queued',4990,'hash') returning id`,
    );
    const orderId = order.rows[0]?.id as string;
    await pool.query('insert into story_sessions(order_id,data) values($1,$2)', [
      orderId,
      JSON.stringify({
        productType: 'friend_roast',
        buyerEmail: 'ana@example.test',
        subjectName: 'Bia',
        occasion: 'Aniversário',
        genre: 'pagode',
        voice: 'female',
        mood: 'animado',
        facts: ['Fato um', 'Fato dois'],
        relationship: 'Amiga',
        traits: ['Leal'],
        biggestStory: 'Fato um',
        roastLevel: 'light',
        safetyConfirmed: true,
        termsAccepted: true,
        marketingAccepted: false,
      }),
    ]);
    await pool.query(
      `insert into lyric_versions(order_id,number,kind,content,approved_at)
       values($1,1,'approved',$2,now())`,
      [orderId, JSON.stringify(approvedContent)],
    );
    await pool.query(
      `insert into album_covers(order_id,attempt,status,had_reference,model)
       values($1,1,'pending',false,$2)`,
      [orderId, config.openRouterCoverTextModel],
    );
    const insertedJob = await pool.query<{ id: string }>(
      `insert into generation_jobs(type,order_id,payload,idempotency_key,max_attempts)
       values('generate_cover',$1,'{"attempt":1}',$2,1) returning id`,
      [orderId, `cover:${orderId}:1`],
    );
    const job: ClaimedJob = {
      id: insertedJob.rows[0]?.id as string,
      orderId,
      type: 'generate_cover',
      attempts: 1,
      maxAttempts: 1,
      payload: { attempt: 1 },
    };
    const generate = vi.fn(async () => ({
      bytes: Buffer.from([0xff, 0xd8, 0xff]),
      mime: 'image/jpeg' as const,
      usage: {
        requestId: null,
        model: config.openRouterCoverTextModel as string,
        inputTokens: 10,
        outputTokens: 100,
        costUsd: '0.0336',
        latencyMs: 15,
      },
    }));
    await expect(
      processCoverJob(
        pool,
        job,
        config,
        { generate },
        {
          put: async () => {
            throw new Error('storage unavailable');
          },
          get: vi.fn(),
          delete: vi.fn(),
        },
      ),
    ).rejects.toMatchObject({ terminal: true });
    expect(generate).toHaveBeenCalledTimes(1);
    const usage = await pool.query('select status,cost_usd,error from ai_usage where order_id=$1', [
      orderId,
    ]);
    expect(usage.rows[0]).toMatchObject({
      status: 'error',
      cost_usd: '0.033600',
      error: 'storage unavailable',
    });
  });
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

  it('terminal block fails the order via domain transition with failed event', async () => {
    const { orderId } = await setupOrder('audio-terminal-1', 'audio:terminal-1');
    await pool.query("update orders set status='audio_generating' where id=$1", [orderId]);
    await pool.query(
      "update generation_jobs set run_at = now() + interval '1 hour' where order_id != $1",
      [orderId],
    );
    const { createWorker } = await import('./worker.js');
    const worker = createWorker({ pool, config });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `data: ${JSON.stringify({ id: 'gen-blocked', error: { message: 'PROHIBITED_CONTENT' } })}\n\ndata: [DONE]\n\n`,
                  ),
                );
                controller.close();
              },
            }),
            { headers: { 'content-type': 'text/event-stream' } },
          ),
      ),
    );
    try {
      await worker.tick();
      await worker.waitForIdle();
    } finally {
      vi.unstubAllGlobals();
    }
    const status = await pool.query('select status from orders where id=$1', [orderId]);
    expect(status.rows[0]?.status).toBe('failed');
    const jobs = await pool.query('select status from generation_jobs where order_id=$1', [
      orderId,
    ]);
    expect(jobs.rows[0]?.status).toBe('failed');
    const events = await pool.query('select event from analytics_events where order_public_id=$1', [
      'audio-terminal-1',
    ]);
    expect(events.rows.map((row) => row.event)).toContain('failed');
  });
});
