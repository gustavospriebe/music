import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { claimNextJob, completeJob, releaseStaleJobs, type ClaimedJob } from '@resenha/database';
import {
  createStorage,
  type LyricsProvider,
  type MusicProvider,
  type EmailProvider,
  type CoverProvider,
  type StorageProvider,
} from '@resenha/providers';
import type { CreativeBrief, GeneratedLyrics } from '@resenha/contracts';
import { beginAiCall, recordAiUsage } from './ai-call.js';
import { processAudioJob } from './audio.js';
import { createWorker, readWorkerConfig } from './worker.js';
import { processCoverJob } from './cover.js';
import { processNotificationJob } from './notify.js';
import { processLyricsJob } from './lyrics.js';
import { testAudio } from './test-audio.js';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl) throw new Error('Requires isolated DATABASE_URL_TEST');
const url = new URL(databaseUrl);
if (
  !['127.0.0.1', 'localhost'].includes(url.hostname) ||
  !/(?:_test|_remediation_[a-z_]+)$/.test(url.pathname)
)
  throw new Error('Requires isolated remediation database');
const pool = new Pool({ connectionString: databaseUrl });
const ids: string[] = [];
let storagePath = '';
const brief: CreativeBrief = {
  productType: 'custom_song',
  subjectName: 'Bia',
  occasion: 'aniversário',
  intention: 'amizade',
  genre: 'pagode',
  voice: 'female',
  mood: 'animado',
  facts: ['Bia prepara feijoada aos domingos'],
  catchphrases: [],
  prohibitedTopics: [],
  brief: 'Uma música para Bia que prepara feijoada aos domingos.',
};
const lyrics: GeneratedLyrics = {
  title: 'Bia',
  summary: 'Aniversário',
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
    { type: 'verse', label: 'Verso', lyrics: 'Bia prepara feijoada aos domingos' },
    { type: 'chorus', label: 'Refrão', lyrics: 'Bia, canta para celebrar' },
    { type: 'outro', label: 'Final', lyrics: 'Domingo feliz' },
  ],
  fullLyrics: 'Bia prepara feijoada aos domingos\nBia, canta para celebrar\nDomingo feliz',
  safetyNotes: [],
};
const usage = () => ({
  requestId: randomUUID(),
  model: 'synthetic-model',
  inputTokens: 12,
  outputTokens: 18,
  costUsd: '0.01',
  costSource: 'reported' as const,
  latencyMs: 10,
});
const config = () =>
  readWorkerConfig({
    DATABASE_URL: databaseUrl,
    CUSTOMER_ACCESS_TOKEN_PEPPER: 'synthetic-test-pepper-at-least-thirty-two',
    OPENROUTER_API_KEY: 'test',
    OPENROUTER_TEXT_MODEL: 'synthetic-model',
    OPENROUTER_MUSIC_MODEL: 'synthetic-model',
    EMAIL_PROVIDER: 'local-log',
    EMAIL_FROM: 'test@example.test',
    LOCAL_STORAGE_PATH: storagePath,
    LOCAL_EMAIL_PATH: join(storagePath, 'emails'),
    PAYMENT_PROVIDER: 'disabled',
  });
