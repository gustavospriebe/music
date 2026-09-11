import { existsSync, mkdtempSync } from 'node:fs';
import { mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { hashToken, stableDeliveryToken } from '@resenha/domain';
import { randomUUID } from 'node:crypto';
import type { EmailMessage, EmailProvider } from '@resenha/providers';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import type { ClaimedJob } from '@resenha/database';
import {
  cleanupExpiredCoverReferences,
  deliveryEmail,
  processAudioJob,
  processCoverJob,
  processNotificationJob,
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
  musicProvider: 'openrouter',
  musicModel: 'test-music-model',
  openRouterApiKey: 'test-key',
  openRouterMusicModel: 'test-music-model',
  googleApiKey: 'google-test-key',
  googleMusicModel: 'lyria-3.5',
  openRouterCoverTextModel: 'google/gemini-3.1-flash-lite-image',
  openRouterCoverReferenceModel: 'google/gemini-3.1-flash-image',
  email: {
    kind: 'local-log',
    from: 'test@example.test',
    basePath: join(flowStoragePath, 'emails'),
  },
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
    await pool.query(
      "update album_covers set created_at=now()-interval '8 days' where order_id=$1",
      [orderId],
    );
    expect(
      await cleanupExpiredCoverReferences(pool, { put: vi.fn(), get: vi.fn(), delete: vi.fn() }),
    ).toBe(0);
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
    await pool.query("update stored_files set created_at=now()-interval '8 days' where id=$1", [
      reference.rows[0]?.id,
    ]);
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
  await pool.query('truncate table analytics_events, orders cascade');
});

afterAll(async () => {
  await pool.end();
  await rm(flowStoragePath, { recursive: true, force: true });
});

