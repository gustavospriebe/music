import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { completeJob, createDb, type ClaimedJob } from '@resenha/database';
import { hashToken, stableDeliveryToken } from '@resenha/domain';
import { createLocalStorage, type EmailProvider } from '@resenha/providers';
import { processAudioJob, processNotificationJob } from '@resenha/worker/worker';
import { testAudio } from '../../worker/src/test-audio.js';
import { buildApp } from './app.js';
import { parseEnv, type Env } from './env.js';
import { testWorkerConfig } from './lyrics-test-support.js';

const databaseUrl = process.env.DATABASE_URL_TEST;
const content = {
  title: 'Uma história',
  summary: 'Amigos e música',
  language: 'pt-BR',
  musicalDirection: {
    genre: 'MPB',
    mood: 'alegre',
    tempo: 'medium',
    voice: 'either',
    instrumentation: ['violão'],
  },
  pronunciationNotes: [],
  sections: [],
  fullLyrics: 'Uma história que continuamos cantando',
  safetyNotes: [],
};

describe.skipIf(!databaseUrl)('released production revisions (isolated PostgreSQL)', () => {
  let pool: ReturnType<typeof createDb>['pool'];
  let env: Env;
  let storageRoot: string;
  const apps: FastifyInstance[] = [];
  const orderIds: string[] = [];
  beforeAll(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('External calls forbidden in this test');
      }),
    );
    pool = createDb(databaseUrl!).pool;
    await pool.query('select production_id from email_deliveries limit 0');
    storageRoot = await mkdtemp(join(tmpdir(), 'production-revision-'));
    env = parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      WEB_URL: 'http://localhost:5175',
      COOKIE_SECRET: 'synthetic-cookie-secret-with-at-least-32-chars',
      CUSTOMER_ACCESS_TOKEN_PEPPER: 'synthetic-token-pepper-with-at-least-32-chars',
      ADMIN_EMAIL: 'revision@example.test',
      ADMIN_PASSWORD: 'synthetic-admin-password',
      PAYMENT_PROVIDER: 'disabled',
      LOCAL_STORAGE_PATH: storageRoot,
      OPENROUTER_MUSIC_MODEL: 'configured-new-model',
      POLICY_VERSION: 'test-v1',
    });
  });
  afterAll(async () => {
    for (const app of apps) await app.close();
    if (pool) {
      await pool.query('delete from payments where order_id=any($1::uuid[])', [orderIds]);
      await pool.query('delete from orders where id=any($1::uuid[])', [orderIds]);
      await pool.end();
    }
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });
  const claim = async (jobId: string): Promise<ClaimedJob> => {
    const leaseToken = randomUUID();
    const result = await pool.query(
      "update generation_jobs set status='processing',attempts=attempts+1,lease_token=$2,lease_expires_at=now()+interval '5 minutes',locked_at=now(),locked_by='revision-test' where id=$1 and status='pending' and attempts<max_attempts returning *",
      [jobId, leaseToken],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Fixture job was not claimable');
    return {
      id: row.id,
      orderId: row.order_id,
      type: row.type,
      payload: row.payload,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      leaseToken,
    };
  };
  const fixture = async (released = true) => {
    const app = await buildApp(env);
    apps.push(app);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/session',
      payload: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    const headers = { cookie: String(login.headers['set-cookie']).split(';')[0]! };
    const publicId = randomUUID().replaceAll('-', '');
    const orderId = (
      await pool.query<{ id: string }>(
        "insert into orders(public_id,product_type,status,price_cents,access_token_hash) values($1,'custom_song',$2,4990,'synthetic') returning id",
        [publicId, released ? 'delivered' : 'review_required'],
      )
    ).rows[0]!.id;
    orderIds.push(orderId);
    await pool.query("insert into order_contacts(order_id,email) values($1,'buyer@example.test')", [
      orderId,
    ]);
    await pool.query(
      "insert into payments(order_id,provider,status,amount_cents,attempt,idempotency_key,external_reference) values($1,'dev','approved',4990,1,$2,$3)",
      [orderId, randomUUID(), randomUUID()],
    );
    const lyricId = (
      await pool.query<{ id: string }>(
        "insert into lyric_versions(order_id,number,kind,content,approved_at) values($1,1,'approved',$2,now()) returning id",
        [orderId, JSON.stringify(content)],
      )
    ).rows[0]!.id;
    const productionId = (
      await pool.query<{ id: string }>(
        'insert into productions(order_id,number,lyric_version_id,status) values($1,1,$2,$3) returning id',
        [orderId, lyricId, released ? 'completed' : 'review_required'],
      )
    ).rows[0]!.id;
    await pool.query('update orders set current_production_id=$2 where id=$1', [
      orderId,
      productionId,
    ]);
    const storage = createLocalStorage(storageRoot);
    for (const variant of [1, 2]) {
      const bytes = testAudio();
      const key = `${publicId}/${variant}.wav`;
      await storage.put(key, bytes, 'audio/wav');
      const fileId = (
        await pool.query<{ id: string }>(
          "insert into stored_files(order_id,storage_key,mime_type,size_bytes) values($1,$2,'audio/wav',$3) returning id",
          [orderId, key, bytes.length],
        )
      ).rows[0]!.id;
      await pool.query(
        "insert into audio_generations(order_id,production_id,variant,status,selected,duration_ms,file_id,provider,model,external_id,attempt) values($1,$2,$3,'completed',true,12000,$4,'openrouter','source-model',$5,1)",
        [orderId, productionId, variant, fileId, `original-${randomUUID()}`],
      );
    }
    const audio = (
      await pool.query('select * from audio_generations where production_id=$1 order by variant', [
        productionId,
      ])
    ).rows;
    const deliveryId = randomUUID();
    if (released) {
      await pool.query(
        'insert into deliveries(id,order_id,production_id,token_hash,delivered_at) values($1,$2,$3,$4,now())',
        [
          deliveryId,
          orderId,
          productionId,
          hashToken(
            stableDeliveryToken(deliveryId, env.CUSTOMER_ACCESS_TOKEN_PEPPER),
            env.CUSTOMER_ACCESS_TOKEN_PEPPER,
          ),
        ],
      );
      await pool.query(
        "insert into email_deliveries(order_id,production_id,template,recipient,provider,status,external_id) values($1,$2,'music_delivered','buyer@example.test','local-log','sent','original-message')",
        [orderId, productionId],
      );
    }
    const regenerate = () =>
      app.inject({
        method: 'POST',
        url: `/api/v1/admin/orders/${orderId}/audio/${audio[0].id}/regenerate`,
        headers,
      });
    return { app, headers, orderId, productionId, lyricId, audio, deliveryId, regenerate };
  };

  it('revises one released track with one generation, preserves lineage and sends a new production notification', async () => {
    const f = await fixture();
    const originalDelivery = (
      await pool.query('select * from deliveries where order_id=$1', [f.orderId])
    ).rows[0];
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: `/api/v1/admin/orders/${f.orderId}/audio/${f.audio[0].id}/regenerate`,
        })
      ).statusCode,
    ).toBe(401);
    const responses = await Promise.all([f.regenerate(), f.regenerate()]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    const production = (
      await pool.query('select * from productions where order_id=$1 order by number', [f.orderId])
    ).rows;
    expect(production).toHaveLength(2);
    expect(production[0]).toMatchObject({
      id: f.productionId,
      status: 'completed',
      lyric_version_id: f.lyricId,
    });
    const nextId = production[1].id as string;
    expect(production[1]).toMatchObject({
      status: 'queued',
      lyric_version_id: f.lyricId,
      number: 2,
    });
    expect(
      (await pool.query('select * from deliveries where order_id=$1', [f.orderId])).rows[0],
    ).toEqual(originalDelivery);
    expect(
      (
        await pool.query(
          'select * from audio_generations where production_id=$1 order by variant',
          [f.productionId],
        )
      ).rows,
    ).toEqual(f.audio);
    const reused = (
      await pool.query('select * from audio_generations where production_id=$1', [nextId])
    ).rows[0];
    expect(reused).toMatchObject({
      variant: 2,
      file_id: f.audio[1].file_id,
      external_id: f.audio[1].external_id,
      selected: true,
      duration_ms: 12000,
      job_id: null,
    });
    expect(
      (
        await pool.query(
          "select data from order_events where order_id=$1 and type='audio_reused'",
          [f.orderId],
        )
      ).rows,
    ).toEqual([
      {
        data: {
          productionId: nextId,
          audioId: reused.id,
          sourceProductionId: f.productionId,
          sourceAudioId: f.audio[1].id,
          variant: 2,
          lyricVersion: 1,
        },
      },
    ]);
    const jobs = (
      await pool.query(
        "select * from generation_jobs where order_id=$1 and type='generate_audio'",
        [f.orderId],
      )
    ).rows;
    expect(jobs).toHaveLength(1);
    expect(jobs[0].payload).toEqual({
      productionId: nextId,
      provider: 'openrouter',
      model: 'source-model',
      variant: 1,
    });
    expect(
      (await pool.query('select id from ai_calls where order_id=$1', [f.orderId])).rows,
    ).toHaveLength(0);

    const generate = vi.fn(async () => ({
      generation: {
        bytes: testAudio(),
        mime: 'audio/wav',
        externalId: 'synthetic-new-track',
        usage: {
          requestId: 'synthetic-new-track',
          model: 'source-model',
          inputTokens: 10,
          outputTokens: 20,
          costUsd: '0.08',
          costSource: 'reported' as const,
          latencyMs: 10,
        },
      },
      attempts: [],
    }));
    const config = {
      ...testWorkerConfig(databaseUrl!),
      storagePath: storageRoot,
      storage: { kind: 'local' as const, basePath: storageRoot },
      tokenPepper: env.CUSTOMER_ACCESS_TOKEN_PEPPER,
    };
    const job = await claim(jobs[0].id);
    await processAudioJob(pool, job, config, { generate });
    await completeJob(pool, job);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(
      (await pool.query('select id from ai_calls where order_id=$1', [f.orderId])).rows,
    ).toHaveLength(1);
    const newAudio = (
      await pool.query(
        'select id from audio_generations where production_id=$1 and variant=1 and selected',
        [nextId],
      )
    ).rows[0];
    const approved = await f.app.inject({
      method: 'POST',
      url: `/api/v1/admin/orders/${f.orderId}/audio/${newAudio.id}/approve`,
      headers: f.headers,
    });
    expect(approved.statusCode).toBe(200);
    expect(
      (await pool.query('select production_id from deliveries where order_id=$1', [f.orderId]))
        .rows[0].production_id,
    ).toBe(nextId);
    const notification = (
      await pool.query(
        "select id from generation_jobs where order_id=$1 and type='deliver_notify' and status='pending'",
        [f.orderId],
      )
    ).rows[0];
    expect(notification).toBeDefined();
    const send = vi.fn(async () => ({ externalId: 'new-production-message' }));
    const email: EmailProvider = { kind: 'local-log', send };
    const notifyJob = await claim(notification.id);
    await processNotificationJob(pool, notifyJob, config, email);
    await processNotificationJob(pool, notifyJob, config, email);
    await completeJob(pool, notifyJob);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      (
        await pool.query(
          'select production_id,status,external_id from email_deliveries where order_id=$1 order by created_at',
          [f.orderId],
        )
      ).rows,
    ).toEqual([
      { production_id: f.productionId, status: 'sent', external_id: 'original-message' },
      { production_id: nextId, status: 'sent', external_id: 'new-production-message' },
    ]);
  });

  it.each(['revision_requested', 'failed'])(
    'forks a completed production even after order status changes to %s',
    async (status) => {
      const f = await fixture();
      await pool.query('update orders set status=$2 where id=$1', [f.orderId, status]);
      expect((await f.regenerate()).statusCode).toBe(200);
      expect(
        (
          await pool.query('select id,status from productions where order_id=$1 order by number', [
            f.orderId,
          ])
        ).rows,
      ).toEqual([
        { id: f.productionId, status: 'completed' },
        { id: expect.any(String), status: 'queued' },
      ]);
    },
  );

  it.each(['changed_lyrics', 'invalid_partner'])(
    'refuses a single-track request with %s without scheduling hidden extra cost',
    async (reason) => {
      const f = await fixture();
      if (reason === 'changed_lyrics')
        await pool.query(
          "insert into lyric_versions(order_id,number,kind,content,approved_at) values($1,2,'approved',$2,now())",
          [f.orderId, JSON.stringify({ ...content, fullLyrics: 'Uma letra diferente' })],
        );
      else
        await pool.query('update audio_generations set duration_ms=9000 where id=$1', [
          f.audio[1].id,
        ]);
      const response = await f.regenerate();
      expect(response.statusCode).toBe(409);
      expect(response.json().error.message).toContain('duas versões');
      expect(
        (await pool.query('select id from productions where order_id=$1', [f.orderId])).rows,
      ).toEqual([{ id: f.productionId }]);
      expect(
        (await pool.query('select id from generation_jobs where order_id=$1', [f.orderId])).rows,
      ).toHaveLength(0);
    },
  );

  it('keeps an unreleased partial recovery in the same production without erasing its partner', async () => {
    const f = await fixture(false);
    expect((await f.regenerate()).statusCode).toBe(200);
    expect(
      (await pool.query('select id,status from productions where order_id=$1', [f.orderId])).rows,
    ).toEqual([{ id: f.productionId, status: 'queued' }]);
    expect(
      (
        await pool.query(
          'select id,selected from audio_generations where production_id=$1 order by variant',
          [f.productionId],
        )
      ).rows,
    ).toEqual([
      { id: f.audio[0].id, selected: false },
      { id: f.audio[1].id, selected: true },
    ]);
    expect(
      (
        await pool.query(
          "select data from order_events where order_id=$1 and type='audio_reused'",
          [f.orderId],
        )
      ).rows,
    ).toHaveLength(0);
  });
});