const order = async (status = 'lyrics_generating') => {
  const id = randomUUID();
  ids.push(id);
  await pool.query(
    "insert into orders(id,public_id,product_type,status,price_cents,access_token_hash) values($1,$2,'custom_song',$3,1000,'test')",
    [id, randomUUID().replaceAll('-', ''), status],
  );
  await pool.query('insert into story_sessions(order_id,data) values($1,$2)', [
    id,
    JSON.stringify({ ...brief, buyerEmail: 'private-contact@example.test', termsAccepted: true }),
  ]);
  return id;
};
const enqueue = async (orderId: string, type: string, payload: unknown): Promise<string> => {
  const id = randomUUID();
  await pool.query(
    "insert into generation_jobs(id,order_id,type,payload,idempotency_key,run_at) values($1,$2,$3,$4,$5,'1970-01-01')",
    [id, orderId, type, JSON.stringify(payload), randomUUID()],
  );
  return id;
};
const claim = async (id: string): Promise<ClaimedJob> => {
  const job = await claimNextJob(pool, 'remediation-test', 60_000);
  if (!job || job.id !== id) throw new Error('Unexpected claim');
  return job;
};
const production = async () => {
  const orderId = await order('audio_queued');
  const lyric = await pool.query<{ id: string }>(
    "insert into lyric_versions(order_id,number,kind,content,approved_at) values($1,1,'generated',$2,now()) returning id",
    [orderId, JSON.stringify(lyrics)],
  );
  const row = await pool.query<{ id: string }>(
    "insert into productions(order_id,number,lyric_version_id,status,provenance) values($1,1,$2,'queued','recorded') returning id",
    [orderId, lyric.rows[0]!.id],
  );
  const productionId = row.rows[0]!.id;
  await pool.query('update orders set current_production_id=$2 where id=$1', [
    orderId,
    productionId,
  ]);
  const job = await claim(
    await enqueue(orderId, 'generate_audio', {
      productionId,
      provider: 'openrouter',
      model: 'synthetic-model',
    }),
  );
  return { orderId, productionId, job };
};
beforeAll(async () => {
  await pool.query('truncate table analytics_events, orders cascade');
  storagePath = await mkdtemp(join(tmpdir(), 'music-worker-remediation-'));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  if (ids.length) await pool.query('delete from orders where id=any($1::uuid[])', [ids.splice(0)]);
});
afterAll(async () => {
  await pool.end();
  await rm(storagePath, { recursive: true, force: true });
});