describe('processAudioJob cost persistence', () => {
  it('persists processing before provider I/O, preserves completed audio and resumes only the failed variant', async () => {
    const { orderId, jobId } = await setupOrder('audio-progress-1', 'audio:progress-1');
    const job: ClaimedJob = {
      id: jobId,
      orderId,
      type: 'generate_audio',
      attempts: 1,
      maxAttempts: 6,
      payload: {},
    };
    let enteredFirst!: () => void;
    let enteredSecond!: () => void;
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    const first = new Promise<void>((resolve) => {
      enteredFirst = resolve;
    });
    const second = new Promise<void>((resolve) => {
      enteredSecond = resolve;
    });
    const firstGate = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const secondGate = new Promise<void>((resolve) => {
      finishSecond = resolve;
    });
    const generate = vi
      .fn()
      .mockImplementationOnce(async () => {
        enteredFirst();
        await firstGate;
        return okMusic('progress-first');
      })
      .mockImplementationOnce(async () => {
        enteredSecond();
        await secondGate;
        throw Object.assign(new Error('synthetic terminal'), { terminal: true });
      });
    const running = processAudioJob(pool, job, config, { generate });
    const rejected = expect(running).rejects.toMatchObject({ terminal: true });
    const read = async () =>
      (
        await pool.query(
          'select variant,status,asset_id,attempt from audio_generations where order_id=$1 order by variant',
          [orderId],
        )
      ).rows;
    let completedFirst: unknown;
    try {
      await first;
      expect(await read()).toEqual([
        { variant: 1, status: 'processing', asset_id: null, attempt: 1 },
      ]);
      finishFirst();
      await second;
      const progress = await read();
      expect(progress).toHaveLength(2);
      expect(progress[0]).toMatchObject({ variant: 1, status: 'completed', attempt: 1 });
      expect(progress[0].asset_id).toEqual(expect.any(String));
      expect(progress[1]).toEqual({ variant: 2, status: 'processing', asset_id: null, attempt: 1 });
      completedFirst = progress[0];
    } finally {
      finishFirst();
      finishSecond();
      await rejected;
    }
    expect((await read())[1]).toEqual({ variant: 2, status: 'failed', asset_id: null, attempt: 1 });
    const retry = vi.fn(async () => okMusic('progress-resumed'));
    await processAudioJob(pool, { ...job, attempts: 2 }, config, { generate: retry });
    expect(retry).toHaveBeenCalledTimes(1);
    const finished = await read();
    expect(finished[0]).toEqual(completedFirst);
    expect(finished[1]).toMatchObject({ variant: 2, status: 'completed', attempt: 2 });
    expect(finished[1].asset_id).toEqual(expect.any(String));
    expect(
      (await pool.query('select status from orders where id=$1', [orderId])).rows[0].status,
    ).toBe('review_required');
  });

  it('marks the variant failed when storing successful provider audio fails', async () => {
    const { orderId, jobId } = await setupOrder('audio-storage-progress', 'audio:storage-progress');
    const job: ClaimedJob = {
      id: jobId,
      orderId,
      type: 'generate_audio',
      attempts: 1,
      maxAttempts: 6,
      payload: {},
    };
    const storage = {
      put: vi.fn(async () => {
        throw new Error('synthetic storage failure');
      }),
      get: async () => Buffer.alloc(0),
      delete: async () => undefined,
    };
    await expect(
      processAudioJob(
        pool,
        job,
        config,
        { generate: async () => okMusic('progress-storage-failure') },
        [1, 2],
        storage,
      ),
    ).rejects.toThrow('synthetic storage failure');
    expect(
      (
        await pool.query(
          'select variant,status,asset_id,attempt from audio_generations where order_id=$1',
          [orderId],
        )
      ).rows,
    ).toEqual([{ variant: 1, status: 'failed', asset_id: null, attempt: 1 }]);
    expect(
      (await pool.query('select id from stored_files where order_id=$1', [orderId])).rows,
    ).toEqual([]);
    expect(
      (await pool.query('select status from ai_usage where order_id=$1', [orderId])).rows,
    ).toEqual([{ status: 'ok' }]);
  });

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

  it('persists the selected Google provider and model while keeping the normal order transition', async () => {
    const { orderId, jobId } = await setupOrder('audio-google-selection', 'audio:google-selection');
    const job: ClaimedJob = {
      id: jobId,
      orderId,
      type: 'generate_audio',
      attempts: 1,
      maxAttempts: 6,
      payload: { provider: 'google', model: 'lyria-3.5' },
    };
    await processAudioJob(pool, job, config, { generate: async () => okMusic('google-1') }, [1]);
    const audio = await pool.query(
      'select variant,status,provider,model,external_id from audio_generations where order_id=$1 order by variant',
      [orderId],
    );
    expect(audio.rows).toEqual([
      {
        variant: 1,
        status: 'completed',
        provider: 'google',
        model: 'lyria-3.5',
        external_id: 'google-1',
      },
    ]);
    const usage = await pool.query(
      'select kind,status,provider,model,external_id,cost_usd,error from ai_usage where order_id=$1',
      [orderId],
    );
    expect(usage.rows).toEqual([
      {
        kind: 'audio',
        status: 'ok',
        provider: 'google',
        model: 'lyria-3.5',
        external_id: 'google-1',
        cost_usd: '0.080000',
        error: null,
      },
    ]);
    expect(
      (await pool.query('select status from orders where id=$1', [orderId])).rows[0]?.status,
    ).toBe('audio_generating');
  });

  it('records a selected Google failure with sanitized metadata and no cost claim', async () => {
    const { orderId, jobId } = await setupOrder('audio-google-failure', 'audio:google-failure');
    const job: ClaimedJob = {
      id: jobId,
      orderId,
      type: 'generate_audio',
      attempts: 1,
      maxAttempts: 6,
      payload: { provider: 'google', model: 'lyria-3.5' },
    };
    const attempt = {
      sample: {
        requestId: 'google-failure-1',
        model: 'ignored-test-model',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: null,
        latencyMs: 31,
      },
      status: 'error' as const,
      error: 'Google music request failed without private payload',
    };
    await expect(
      processAudioJob(pool, job, config, {
        generate: async () => {
          throw Object.assign(new Error('Google music request failed without private payload'), {
            attempts: [attempt],
          });
        },
      }),
    ).rejects.toThrow('Google music request failed without private payload');
    const usage = await pool.query(
      'select provider,model,status,cost_usd,error from ai_usage where order_id=$1',
      [orderId],
    );
    expect(usage.rows).toEqual([
      {
        provider: 'google',
        model: 'lyria-3.5',
        status: 'error',
        cost_usd: null,
        error: 'Google music request failed without private payload',
      },
    ]);
    expect(
      (
        await pool.query('select status,provider,model from audio_generations where order_id=$1', [
          orderId,
        ])
      ).rows,
    ).toEqual([{ status: 'failed', provider: 'google', model: 'lyria-3.5' }]);
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

  it('fails an order and its job on the first HTTP 402 without scheduling another charge attempt', async () => {
    const { orderId, jobId } = await setupOrder('audio-limit-402', 'audio:limit-402');
    await pool.query('update generation_jobs set max_attempts=1 where id=$1', [jobId]);
    await pool.query(
      "update generation_jobs set run_at=now()+interval '1 hour' where order_id!=$1",
      [orderId],
    );
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message: 'private-provider-limit-payload',
              metadata: { limit_source: 'openrouter_key_limit' },
            },
          }),
          { status: 402 },
        ),
    );
    vi.stubGlobal('fetch', fetch);
    try {
      const worker = (await import('./worker.js')).createWorker({ pool, config });
      await worker.tick();
      await worker.waitForIdle();
      const job = (
        await pool.query('select status,attempts,last_error from generation_jobs where id=$1', [
          jobId,
        ])
      ).rows[0];
      expect(job).toMatchObject({ status: 'failed', attempts: 1 });
      expect(job.last_error).toContain('limite do provedor');
      expect(job.last_error).not.toContain('private-provider-limit-payload');
      expect(
        (await pool.query('select status from orders where id=$1', [orderId])).rows[0].status,
      ).toBe('failed');
      const usage = (
        await pool.query('select status,error from ai_usage where order_id=$1', [orderId])
      ).rows;
      expect(usage).toHaveLength(1);
      expect(usage[0].status).toBe('error');
      expect(usage[0].error).not.toContain('private-provider-limit-payload');
      await worker.tick();
      expect(fetch).toHaveBeenCalledTimes(1);

      // Same database mutation as admin retry: reopen the failed job without resetting history.
      await pool.query(
        "update generation_jobs set status='pending',run_at=now(),locked_at=null,locked_by=null,last_error=null,max_attempts=greatest(max_attempts,attempts+1) where id=$1",
        [jobId],
      );
      let generation = 0;
      const audio = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]).toString('base64');
      fetch.mockImplementation(
        async () =>
          new Response(
            `data: ${JSON.stringify({ id: `synthetic-resume-402-${++generation}`, choices: [{ delta: { audio: { data: audio } } }], usage: { cost: 0.08 } })}\n\ndata: [DONE]\n\n`,
            { headers: { 'content-type': 'text/event-stream' } },
          ),
      );
      await worker.tick();
      await worker.waitForIdle();
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(
        (await pool.query('select status,attempts from generation_jobs where id=$1', [jobId]))
          .rows[0],
      ).toMatchObject({ status: 'completed', attempts: 2 });
      expect(
        (await pool.query('select status from orders where id=$1', [orderId])).rows[0].status,
      ).toBe('review_required');
      expect(
        (
          await pool.query(
            "select variant from audio_generations where order_id=$1 and status='completed' order by variant",
            [orderId],
          )
        ).rows.map((row) => row.variant),
      ).toEqual([1, 2]);
    } finally {
      vi.unstubAllGlobals();
    }
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

