import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { hashToken, stableDeliveryToken } from '@resenha/domain';
import { mkdtempSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const storagePath = mkdtempSync(join(tmpdir(), 'admin-recovery-'));
import { createDb, products } from '@resenha/database';
import { generatedLyricsSchema, type GeneratedLyrics } from '@resenha/contracts';
import { buildApp } from './app.js';
import { parseEnv } from './env.js';
import type { LyricsProvider, LyricsResult } from '@resenha/providers';
import { settlePublicLyrics } from './lyrics-test-support.js';

const env = parseEnv({
  NODE_ENV: 'test',
  LOCAL_STORAGE_PATH: storagePath,
  DATABASE_URL:
    process.env.DATABASE_URL_TEST ?? 'postgresql://resenha:resenha@localhost:5433/resenha_test',
  COOKIE_SECRET: 'admin-recovery-cookie-secret-more-than-32-chars',
  CUSTOMER_ACCESS_TOKEN_PEPPER: 'refinement-test-token-pepper-more-than-32-chars',
  ADMIN_EMAIL: 'recovery@example.test',
  ADMIN_PASSWORD: 'synthetic-password',
  OPENROUTER_MUSIC_MODEL: 'openrouter/test-music-model',
});
const { db, pool } = createDb(env.DATABASE_URL);
const apps: FastifyInstance[] = [];
const original = generatedLyricsSchema.parse({
  title: 'O caminho',
  summary: 'Uma canção livre',
  language: 'pt-BR',
  musicalDirection: {
    genre: 'MPB',
    mood: 'Calmo',
    tempo: 'medium',
    voice: 'either',
    instrumentation: ['violão'],
  },
  pronunciationNotes: [],
  sections: [
    { type: 'verse', label: 'Verso', lyrics: 'Cada encontro é uma estação' },
    { type: 'chorus', label: 'Refrão', lyrics: 'Seguimos pela estrada' },
    { type: 'outro', label: 'Final', lyrics: 'E guardamos os momentos' },
  ],
  fullLyrics: 'Cada encontro é uma estação\nSeguimos pela estrada\nE guardamos os momentos',
  safetyNotes: [],
});
const changed = { ...original, title: 'Juntos pelo caminho' };
const result = (lyrics: GeneratedLyrics = changed): LyricsResult => ({
  lyrics,
  usage: {
    requestId: `synthetic-${randomUUID()}`,
    model: 'synthetic',
    inputTokens: 10,
    outputTokens: 20,
    costUsd: '0',
    costSource: 'reported',
    latencyMs: 1,
  },
});
const appWith = async (provider: LyricsProvider) => {
  const app = await buildApp(env, { lyrics: provider });
  apps.push(app);
  return app;
};
const prepare = async (app: FastifyInstance, status = 'lyrics_ready') => {
  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    payload: { productType: 'custom_song', creationKey: randomUUID() },
  });
  expect(created.statusCode).toBe(201);
  const publicId = created.json().publicId as string;
  const headers = { cookie: String(created.headers['set-cookie']).split(';')[0] ?? '' };
  const story = {
    productType: 'custom_song',
    intention: 'amizade',
    buyerEmail: 'private@example.test',
    subjectName: 'Amigos da estrada',
    occasion: '',
    genre: 'MPB',
    mood: 'Calmo',
    voice: 'either',
    brief: 'Uma música sobre os amigos encontrados pelo caminho',
    safetyConfirmed: true,
    termsAccepted: true,
    policyVersion: 'draft-v1',
  };
  expect(
    (
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/orders/${publicId}/story`,
        headers,
        payload: story,
      })
    ).statusCode,
  ).toBe(200);
  const id = (
    await pool.query('update orders set status=$1 where public_id=$2 returning id', [
      status,
      publicId,
    ])
  ).rows[0].id as string;
  await pool.query(
    "insert into lyric_versions(order_id,number,kind,content) values($1,1,'generated',$2)",
    [id, JSON.stringify(original)],
  );
  return { publicId, id, headers, url: `/api/v1/orders/${publicId}/lyrics/generate` };
};
beforeAll(async () => {
  await db
    .insert(products)
    .values({ type: 'custom_song', name: 'Sua música', priceCents: 0 })
    .onConflictDoNothing();
});
afterAll(async () => {
  for (const app of apps) await app.close();
  await pool.end();
  await rm(storagePath, { recursive: true, force: true });
});

const adminFor = async (app: FastifyInstance) => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/session',
    payload: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  return { cookie: String(response.headers['set-cookie']).split(';')[0] ?? '' };
};
const paid = async (id: string) => {
  await pool.query(
    "insert into payments(order_id,provider,status,amount_cents,attempt,idempotency_key,external_reference) values($1,'dev','approved',0,1,gen_random_uuid()::text,gen_random_uuid()::text)",
    [id],
  );
  await pool.query('update lyric_versions set approved_at=now() where order_id=$1', [id]);
  const production = await pool.query(
    `insert into productions(order_id,number,lyric_version_id,status) select $1::uuid,1,id,'review_required' from lyric_versions where order_id=$1 order by number desc limit 1 returning id`,
    [id],
  );
  await pool.query('update orders set current_production_id=$2 where id=$1', [
    id,
    production.rows[0].id,
  ]);
};
const jobFor = async (
  id: string,
  type = 'generate_audio',
  payload: Record<string, unknown> = {},
  status = 'failed',
) => {
  const order = (await pool.query('select current_production_id from orders where id=$1', [id]))
    .rows[0];
  const target = (
    await pool.query(
      'select coalesce(max(number),0)+1 as number from lyric_versions where order_id=$1',
      [id],
    )
  ).rows[0].number;
  const persisted =
    type === 'generate_audio'
      ? { productionId: order.current_production_id, ...payload }
      : type === 'generate_lyrics'
        ? { targetVersion: target, ...payload }
        : payload;
  return (
    await pool.query(
      'insert into generation_jobs(order_id,type,payload,idempotency_key,status,attempts,max_attempts,last_error) values($1,$2,$3,$4,$5,6,6,$6) returning id',
      [id, type, JSON.stringify(persisted), randomUUID(), status, 'private provider payload'],
    )
  ).rows[0].id as string;
};

const audioFor = async (orderId: string) => {
  const current = await pool.query('select current_production_id from orders where id=$1', [
    orderId,
  ]);
  let productionId = current.rows[0].current_production_id as string | null;
  if (!productionId) {
    const created = await pool.query(
      `insert into productions(order_id,number,lyric_version_id,status) select $1::uuid,coalesce((select max(number) from productions where order_id=$1),0)+1,id,'review_required' from lyric_versions where order_id=$1 order by number desc limit 1 returning id`,
      [orderId],
    );
    productionId = created.rows[0].id as string;
    await pool.query('update orders set current_production_id=$2 where id=$1', [
      orderId,
      productionId,
    ]);
  }
  const sampleCount = 8000 * 12;
  const wav = Buffer.alloc(44 + sampleCount * 2);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(sampleCount * 2, 40);
  for (let index = 0; index < sampleCount; index++)
    wav.writeInt16LE(
      Math.round(2000 * Math.sin((index * 2 * Math.PI * 440) / 8000)),
      44 + index * 2,
    );
  const rows = [];
  for (const variant of [1, 2]) {
    const storageKey = `${randomUUID()}.wav`;
    await writeFile(join(storagePath, storageKey), wav);
    const assetId = (
      await pool.query(
        "insert into stored_files(order_id,storage_key,mime_type,size_bytes) values($1,$2,'audio/wav',$3) returning id",
        [orderId, storageKey, wav.length],
      )
    ).rows[0].id;
    rows.push(
      (
        await pool.query(
          "insert into audio_generations(order_id,variant,status,file_id,provider,model,production_id,selected,duration_ms) values($1,$2,'completed',$3,'google','lyria-3.5',$4,true,12000) returning *",
          [orderId, variant, assetId, productionId],
        )
      ).rows[0],
    );
  }
  return rows;
};
const linkFor = async (orderId: string) => {
  const id = randomUUID();
  await pool.query(
    'insert into deliveries(id,order_id,token_hash,delivered_at,production_id) values($1,$2,$3,now(),(select current_production_id from orders where id=$2::uuid))',
    [
      id,
      orderId,
      hashToken(
        stableDeliveryToken(id, env.CUSTOMER_ACCESS_TOKEN_PEPPER),
        env.CUSTOMER_ACCESS_TOKEN_PEPPER,
      ),
    ],
  );
};

describe('administrative recovery', () => {
  it('requires payment for audio, rejects active jobs and reports nonexistent jobs', async () => {
    const app = await appWith({ generate: async () => result() });
    const order = await prepare(app, 'failed');
    const admin = await adminFor(app);
    const jobId = await jobFor(order.id);
    const url = `/api/v1/admin/jobs/${jobId}/retry`;
    expect((await app.inject({ method: 'POST', url, headers: admin })).statusCode).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/orders/${order.id}/audio/rebuild`,
          headers: admin,
        })
      ).statusCode,
    ).toBe(409);
    await paid(order.id);
    await pool.query("update generation_jobs set status='processing' where id=$1", [jobId]);
    expect((await app.inject({ method: 'POST', url, headers: admin })).statusCode).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/jobs/${randomUUID()}/retry`,
          headers: admin,
        })
      ).statusCode,
    ).toBe(404);
  });
  it('restores failed text as an unapproved edited version and permits generation with the existing limit', async () => {
    const generate = vi.fn(async () => result());
    const app = await appWith({ generate });
    const order = await prepare(app, 'failed');
    const admin = await adminFor(app);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/admin/orders/${order.id}/lyrics`,
          headers: admin,
          payload: changed,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await pool.query('select status from orders where id=$1', [order.id])).rows[0].status,
    ).toBe('lyrics_ready');
    expect(
      (
        await pool.query(
          'select approved_at from lyric_versions where order_id=$1 order by number desc limit 1',
          [order.id],
        )
      ).rows[0].approved_at,
    ).toBeNull();
    await pool.query("update orders set status='failed' where id=$1", [order.id]);
    await pool.query('delete from lyric_versions where order_id=$1', [order.id]);
    const provider = { generate };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/orders/${order.id}/lyrics/generate`,
          headers: admin,
          payload: {},
        })
      ).statusCode,
    ).toBe(202);
    await settlePublicLyrics(pool, order.publicId, provider, env.DATABASE_URL);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(
      (await pool.query('select status from orders where id=$1', [order.id])).rows[0].status,
    ).toBe('lyrics_ready');
    expect(
      (await pool.query('select message from admin_notes where order_id=$1', [order.id])).rowCount,
    ).toBeGreaterThanOrEqual(2);
  });
  it('does not silently retry a cover after its reference was erased', async () => {
    const app = await appWith({ generate: async () => result() });
    const order = await prepare(app, 'delivered');
    await paid(order.id);
    const admin = await adminFor(app);
    await pool.query(
      "insert into album_covers(order_id,attempt,status,had_reference,model) values($1,1,'failed',true,'synthetic')",
      [order.id],
    );
    const jobId = await jobFor(order.id, 'generate_cover', { attempt: 1 });
    const detail = (
      await app.inject({ url: `/api/v1/admin/orders/${order.id}`, headers: admin })
    ).json();
    expect(detail.recovery.cover).toMatchObject({ canRetry: true, requiresReference: true, jobId });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/jobs/${jobId}/retry`,
          headers: admin,
          payload: {},
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await pool.query('select status from generation_jobs where id=$1', [jobId])).rows[0].status,
    ).toBe('failed');
  });
  it('reuploads a missing reference with file-first multipart while preserving attempt history', async () => {
    const app = await appWith({ generate: async () => result() });
    const order = await prepare(app, 'delivered');
    await paid(order.id);
    const admin = await adminFor(app);
    await pool.query(
      "insert into album_covers(order_id,attempt,status,had_reference,model,created_at) values($1,1,'failed',true,'synthetic',now()-interval '8 days')",
      [order.id],
    );
    const jobId = await jobFor(order.id, 'generate_cover', { attempt: 1 });
    const url = `/api/v1/admin/jobs/${jobId}/retry`;
    const body = (bytes: Buffer) =>
      Buffer.concat([
        Buffer.from(
          '--testboundary\r\nContent-Disposition: form-data; name="reference"; filename="foto.png"\r\nContent-Type: image/png\r\n\r\n',
        ),
        bytes,
        Buffer.from(
          '\r\n--testboundary\r\nContent-Disposition: form-data; name="consent"\r\n\r\ntrue\r\n--testboundary\r\nContent-Disposition: form-data; name="policyVersion"\r\n\r\ndraft-v1\r\n--testboundary--\r\n',
        ),
      ]);
    const headers = { ...admin, 'content-type': 'multipart/form-data; boundary=testboundary' };
    expect(
      (await app.inject({ method: 'POST', url, headers, payload: body(Buffer.from('invalid')) }))
        .statusCode,
    ).toBe(400);
    expect(
      (await pool.query('select status from album_covers where order_id=$1', [order.id])).rows[0]
        .status,
    ).toBe('failed');
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    expect(
      (await app.inject({ method: 'POST', url, headers, payload: body(png) })).statusCode,
    ).toBe(200);
    const cover = (await pool.query('select * from album_covers where order_id=$1', [order.id]))
      .rows[0];
    expect(cover).toMatchObject({ status: 'pending', attempt: 1, had_reference: true });
    expect(cover.reference_file_id).toEqual(expect.any(String));
    expect(cover.created_at.getTime()).toBeLessThan(Date.now() - 7 * 86400000);
    const detail = (
      await app.inject({ url: `/api/v1/admin/orders/${order.id}`, headers: admin })
    ).json();
    expect(detail.covers[0].referenceAvailable).toBe(true);
    expect(detail.jobs[0]).toMatchObject({
      attempts: 6,
      maxAttempts: 7,
      status: 'pending',
      canRetry: false,
    });
    expect(JSON.stringify(detail.notes)).not.toContain('private provider payload');
    expect(detail.notes[0].adminUserId).toEqual(expect.any(String));
    expect(
      (await app.inject({ method: 'POST', url, headers: admin, payload: {} })).statusCode,
    ).toBe(409);
  });
  it('serializes retry against rebuild and preserves completed variants during a retry', async () => {
    const app = await appWith({ generate: async () => result() });
    const order = await prepare(app, 'failed');
    await paid(order.id);
    const admin = await adminFor(app);
    const audio = await audioFor(order.id);
    const jobId = await jobFor(order.id, 'generate_audio', {
      provider: 'google',
      model: 'lyria-3.5',
    });
    const responses = await Promise.all([
      app.inject({ method: 'POST', url: `/api/v1/admin/jobs/${jobId}/retry`, headers: admin }),
      app.inject({ method: 'POST', url: `/api/v1/admin/jobs/${jobId}/retry`, headers: admin }),
    ]);
    expect(responses.map((item) => item.statusCode).sort()).toEqual([200, 409]);
    expect(
      (
        await pool.query('select payload,status,max_attempts from generation_jobs where id=$1', [
          jobId,
        ])
      ).rows[0],
    ).toEqual({
      payload: { provider: 'google', model: 'lyria-3.5', productionId: audio[0].production_id },
      status: 'pending',
      max_attempts: 7,
    });
    expect(
      (
        await pool.query('select * from audio_generations where order_id=$1 order by variant', [
          order.id,
        ])
      ).rows,
    ).toEqual(audio);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/orders/${order.id}/audio/rebuild`,
          headers: admin,
        })
      ).statusCode,
    ).toBe(409);
    await pool.query("update generation_jobs set status='completed' where id=$1", [jobId]);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/orders/${order.id}/audio/${audio[0].id}/regenerate`,
          headers: admin,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await pool.query('select * from audio_generations where order_id=$1 and selected', [
          order.id,
        ])
      ).rows,
    ).toEqual([audio[1]]);
    expect(
      (
        await pool.query('select id,file_id,selected from audio_generations where id=$1', [
          audio[0].id,
        ])
      ).rows[0],
    ).toEqual({ id: audio[0].id, file_id: audio[0].file_id, selected: false });
    expect(
      (
        await pool.query(
          "select payload,max_attempts from generation_jobs where order_id=$1 and status='pending'",
          [order.id],
        )
      ).rows,
    ).toEqual([
      {
        payload: {
          variant: 1,
          provider: 'google',
          model: 'lyria-3.5',
          productionId: audio[0].production_id,
        },
        max_attempts: 1,
      },
    ]);
    await pool.query(
      "update generation_jobs set status='completed' where order_id=$1 and status='pending'",
      [order.id],
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/orders/${order.id}/audio/rebuild`,
          headers: admin,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await pool.query(
          "select payload from generation_jobs where order_id=$1 and status='pending' order by created_at desc limit 1",
          [order.id],
        )
      ).rows,
    ).toEqual([
      {
        payload: {
          provider: 'openrouter',
          model: 'openrouter/test-music-model',
          productionId: (
            await pool.query('select current_production_id from orders where id=$1', [order.id])
          ).rows[0].current_production_id,
        },
      },
    ]);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/admin/orders/${order.id}/lyrics`,
          headers: admin,
          payload: changed,
        })
      ).statusCode,
    ).toBe(409);
  });
  it('edits unpaid approval back to customer review but blocks pending checkout', async () => {
    const app = await appWith({ generate: async () => result() });
    const order = await prepare(app, 'lyrics_approved');
    const admin = await adminFor(app);
    await pool.query('update lyric_versions set approved_at=now() where order_id=$1', [order.id]);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/admin/orders/${order.id}/lyrics`,
          headers: admin,
          payload: changed,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await pool.query('select status from orders where id=$1', [order.id])).rows[0].status,
    ).toBe('lyrics_ready');
    await pool.query("update orders set status='payment_pending' where id=$1", [order.id]);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/admin/orders/${order.id}/lyrics`,
          headers: admin,
          payload: changed,
        })
      ).statusCode,
    ).toBe(409);
  });
  it('queues only a notification, excludes legacy active jobs, preserves sent intent and blocks revoked access', async () => {
    const app = await appWith({ generate: async () => result() });
    const order = await prepare(app, 'delivered');
    await paid(order.id);
    await audioFor(order.id);
    await linkFor(order.id);
    const admin = await adminFor(app);
    const legacy = await jobFor(order.id, 'generate_audio', {}, 'processing');
    const url = `/api/v1/admin/orders/${order.id}/email/retry`;
    expect((await app.inject({ method: 'POST', url, headers: admin })).statusCode).toBe(409);
    await pool.query("update generation_jobs set status='failed' where id=$1", [legacy]);
    const responses = await Promise.all([
      app.inject({ method: 'POST', url, headers: admin }),
      app.inject({ method: 'POST', url, headers: admin }),
    ]);
    expect(responses.map((item) => item.statusCode).sort()).toEqual([200, 409]);
    expect(
      (
        await pool.query(
          "select type from generation_jobs where order_id=$1 and status='pending'",
          [order.id],
        )
      ).rows,
    ).toEqual([{ type: 'deliver_notify' }]);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/orders/${order.id}/audio/rebuild`,
          headers: admin,
        })
      ).statusCode,
    ).toBe(409);
    await pool.query(
      "insert into email_deliveries(order_id,production_id,template,recipient,provider,status) values($1,(select current_production_id from orders where id=$1::uuid),'music_delivered','private@example.test','local-log','sent')",
      [order.id],
    );
    expect((await app.inject({ method: 'POST', url, headers: admin })).json()).toEqual({
      queued: false,
      alreadySent: true,
    });
    await pool.query('update deliveries set revoked_at=now() where order_id=$1', [order.id]);
    expect((await app.inject({ method: 'POST', url, headers: admin })).statusCode).toBe(409);
  });
  it.each(['unpaid-approved', 'paid-unapproved'] as const)(
    'enforces independent payment and approval gates: %s',
    async (scenario) => {
      const app = await appWith({ generate: async () => result() });
      const order = await prepare(app, 'failed');
      const admin = await adminFor(app);
      if (scenario === 'unpaid-approved')
        await pool.query('update lyric_versions set approved_at=now() where order_id=$1', [
          order.id,
        ]);
      else
        await pool.query(
          "insert into payments(order_id,provider,status,amount_cents,attempt,idempotency_key,external_reference) values($1,'dev','approved',0,1,gen_random_uuid()::text,gen_random_uuid()::text)",
          [order.id],
        );
      const jobId = await jobFor(order.id);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/admin/jobs/${jobId}/retry`,
            headers: admin,
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/admin/orders/${order.id}/audio/rebuild`,
            headers: admin,
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (await pool.query('select status,attempts from generation_jobs where id=$1', [jobId]))
          .rows[0],
      ).toEqual({ status: 'failed', attempts: 6 });
    },
  );
  it('enforces the four-generation cap on administrative generation and blocks customer generation after payment', async () => {
    const generate = vi.fn(async () => result());
    const app = await appWith({ generate });
    const order = await prepare(app, 'failed');
    const admin = await adminFor(app);
    for (const number of [2, 3, 4])
      await pool.query(
        "insert into lyric_versions(order_id,number,kind,content) values($1,$2,'generated',$3)",
        [order.id, number, JSON.stringify(original)],
      );
    const url = `/api/v1/admin/orders/${order.id}/lyrics/generate`;
    expect(
      (await app.inject({ method: 'POST', url, headers: admin, payload: {} })).statusCode,
    ).toBe(409);
    expect(generate).not.toHaveBeenCalled();
    const capability = (
      await app.inject({ url: `/api/v1/admin/orders/${order.id}`, headers: admin })
    ).json().recovery.lyrics;
    expect(capability).toMatchObject({
      canGenerate: false,
      canEdit: true,
      remainingGenerations: 0,
      editBlockedReason: null,
    });
    expect(capability.generateBlockedReason).toContain('limite de quatro');
    await paid(order.id);
    expect(
      (await app.inject({ method: 'POST', url: order.url, headers: order.headers, payload: {} }))
        .statusCode,
    ).toBe(409);
    expect(generate).not.toHaveBeenCalled();
  });
  it('keeps paid editorial history, validates the canonical edited text and sanitizes diagnostics with audit attribution', async () => {
    const app = await appWith({ generate: async () => result() });
    const order = await prepare(app, 'failed');
    await paid(order.id);
    const admin = await adminFor(app);
    const unsafe = {
      ...original,
      fullLyrics: 'Eu vou te matar',
      sections: [
        { ...original.sections[0], lyrics: 'Eu vou te matar' },
        ...original.sections.slice(1),
      ],
    };
    await pool.query('update lyric_versions set content=$2 where order_id=$1', [
      order.id,
      JSON.stringify(unsafe),
    ]);
    const safe = { ...unsafe, fullLyrics: original.fullLyrics };
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/admin/orders/${order.id}/lyrics`,
          headers: admin,
          payload: safe,
        })
      ).statusCode,
    ).toBe(200);
    const versions = (
      await pool.query(
        'select content,approved_at from lyric_versions where order_id=$1 order by number',
        [order.id],
      )
    ).rows;
    expect(versions).toHaveLength(2);
    expect(versions[0].content).toEqual(unsafe);
    expect(versions[1].content.fullLyrics).toBe(original.fullLyrics);
    expect(versions[1].approved_at).toBeInstanceOf(Date);
    const jobId = await jobFor(order.id);
    const privateError = 'HTTP 402 secret-token-should-not-escape private@example.test';
    await pool.query('update generation_jobs set last_error=$2 where id=$1', [jobId, privateError]);
    await pool.query(
      "insert into ai_usage(order_id,kind,provider,status,error) values($1,'lyrics','openrouter','error',$2)",
      [order.id, privateError],
    );
    const detail = (
      await app.inject({ url: `/api/v1/admin/orders/${order.id}`, headers: admin })
    ).json();
    expect(detail.jobs[0].errorCode).toBe('provider_limit');
    expect(detail.aiUsage[0].errorCode).toBe('provider_limit');
    expect(detail.jobs[0].lastError).toContain('limite da chave');
    expect(JSON.stringify(detail)).not.toContain('secret-token-should-not-escape');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/jobs/${jobId}/retry`,
          headers: admin,
        })
      ).statusCode,
    ).toBe(200);
    const notes = (
      await pool.query(
        'select message,admin_user_id,created_at from admin_notes where order_id=$1 order by created_at',
        [order.id],
      )
    ).rows;
    expect(
      notes.some(
        (note) =>
          note.message.includes('Diagnóstico anterior:') &&
          note.message.includes('limite da chave'),
      ),
    ).toBe(true);
    for (const note of notes) {
      expect(note.admin_user_id).toEqual(expect.any(String));
      expect(note.created_at).toBeInstanceOf(Date);
      expect(note.message).not.toContain('secret-token');
    }
  });
  it('finds current operational failures regardless of delivered status and excludes resolved history', async () => {
    const app = await appWith({ generate: async () => result() });
    const admin = await adminFor(app);
    const before = (await app.inject({ url: '/api/v1/admin/overview', headers: admin })).json()
      .attention.failedOperationalOrders;
    const prefix = `ops_${randomUUID().slice(0, 8)}`;
    const records = [];
    for (const number of [0, 1, 2, 3, 4]) {
      const order = await prepare(app, number === 0 ? 'failed' : 'delivered');
      await pool.query('update orders set public_id=$2 where id=$1', [
        order.id,
        `${prefix}_${number}`,
      ]);
      records.push(order);
    }
    await pool.query(
      "insert into album_covers(order_id,attempt,status,had_reference,model) values($1,1,'failed',false,'test')",
      [records[1]!.id],
    );
    await paid(records[2]!.id);
    await paid(records[3]!.id);
    // An older sent notice must not hide failure of the newly released production.
    await pool.query(
      "insert into email_deliveries(order_id,production_id,template,recipient,provider,status) select id,current_production_id,'music_delivered','test@example.test','local-log','sent' from orders where id=$1",
      [records[2]!.id],
    );
    const nextProduction = (
      await pool.query(
        "insert into productions(order_id,number,lyric_version_id,status) select order_id,2,lyric_version_id,'completed' from productions where order_id=$1 returning id",
        [records[2]!.id],
      )
    ).rows[0].id;
    await pool.query('update orders set current_production_id=$2 where id=$1', [
      records[2]!.id,
      nextProduction,
    ]);
    await jobFor(records[2]!.id, 'deliver_notify');
    await pool.query(
      "insert into album_covers(order_id,attempt,status,had_reference,model) values($1,1,'failed',false,'test'),($1,2,'completed',false,'test')",
      [records[3]!.id],
    );
    await jobFor(records[3]!.id, 'generate_audio');
    await pool.query(
      "insert into email_deliveries(order_id,production_id,template,recipient,provider,status) values($1,(select current_production_id from orders where id=$1::uuid),'music_delivered','test@example.test','local-log','sent')",
      [records[3]!.id],
    );
    await pool.query("update orders set status='review_required' where id=$1", [records[4]!.id]);
    const old = await jobFor(records[4]!.id);
    await pool.query("update generation_jobs set created_at=now()-interval '1 day' where id=$1", [
      old,
    ]);
    await jobFor(records[4]!.id, 'generate_audio', {}, 'completed');
    const list = (
      await app.inject({
        url: `/api/v1/admin/orders?attention=failures&q=${prefix}`,
        headers: admin,
      })
    ).json();
    expect(list.total).toBe(3);
    expect(list.items.map((item: { publicId: string }) => item.publicId).sort()).toEqual(
      [0, 1, 2].map((number) => `${prefix}_${number}`),
    );
    expect(
      (await app.inject({ url: '/api/v1/admin/overview', headers: admin })).json().attention
        .failedOperationalOrders,
    ).toBe(before + 3);
    expect(
      (await app.inject({ url: '/api/v1/admin/orders?attention=invalid', headers: admin }))
        .statusCode,
    ).toBe(400);
  });
  it.each(['cancelled', 'refunded', 'payment_pending'])(
    'blocks cover retry in incompatible stage %s despite historical payment',
    async (status) => {
      const app = await appWith({ generate: async () => result() });
      const order = await prepare(app, status);
      await paid(order.id);
      const admin = await adminFor(app);
      await pool.query(
        "insert into album_covers(order_id,attempt,status,had_reference,model) values($1,1,'failed',false,'test')",
        [order.id],
      );
      const jobId = await jobFor(order.id, 'generate_cover', { attempt: 1 });
      expect(
        (await app.inject({ url: `/api/v1/admin/orders/${order.id}`, headers: admin })).json()
          .recovery.cover.canRetry,
      ).toBe(false);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/admin/jobs/${jobId}/retry`,
            headers: admin,
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (await pool.query('select status from generation_jobs where id=$1', [jobId])).rows[0]
          .status,
      ).toBe('failed');
      expect(
        (await pool.query('select status from album_covers where order_id=$1', [order.id])).rows[0]
          .status,
      ).toBe('failed');
      if (['cancelled', 'refunded'].includes(status))
        expect(
          (
            await app.inject({
              url: `/api/v1/admin/orders?attention=failures&q=${order.publicId}`,
              headers: admin,
            })
          ).json().total,
        ).toBe(0);
    },
  );
});