describe('worker remediation proof', () => {
  it('renews ownership during slow I/O and persists the call before sending private-free briefing', async () => {
    const orderId = await order();
    const jobId = await enqueue(orderId, 'generate_lyrics', { targetVersion: 1 });
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const provider: LyricsProvider = {
      generate: async (input) => {
        expect(input).not.toHaveProperty('buyerEmail');
        expect(input).not.toHaveProperty('termsAccepted');
        expect(
          (await pool.query('select status from ai_calls where job_id=$1', [jobId])).rows,
        ).toEqual([{ status: 'started' }]);
        entered();
        await wait;
        return { lyrics, usage: usage() };
      },
    };
    const worker = createWorker({
      pool,
      config: { ...config(), lockTimeoutMs: 120 },
      lyrics: provider,
    });
    const tick = worker.tick();
    await started;
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect((await releaseStaleJobs(pool, 120)).some((row) => row.id === jobId)).toBe(false);
    release();
    await tick;
    expect(
      (await pool.query('select status,attempts from generation_jobs where id=$1', [jobId])).rows,
    ).toEqual([{ status: 'completed', attempts: 1 }]);
  });

  it('retains reported spend on malformed paid lyrics and never repeats an unknown call automatically', async () => {
    const orderId = await order();
    const jobId = await enqueue(orderId, 'generate_lyrics', { targetVersion: 1 });
    const fetch = vi.fn(async () =>
      Response.json({
        id: 'paid-invalid',
        choices: [{ message: { content: 'invalid json' } }],
        usage: { prompt_tokens: 12, completion_tokens: 18, cost: 0.12 },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const worker = createWorker({ pool, config: config() });
    await worker.tick();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      (
        await pool.query('select cost_usd,cost_source,status from ai_usage where order_id=$1', [
          orderId,
        ])
      ).rows,
    ).toEqual([{ cost_usd: '0.120000', cost_source: 'reported', status: 'rejected' }]);
    expect(
      (await pool.query('select status from generation_jobs where id=$1', [jobId])).rows[0].status,
    ).toBe('failed');
    const other = await order();
    const first = await claim(await enqueue(other, 'generate_lyrics', { targetVersion: 1 }));
    await beginAiCall(pool, first, 'lyrics', 'openrouter', 'synthetic-model');
    await pool.query(
      "update generation_jobs set lease_expires_at=now()-interval '1 second' where id=$1",
      [first.id],
    );
    await releaseStaleJobs(pool, 60_000);
    const second = await claim(await enqueue(other, 'generate_lyrics', { targetVersion: 1 }));
    const generate = vi.fn();
    await expect(processLyricsJob(pool, second, config(), { generate })).rejects.toMatchObject({
      code: 'AI_RESULT_UNKNOWN',
    });
    expect(generate).not.toHaveBeenCalled();
    expect(
      (await pool.query('select cost_usd,cost_source from ai_usage where job_id=$1', [first.id]))
        .rows,
    ).toEqual([{ cost_usd: null, cost_source: 'unknown' }]);
  });

  it('fills an interrupted unknown cost once without permitting stale artifact writes', async () => {
    const orderId = await order();
    const job = await claim(await enqueue(orderId, 'generate_lyrics', { targetVersion: 1 }));
    const call = await beginAiCall(pool, job, 'lyrics', 'openrouter', 'synthetic-model');
    await pool.query(
      "update generation_jobs set lease_expires_at=now()-interval '1 second' where id=$1",
      [job.id],
    );
    await releaseStaleJobs(pool, 60_000);
    await recordAiUsage(pool, call, usage(), 'ok');
    await recordAiUsage(pool, call, { ...usage(), costUsd: '9.99' }, 'ok');
    expect(
      (await pool.query('select cost_source,cost_usd from ai_usage where ai_call_id=$1', [call.id]))
        .rows,
    ).toEqual([{ cost_source: 'reported', cost_usd: '0.010000' }]);
    expect(
      (
        await pool.query(
          "select data from order_events where order_id=$1 and type='ai_cost_observed'",
          [orderId],
        )
      ).rows,
    ).toEqual([{ data: { aiCallId: call.id, fromSource: 'unknown', toSource: 'reported' } }]);
    await expect(completeJob(pool, job)).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
    expect(
      (await pool.query('select 1 from lyric_versions where order_id=$1', [orderId])).rows,
    ).toHaveLength(0);
  });

  it('keeps both variants on the production lyric and enqueues notification separately', async () => {
    const { orderId, productionId, job } = await production();
    await pool.query(
      "insert into lyric_versions(order_id,number,kind,content,approved_at) values($1,2,'edited',$2,now())",
      [orderId, JSON.stringify({ ...lyrics, fullLyrics: 'NEW REVISION NEVER USE' })],
    );
    const generate = vi.fn(async (prompt: string) => {
      expect(prompt).toContain('Bia prepara feijoada');
      expect(prompt).not.toContain('NEW REVISION');
      const sample = usage();
      return {
        generation: {
          bytes: testAudio(),
          mime: 'audio/wav',
          externalId: sample.requestId,
          usage: sample,
        },
        attempts: [{ sample, status: 'ok' as const, error: null }],
      };
    });
    const provider: MusicProvider = { provider: 'openrouter', model: 'synthetic-model', generate };
    await processAudioJob(pool, job, { ...config(), reviewMode: 'automatic_release' }, provider);
    await completeJob(pool, job);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(
      (
        await pool.query('select production_id,token_hash from deliveries where order_id=$1', [
          orderId,
        ])
      ).rows,
    ).toEqual([{ production_id: productionId, token_hash: expect.any(String) }]);
    const files = await pool.query(
      'select a.production_id,a.duration_ms,a.selected,f.storage_key from audio_generations a join stored_files f on f.id=a.file_id where a.order_id=$1 order by variant',
      [orderId],
    );
    expect(files.rows).toHaveLength(2);
    expect(new Set(files.rows.map((row) => row.storage_key)).size).toBe(2);
    for (const row of files.rows)
      expect(row).toMatchObject({
        production_id: productionId,
        duration_ms: 12000,
        selected: true,
      });
    expect(
      (
        await pool.query(
          'select type,status from generation_jobs where order_id=$1 order by created_at',
          [orderId],
        )
      ).rows,
    ).toEqual([
      { type: 'generate_audio', status: 'completed' },
      { type: 'deliver_notify', status: 'pending' },
    ]);
    expect(
      (await pool.query('select 1 from email_deliveries where order_id=$1', [orderId])).rows,
    ).toHaveLength(0);
  });

  it('notifies each production once while preserving its existing private link', async () => {
    const fixture = await production();
    await pool.query(
      "insert into order_contacts(order_id,email,marketing_accepted) values($1,'test@example.test',false)",
      [fixture.orderId],
    );
    const music: MusicProvider = {
      provider: 'openrouter',
      model: 'synthetic-model',
      generate: async () => {
        const sample = usage();
        return {
          generation: {
            bytes: testAudio(),
            mime: 'audio/wav',
            externalId: sample.requestId,
            usage: sample,
          },
          attempts: [],
        };
      },
    };
    const links: string[] = [];
    const email: EmailProvider = {
      kind: 'local-log',
      send: async (message) => {
        links.push(message.text);
        return { externalId: randomUUID() };
      },
    };
    const run = async (job: ClaimedJob) => {
      await processAudioJob(pool, job, { ...config(), reviewMode: 'automatic_release' }, music);
      await completeJob(pool, job);
      const notifyId = (
        await pool.query(
          "select id from generation_jobs where order_id=$1 and type='deliver_notify' and status='pending'",
          [fixture.orderId],
        )
      ).rows[0].id;
      const notify = await claim(notifyId);
      await processNotificationJob(pool, notify, config(), email);
      await processNotificationJob(pool, notify, config(), email);
      await completeJob(pool, notify);
    };
    await run(fixture.job);
    const initial = (
      await pool.query('select id,token_hash from deliveries where order_id=$1', [fixture.orderId])
    ).rows[0];
    const next = (
      await pool.query<{ id: string }>(
        "insert into productions(order_id,number,lyric_version_id,status,provenance) select order_id,2,lyric_version_id,'queued','recorded' from productions where id=$1 returning id",
        [fixture.productionId],
      )
    ).rows[0]!.id;
    await pool.query(
      "update orders set current_production_id=$2,status='audio_queued' where id=$1",
      [fixture.orderId, next],
    );
    await run(
      await claim(
        await enqueue(fixture.orderId, 'generate_audio', {
          productionId: next,
          provider: 'openrouter',
          model: 'synthetic-model',
        }),
      ),
    );
    expect(links).toHaveLength(2);
    expect(links[0]).toBe(links[1]);
    expect(
      (
        await pool.query('select id,token_hash,production_id from deliveries where order_id=$1', [
          fixture.orderId,
        ])
      ).rows[0],
    ).toEqual({ ...initial, production_id: next });
    expect(
      (
        await pool.query(
          'select production_id,status from email_deliveries where order_id=$1 order by created_at',
          [fixture.orderId],
        )
      ).rows,
    ).toEqual([
      { production_id: fixture.productionId, status: 'sent' },
      { production_id: next, status: 'sent' },
    ]);
  });

  it('stops an uncertain email before the provider idempotency window expires', async () => {
    const fixture = await production();
    await pool.query(
      "insert into order_contacts(order_id,email,marketing_accepted) values($1,'test@example.test',false)",
      [fixture.orderId],
    );
    const sample = usage();
    const music: MusicProvider = {
      provider: 'openrouter',
      model: 'synthetic-model',
      generate: async () => ({
        generation: {
          bytes: testAudio(),
          mime: 'audio/wav',
          externalId: randomUUID(),
          usage: { ...sample, requestId: randomUUID() },
        },
        attempts: [],
      }),
    };
    await processAudioJob(
      pool,
      fixture.job,
      { ...config(), reviewMode: 'automatic_release' },
      music,
    );
    await completeJob(pool, fixture.job);
    const notify = await claim(
      (
        await pool.query(
          "select id from generation_jobs where order_id=$1 and type='deliver_notify'",
          [fixture.orderId],
        )
      ).rows[0].id,
    );
    const send = vi.fn(async () => {
      throw new Error('transport lost after send');
    });
    const email: EmailProvider = { kind: 'resend', send };
    await expect(processNotificationJob(pool, notify, config(), email)).rejects.toThrow();
    await pool.query(
      "update email_deliveries set created_at=now()-interval '23 hours' where order_id=$1",
      [fixture.orderId],
    );
    await expect(processNotificationJob(pool, notify, config(), email)).rejects.toMatchObject({
      code: 'JOB_EMAIL_REVIEW_REQUIRED',
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('never overwrites or deletes the winning cover after its former lease expires during upload', async () => {
    const fixture = await production();
    await completeJob(pool, fixture.job);
    await pool.query(
      "insert into album_covers(order_id,attempt,status,model) values($1,1,'pending','synthetic-cover')",
      [fixture.orderId],
    );
    const a = await claim(await enqueue(fixture.orderId, 'generate_cover', { attempt: 1 }));
    const coverConfig = {
      ...config(),
      openRouterCoverTextModel: 'synthetic-cover',
      openRouterCoverReferenceModel: 'synthetic-cover',
    };
    const provider: CoverProvider = {
      generate: async () => ({
        bytes: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        ),
        mime: 'image/png',
        usage: usage(),
      }),
    };
    let entered!: () => void;
    const firstPut = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let finish!: () => void;
    const hold = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let calls = 0;
    const objects = new Map<string, Buffer>();
    const storage: StorageProvider = {
      get: vi.fn(),
      open: vi.fn(),
      delete: async (key) => {
        objects.delete(key);
      },
      put: async (key, bytes, mime) => {
        calls++;
        if (calls === 1) {
          entered();
          await hold;
        }
        objects.set(key, bytes);
        return { key, size: bytes.length, mime };
      },
    };
    const oldAttempt = processCoverJob(pool, a, coverConfig, provider, storage).then(
      () => null,
      (error) => error,
    );
    await firstPut;
    await pool.query(
      "update generation_jobs set lease_expires_at=now()-interval '1 second' where id=$1",
      [a.id],
    );
    await releaseStaleJobs(pool, 60_000);
    // Explicit operator resolution of the unknown call permits this new owned execution.
    await pool.query("update ai_calls set status='failed' where job_id=$1 and status='unknown'", [
      a.id,
    ]);
    await pool.query("update album_covers set status='pending' where order_id=$1", [
      fixture.orderId,
    ]);
    await pool.query("update generation_jobs set status='pending' where id=$1", [a.id]);
    const b = await claim(a.id);
    await processCoverJob(pool, b, coverConfig, provider, storage);
    await completeJob(pool, b);
    const winner = (
      await pool.query(
        'select f.storage_key from album_covers c join stored_files f on f.id=c.cover_file_id where c.order_id=$1',
        [fixture.orderId],
      )
    ).rows[0].storage_key;
    finish();
    expect(await oldAttempt).toMatchObject({ code: 'JOB_LEASE_LOST' });
    expect(objects.has(winner)).toBe(true);
    expect(objects.size).toBe(1);
    expect(
      (await pool.query('select status from album_covers where order_id=$1', [fixture.orderId]))
        .rows[0].status,
    ).toBe('completed');
  });

  it('preserves the resumed cover reference when the former execution finishes after losing its lease', async () => {
    const fixture = await production();
    await completeJob(pool, fixture.job);
    const raster = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const referenceKey = `references/${randomUUID()}.png`;
    const storage = createStorage(config().storage);
    const deleted = vi.spyOn(storage, 'delete');
    await storage.put(referenceKey, raster, 'image/png');
    const reference = (
      await pool.query<{ id: string }>(
        "insert into stored_files(order_id,storage_key,mime_type,size_bytes) values($1,$2,'image/png',$3) returning id",
        [fixture.orderId, referenceKey, raster.length],
      )
    ).rows[0]!.id;
    await pool.query(
      "insert into album_covers(order_id,attempt,status,model,reference_file_id,had_reference) values($1,1,'pending','synthetic-cover',$2,true)",
      [fixture.orderId, reference],
    );
    const a = await claim(await enqueue(fixture.orderId, 'generate_cover', { attempt: 1 }));
    const coverConfig = {
      ...config(),
      openRouterCoverTextModel: 'synthetic-cover',
      openRouterCoverReferenceModel: 'synthetic-cover',
    };
    let startedA!: () => void;
    const enteredA = new Promise<void>((resolve) => {
      startedA = resolve;
    });
    let startedB!: () => void;
    const enteredB = new Promise<void>((resolve) => {
      startedB = resolve;
    });
    let finishA!: () => void;
    const holdA = new Promise<void>((resolve) => {
      finishA = resolve;
    });
    let finishB!: () => void;
    const holdB = new Promise<void>((resolve) => {
      finishB = resolve;
    });
    let calls = 0;
    const provider: CoverProvider = {
      generate: async (input) => {
        expect(input.reference).toEqual(raster);
        calls++;
        if (calls === 1) {
          startedA();
          await holdA;
        } else {
          startedB();
          await holdB;
        }
        return { bytes: raster, mime: 'image/png', usage: usage() };
      },
    };
    const former = processCoverJob(pool, a, coverConfig, provider, storage).then(
      () => null,
      (error) => error,
    );
    await enteredA;
    await pool.query(
      "update generation_jobs set lease_expires_at=now()-interval '1 second' where id=$1",
      [a.id],
    );
    await releaseStaleJobs(pool, 60_000);
    // Operator authorizes the unresolved prior call; B acquires a distinct lease with the same reference.
    await pool.query("update ai_calls set status='failed' where job_id=$1 and status='unknown'", [
      a.id,
    ]);
    await pool.query("update album_covers set status='pending' where order_id=$1", [
      fixture.orderId,
    ]);
    await pool.query("update generation_jobs set status='pending' where id=$1", [a.id]);
    const b = await claim(a.id);
    expect(b.leaseToken).not.toBe(a.leaseToken);
    const resumed = processCoverJob(pool, b, coverConfig, provider, storage);
    await enteredB;
    finishA();
    expect(await former).toMatchObject({ code: 'JOB_LEASE_LOST' });
    expect(deleted).not.toHaveBeenCalledWith(referenceKey);
    expect(await storage.get(referenceKey)).toEqual(raster);
    expect(
      (
        await pool.query('select reference_file_id,status from album_covers where order_id=$1', [
          fixture.orderId,
        ])
      ).rows,
    ).toEqual([{ reference_file_id: reference, status: 'processing' }]);
    expect(
      (await pool.query('select id from stored_files where id=$1', [reference])).rowCount,
    ).toBe(1);
    finishB();
    await resumed;
    await completeJob(pool, b);
    expect(deleted.mock.calls.filter(([key]) => key === referenceKey)).toHaveLength(1);
    expect(
      (
        await pool.query('select reference_file_id,status from album_covers where order_id=$1', [
          fixture.orderId,
        ])
      ).rows,
    ).toEqual([{ reference_file_id: null, status: 'completed' }]);
  });

  it('rejects short audio before storing and fences a cancelled in-flight paid result', async () => {
    const first = await production();
    const sample = usage();
    const provider: MusicProvider = {
      provider: 'openrouter',
      model: 'synthetic-model',
      generate: async () => ({
        generation: {
          bytes: testAudio(2),
          mime: 'audio/wav',
          externalId: sample.requestId,
          usage: sample,
        },
        attempts: [],
      }),
    };
    const storage = createStorage(config().storage);
    const put = vi.spyOn(storage, 'put');
    await expect(
      processAudioJob(pool, first.job, config(), provider, undefined, storage),
    ).rejects.toMatchObject({ code: 'AI_AUDIO_TOO_SHORT' });
    expect(put).not.toHaveBeenCalled();
    expect(
      (
        await pool.query('select selected,status from audio_generations where order_id=$1', [
          first.orderId,
        ])
      ).rows,
    ).toEqual([{ selected: false, status: 'failed' }]);
    const second = await production();
    provider.generate = async () => {
      await pool.query(
        "update generation_jobs set status='cancelled',lease_token=null,lease_expires_at=null where id=$1",
        [second.job.id],
      );
      await pool.query("update orders set status='refunded' where id=$1", [second.orderId]);
      const paid = usage();
      return {
        generation: {
          bytes: testAudio(),
          mime: 'audio/wav',
          externalId: paid.requestId,
          usage: paid,
        },
        attempts: [],
      };
    };
    await expect(
      processAudioJob(pool, second.job, config(), provider, undefined, storage),
    ).rejects.toMatchObject({ code: 'JOB_LEASE_LOST' });
    expect(
      (await pool.query('select 1 from stored_files where order_id=$1', [second.orderId])).rows,
    ).toHaveLength(0);
    expect(
      (
        await pool.query('select cost_source,cost_usd from ai_usage where order_id=$1', [
          second.orderId,
        ])
      ).rows,
    ).toEqual([{ cost_source: 'reported', cost_usd: '0.010000' }]);
    expect(
      (await pool.query('select status from orders where id=$1', [second.orderId])).rows[0].status,
    ).toBe('refunded');
  });
});