describe('delivery notification intent', () => {
  const deliveredOrder = async (publicId: string) => {
    const result = await setupOrder(publicId, `audio:${publicId}`);
    await pool.query("update orders set status='delivered' where id=$1", [result.orderId]);
    return result;
  };
  const tokenOf = (text: string) => text.match(/\/entrega\/([A-Za-z0-9_-]+)/)?.[1] as string;
  const checkToken = async (orderId: string, text: string) => {
    const delivery = (
      await pool.query('select token_hash from deliveries where order_id=$1', [orderId])
    ).rows[0];
    expect(delivery.token_hash).toBe(hashToken(tokenOf(text), config.tokenPepper));
  };

  it('delivers two versions and writes one usable private local email without regenerating on retry', async () => {
    const { orderId, jobId } = await setupOrder('mail-auto', 'audio:mail-auto');
    await pool.query('insert into story_sessions(order_id,data) values($1,$2)', [
      orderId,
      JSON.stringify({ buyerEmail: 'ana@example.test' }),
    ]);
    const job = {
      id: jobId,
      orderId,
      type: 'generate_audio',
      attempts: 1,
      maxAttempts: 6,
      payload: {},
    };
    let count = 0;
    const music = { generate: vi.fn(async () => okMusic(`auto-${++count}`)) };
    const automatic = { ...config, reviewMode: 'automatic' as const };
    await processAudioJob(pool, job, automatic, music);
    await processAudioJob(pool, job, automatic, music);
    const intent = (await pool.query('select * from email_deliveries where order_id=$1', [orderId]))
      .rows;
    expect(intent).toHaveLength(1);
    expect(intent[0]).toMatchObject({
      status: 'sent',
      provider: 'local-log',
      recipient: 'ana@example.test',
      external_id: null,
    });
    const path = config.email.kind === 'local-log' ? config.email.basePath : '';
    const files = await readdir(path);
    expect(files).toHaveLength(1);
    const body = await readFile(join(path, files[0]!), 'utf8');
    await checkToken(orderId, body);
    expect(JSON.stringify(intent[0].message)).not.toContain(tokenOf(body));
    expect(music.generate).toHaveBeenCalledTimes(2);
    expect(
      (
        await pool.query(
          "select count(*)::int as n from analytics_events where order_public_id='mail-auto' and event='delivered'",
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (await pool.query('select status from orders where id=$1', [orderId])).rows[0].status,
    ).toBe('delivered');
    expect(
      (await pool.query('select count(*)::int as n from ai_usage where order_id=$1', [orderId]))
        .rows[0].n,
    ).toBe(2);
  });

  it('preserves the API link after manual audio approval without generating again', async () => {
    const { orderId, jobId } = await setupOrder('mail-manual', 'audio:mail-manual');
    await pool.query('insert into story_sessions(order_id,data) values($1,$2)', [
      orderId,
      JSON.stringify({ buyerEmail: 'manual@example.test' }),
    ]);
    const job = {
      id: jobId,
      orderId,
      type: 'generate_audio',
      attempts: 1,
      maxAttempts: 6,
      payload: {},
    };
    const music = { generate: vi.fn(async () => okMusic('manual-audio')) };
    await processAudioJob(pool, job, config, music);
    expect(
      (await pool.query('select status from orders where id=$1', [orderId])).rows[0].status,
    ).toBe('review_required');
    expect(
      (await pool.query('select count(*)::int as n from deliveries where order_id=$1', [orderId]))
        .rows[0].n,
    ).toBe(0);
    await pool.query("update orders set status='delivered' where id=$1", [orderId]);
    const deliveryId = randomUUID();
    const approvedToken = stableDeliveryToken(deliveryId, config.tokenPepper);
    const approvedHash = hashToken(approvedToken, config.tokenPepper);
    await pool.query('insert into deliveries(id,order_id,token_hash) values($1,$2,$3)', [
      deliveryId,
      orderId,
      approvedHash,
    ]);
    await processAudioJob(pool, job, config, music);
    expect(
      (await pool.query('select token_hash from deliveries where order_id=$1', [orderId])).rows[0]
        .token_hash,
    ).toBe(approvedHash);
    expect(music.generate).toHaveBeenCalledTimes(2);
    expect(
      (
        await pool.query('select status,recipient from email_deliveries where order_id=$1', [
          orderId,
        ])
      ).rows,
    ).toEqual([{ status: 'sent', recipient: 'manual@example.test' }]);
    expect(
      (await pool.query('select count(*)::int as n from deliveries where order_id=$1', [orderId]))
        .rows[0].n,
    ).toBe(1);
  });

  it('reuses the accepted message after a crash before recording success, even with changed config', async () => {
    const { orderId } = await deliveredOrder('mail-crash');
    const messages: { message: EmailMessage; key: string }[] = [];
    const provider: EmailProvider = {
      kind: 'resend',
      send: async (message, key) => {
        messages.push({ message, key });
        expect(
          (await pool.query('select status from email_deliveries where order_id=$1', [orderId]))
            .rows[0].status,
        ).toBe('pending');
        return { externalId: 'accepted-email' };
      },
    };
    const originalQuery = pool.query.bind(pool);
    const spy = vi.spyOn(pool, 'query');
    spy.mockImplementation(((query: string, values: unknown[]) => {
      if (query.startsWith("update email_deliveries set status='sent'"))
        return Promise.reject(new Error('simulated database disconnect'));
      return originalQuery(query, values);
    }) as typeof pool.query);
    try {
      await expect(
        deliveryEmail(pool, config, orderId, 'first@example.test', provider),
      ).rejects.toThrow('simulated database disconnect');
    } finally {
      spy.mockRestore();
    }
    await deliveryEmail(
      pool,
      {
        ...config,
        webUrl: 'http://changed',
        email: { kind: 'resend', from: 'changed@example.test', apiKey: 'key' },
      },
      orderId,
      'changed@example.test',
      provider,
    );
    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual(messages[0]);
    await checkToken(orderId, messages[0]!.message.text);
    const persisted = (
      await pool.query(
        'select status,external_id,recipient,message from email_deliveries where order_id=$1',
        [orderId],
      )
    ).rows[0];
    expect(persisted).toMatchObject({
      status: 'sent',
      external_id: 'accepted-email',
      recipient: 'first@example.test',
    });
    expect(JSON.stringify(persisted.message)).not.toContain(tokenOf(messages[0]!.message.text));
  });

  it('keeps one intent and stable token when concurrent attempts overlap', async () => {
    const { orderId } = await deliveredOrder('mail-concurrent');
    const messages: { message: EmailMessage; key: string }[] = [];
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider: EmailProvider = {
      kind: 'resend',
      send: async (message, key) => {
        messages.push({ message, key });
        if (messages.length === 2) release();
        await barrier;
        return { externalId: 'same-email' };
      },
    };
    await Promise.all(
      [1, 2].map(() => deliveryEmail(pool, config, orderId, 'buyer@example.test', provider)),
    );
    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual(messages[0]);
    const rows = (
      await pool.query('select status,external_id from email_deliveries where order_id=$1', [
        orderId,
      ])
    ).rows;
    expect(rows).toEqual([{ status: 'sent', external_id: 'same-email' }]);
    await checkToken(orderId, messages[0]!.message.text);
  });

  it('preserves existing legacy links and never guesses whether an old email was sent', async () => {
    const { orderId } = await deliveredOrder('mail-legacy');
    const oldHash = hashToken('old-private-token', config.tokenPepper);
    await pool.query('insert into deliveries(order_id,token_hash) values($1,$2)', [
      orderId,
      oldHash,
    ]);
    const provider: EmailProvider = { kind: 'resend', send: vi.fn() };
    await expect(
      deliveryEmail(pool, config, orderId, 'buyer@example.test', provider),
    ).rejects.toThrow('Legacy delivery notification requires review');
    await pool.query(
      "insert into email_deliveries(order_id,template,recipient,provider,status) values($1,'music_delivered','buyer@example.test','resend','sent')",
      [orderId],
    );
    await deliveryEmail(pool, config, orderId, 'buyer@example.test', provider);
    expect(provider.send).not.toHaveBeenCalled();
    expect(
      (await pool.query('select token_hash from deliveries where order_id=$1', [orderId])).rows[0]
        .token_hash,
    ).toBe(oldHash);
    expect(
      (
        await pool.query('select count(*)::int as n from email_deliveries where order_id=$1', [
          orderId,
        ])
      ).rows[0].n,
    ).toBe(1);
  });

  it.each(['revoked', 'expired'])(
    'does not reactivate a %s link after transport failure',
    async (state) => {
      const { orderId } = await deliveredOrder(`mail-${state}`);
      const send = vi.fn(async () => {
        throw new Error('transport unavailable');
      });
      const provider: EmailProvider = { kind: 'resend', send };
      await expect(
        deliveryEmail(pool, config, orderId, 'buyer@example.test', provider),
      ).rejects.toThrow('transport unavailable');
      const before = (
        await pool.query('select token_hash from deliveries where order_id=$1', [orderId])
      ).rows[0].token_hash;
      await pool.query(
        state === 'revoked'
          ? 'update deliveries set revoked_at=now() where order_id=$1'
          : "update deliveries set expires_at=now()-interval '1 minute' where order_id=$1",
        [orderId],
      );
      await expect(
        deliveryEmail(pool, config, orderId, 'buyer@example.test', provider),
      ).rejects.toMatchObject({ terminal: true });
      expect(send).toHaveBeenCalledTimes(1);
      expect(
        (await pool.query('select token_hash from deliveries where order_id=$1', [orderId])).rows[0]
          .token_hash,
      ).toBe(before);
      expect(
        (await pool.query('select status from email_deliveries where order_id=$1', [orderId]))
          .rows[0].status,
      ).toBe('pending');
    },
  );
});

describe('administrative recovery worker boundaries', () => {
  it('rejects an expected reference that was removed before calling the cover provider', async () => {
    const { orderId, jobId } = await setupOrder('cover-missing-ref', 'cover:missing-ref');
    await pool.query('insert into story_sessions(order_id,data) values($1,$2)', [
      orderId,
      JSON.stringify({
        productType: 'custom_song',
        buyerEmail: 'client@example.test',
        subjectName: 'Uma viagem',
        genre: 'MPB',
        mood: 'Calmo',
        voice: 'either',
        brief: 'Uma viagem para recordar',
        safetyConfirmed: true,
        termsAccepted: true,
      }),
    ]);
    await pool.query(
      "insert into album_covers(order_id,attempt,status,had_reference,model) values($1,1,'pending',true,'synthetic')",
      [orderId],
    );
    const generate = vi.fn();
    await expect(
      processCoverJob(
        pool,
        {
          id: jobId,
          orderId,
          type: 'generate_cover',
          attempts: 1,
          maxAttempts: 1,
          payload: { attempt: 1 },
        },
        config,
        { generate },
      ),
    ).rejects.toMatchObject({ terminal: true });
    expect(generate).not.toHaveBeenCalled();
    expect(
      (await pool.query('select status from album_covers where order_id=$1', [orderId])).rows[0]
        .status,
    ).toBe('failed');
  });
  it('replays only the delivery intent and refuses incomplete audio or changed order state', async () => {
    const { orderId, jobId } = await setupOrder('notification-only', 'notification:only');
    await pool.query('insert into story_sessions(order_id,data) values($1,$2)', [
      orderId,
      JSON.stringify({ buyerEmail: 'private@example.test' }),
    ]);
    const job: ClaimedJob = {
      id: jobId,
      orderId,
      type: 'deliver-notify',
      attempts: 1,
      maxAttempts: 1,
      payload: {},
    };
    const send = vi.fn(async () => ({ externalId: 'synthetic-notification' }));
    const provider: EmailProvider = { kind: 'local-log', send };
    await pool.query("update orders set status='delivered' where id=$1", [orderId]);
    await expect(processNotificationJob(pool, job, config, provider)).rejects.toMatchObject({
      terminal: true,
    });
    expect(send).not.toHaveBeenCalled();
    await pool.query("update orders set status='paid' where id=$1", [orderId]);
    await processAudioJob(pool, { ...job, type: 'generate_audio' }, config, {
      generate: async () => okMusic(randomUUID()),
    });
    const audio = (
      await pool.query('select * from audio_generations where order_id=$1 order by variant', [
        orderId,
      ])
    ).rows;
    await pool.query("update orders set status='delivered' where id=$1", [orderId]);
    await processNotificationJob(pool, job, config, provider);
    await processNotificationJob(pool, job, config, provider);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      (
        await pool.query('select * from audio_generations where order_id=$1 order by variant', [
          orderId,
        ])
      ).rows,
    ).toEqual(audio);
    await pool.query("update orders set status='revision_requested' where id=$1", [orderId]);
    await expect(processNotificationJob(pool, job, config, provider)).rejects.toMatchObject({
      terminal: true,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('dispatches a selected variant without replacing its completed partner', async () => {
    const { orderId, jobId } = await setupOrder('variant-admin-recovery', 'variant:admin-recovery');
    const job: ClaimedJob = {
      id: jobId,
      orderId,
      type: 'generate_audio',
      attempts: 1,
      maxAttempts: 6,
      payload: {},
    };
    await processAudioJob(pool, job, config, { generate: async () => okMusic(randomUUID()) });
    const partner = (
      await pool.query('select * from audio_generations where order_id=$1 and variant=2', [orderId])
    ).rows[0];
    await pool.query('delete from audio_generations where order_id=$1 and variant=1', [orderId]);
    await pool.query("update orders set status='audio_queued' where id=$1", [orderId]);
    await pool.query("update generation_jobs set run_at=now()+interval '1 hour' where id!=$1", [
      jobId,
    ]);
    await pool.query(
      "update generation_jobs set status='pending',run_at=now(),payload=$2 where id=$1",
      [jobId, JSON.stringify({ variant: 1 })],
    );
    const fetch = vi.fn(
      async () =>
        new Response(
          `data: ${JSON.stringify({ id: 'synthetic-variant-dispatch', choices: [{ delta: { audio: { data: mp3Bytes.toString('base64') } } }] })}\n\ndata: [DONE]\n\n`,
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    );
    vi.stubGlobal('fetch', fetch);
    try {
      await (await import('./worker.js')).createWorker({ pool, config }).tick();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      (
        await pool.query('select * from audio_generations where order_id=$1 and variant=2', [
          orderId,
        ])
      ).rows[0],
    ).toEqual(partner);
    expect(
      (await pool.query('select status from orders where id=$1', [orderId])).rows[0].status,
    ).toBe('review_required');
  });
});
