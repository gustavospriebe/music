import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { hashToken } from '@resenha/domain';
import { createDb, products } from '@resenha/database';
import { generatedLyricsSchema, type GeneratedLyrics } from '@resenha/contracts';
import { buildApp } from './app.js';
import { parseEnv } from './env.js';
import type { LyricsProvider, LyricsResult } from '@resenha/providers';
import { settlePublicLyrics } from './lyrics-test-support.js';

const env = parseEnv({
  NODE_ENV: 'test',
  DATABASE_URL:
    process.env.DATABASE_URL_TEST ?? 'postgresql://resenha:resenha@localhost:5433/resenha_test',
  COOKIE_SECRET: 'refinement-test-cookie-secret-more-than-32-chars',
  CUSTOMER_ACCESS_TOKEN_PEPPER: 'refinement-test-token-pepper-more-than-32-chars',
  ADMIN_EMAIL: 'refinement@example.test',
  ADMIN_PASSWORD: 'synthetic-password',
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
const settle = (publicId: string, provider: LyricsProvider) =>
  settlePublicLyrics(pool, publicId, provider, env.DATABASE_URL);
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
});

describe('refining a saved lyrics version', () => {
  it('passes explicit instructions and the saved version to the provider, preserving history and story', async () => {
    const generate = vi.fn<LyricsProvider['generate']>(async () => result());
    const app = await appWith({ generate });
    const order = await prepare(app);
    const saved = {
      ...original,
      title: 'Minha letra editada',
      fullLyrics: 'Um verso totalmente novo\nO refrão que acabei de escrever',
    };
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/orders/${order.publicId}/lyrics/1`,
          headers: order.headers,
          payload: saved,
        })
      ).statusCode,
    ).toBe(200);
    const before = (
      await app.inject({ url: `/api/v1/orders/${order.publicId}`, headers: order.headers })
    ).json();
    const refined = await app.inject({
      method: 'POST',
      url: order.url,
      headers: order.headers,
      payload: { instructions: '  Deixe o refrão mais animado  ', baseVersion: 2 },
    });
    expect(refined.statusCode).toBe(202);
    expect(refined.json()).toEqual({ accepted: true, status: 'lyrics_generating' });
    await settle(order.publicId, { generate });
    expect(generate.mock.calls[0]?.[2]).toEqual({
      instructions: 'Deixe o refrão mais animado',
      lyrics: {
        title: saved.title,
        fullLyrics: saved.fullLyrics,
        musicalDirection: saved.musicalDirection,
      },
    });
    const after = (
      await app.inject({ url: `/api/v1/orders/${order.publicId}`, headers: order.headers })
    ).json();
    expect(after.story).toEqual(before.story);
    expect(after.remainingGenerations).toBe(2);
    expect(after.lyrics.map((version: { number: number }) => version.number)).toEqual([3, 2, 1]);
    expect(after.lyrics.slice(1)).toEqual(before.lyrics);
    expect(after.lyrics[2].content).toEqual(original);
    expect(after.lyrics[0].content).toEqual(changed);
  });

  it.each([
    { instructions: 'ab', baseVersion: 1 },
    { instructions: 'x'.repeat(1001), baseVersion: 1 },
    { instructions: 'Direção válida', baseVersion: 0 },
    { instructions: 'Direção válida' },
    { baseVersion: 1 },
  ])('rejects malformed instructions before calling the provider: %j', async (payload) => {
    const generate = vi.fn(async () => result());
    const app = await appWith({ generate });
    const order = await prepare(app);
    expect(
      (await app.inject({ method: 'POST', url: order.url, headers: order.headers, payload }))
        .statusCode,
    ).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it('rejects stale, foreign and missing versions without spending a generation', async () => {
    const generate = vi.fn(async () => result());
    const app = await appWith({ generate });
    const order = await prepare(app);
    const foreign = await prepare(app);
    await pool.query(
      "insert into lyric_versions(order_id,number,kind,content) values($1,7,'edited',$2)",
      [foreign.id, JSON.stringify(changed)],
    );
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/orders/${order.publicId}/lyrics/1`,
          headers: order.headers,
          payload: changed,
        })
      ).statusCode,
    ).toBe(200);
    for (const [baseVersion, status] of [
      [1, 409],
      [7, 404],
      [999, 404],
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: order.url,
            headers: order.headers,
            payload: { instructions: 'Mude o andamento', baseVersion },
          })
        ).statusCode,
      ).toBe(status);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: order.url,
          headers: foreign.headers,
          payload: { instructions: 'Mude o andamento', baseVersion: 2 },
        })
      ).statusCode,
    ).toBe(401);
    expect(generate).not.toHaveBeenCalled();
  });

  it.each(['draft', 'story_completed', 'lyrics_approved', 'failed', 'lyrics_generating'])(
    'requires lyrics_ready instead of %s',
    async (status) => {
      const generate = vi.fn(async () => result());
      const app = await appWith({ generate });
      const order = await prepare(app, status);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: order.url,
            headers: order.headers,
            payload: { instructions: 'Mude o andamento', baseVersion: 1 },
          })
        ).statusCode,
      ).toBe(409);
      expect(generate).not.toHaveBeenCalled();
    },
  );

  it('keeps content safeguards and the total limit of four generated versions', async () => {
    const generate = vi.fn(async () => result());
    const app = await appWith({ generate });
    const order = await prepare(app);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: order.url,
          headers: order.headers,
          payload: { instructions: 'Clone a voz do cantor', baseVersion: 1 },
        })
      ).statusCode,
    ).toBe(400);
    for (const number of [2, 3, 4])
      await pool.query(
        "insert into lyric_versions(order_id,number,kind,content) values($1,$2,'generated',$3)",
        [order.id, number, JSON.stringify(original)],
      );
    const limited = await app.inject({
      method: 'POST',
      url: order.url,
      headers: order.headers,
      payload: { instructions: 'Deixe o refrão mais alegre', baseVersion: 4 },
    });
    expect(limited.statusCode).toBe(400);
    expect(limited.json().error.message).toContain('limite');
    expect(generate).not.toHaveBeenCalled();
    expect(
      (await app.inject({ url: `/api/v1/orders/${order.publicId}`, headers: order.headers })).json()
        .remainingGenerations,
    ).toBe(0);
  });

  it('blocks edits, approval and another refinement while the claimed generation is running', async () => {
    const generate = vi.fn(async () => result());
    const app = await appWith({ generate });
    const order = await prepare(app);
    const running = await app.inject({
      method: 'POST',
      url: order.url,
      headers: order.headers,
      payload: { instructions: 'Mais energia no refrão', baseVersion: 1 },
    });
    expect(running.statusCode).toBe(202);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/orders/${order.publicId}/lyrics/1`,
          headers: order.headers,
          payload: changed,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/orders/${order.publicId}/lyrics/1/approve`,
          headers: order.headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: order.url,
          headers: order.headers,
          payload: { instructions: 'Mude outra coisa', baseVersion: 1 },
        })
      ).statusCode,
    ).toBe(409);
    expect(generate).not.toHaveBeenCalled();
    await settle(order.publicId, { generate });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(
      (
        await pool.query('select number from lyric_versions where order_id=$1 order by number', [
          order.id,
        ])
      ).rows.map((row) => row.number),
    ).toEqual([1, 2]);
  });
  it('keeps the saved editor version when refinement fails, records the error and allows retry', async () => {
    const generate = vi
      .fn<LyricsProvider['generate']>()
      .mockRejectedValueOnce(
        Object.assign(new Error('synthetic definite provider failure'), { outcome: 'failed' }),
      )
      .mockResolvedValue(result());
    const provider = { generate };
    const app = await appWith(provider);
    const order = await prepare(app);
    const before = (
      await pool.query('select * from lyric_versions where order_id=$1 order by number', [order.id])
    ).rows;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: order.url,
          headers: order.headers,
          payload: { instructions: 'Mais energia no refrão', baseVersion: 1 },
        })
      ).statusCode,
    ).toBe(202);
    await settle(order.publicId, provider);
    const detail = (
      await app.inject({ url: `/api/v1/orders/${order.publicId}`, headers: order.headers })
    ).json();
    expect(detail.order.status).toBe('lyrics_ready');
    expect(detail.remainingGenerations).toBe(3);
    expect(
      (
        await pool.query('select * from lyric_versions where order_id=$1 order by number', [
          order.id,
        ])
      ).rows,
    ).toEqual(before);
    expect(
      (await pool.query('select status from ai_usage where order_id=$1', [order.id])).rows,
    ).toEqual([{ status: 'error' }]);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/orders/${order.publicId}/lyrics/1`,
          headers: order.headers,
          payload: changed,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: order.url,
          headers: order.headers,
          payload: { instructions: 'Mais energia no refrão', baseVersion: 2 },
        })
      ).statusCode,
    ).toBe(202);
    await settle(order.publicId, { generate });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('rejects unsafe saved content before submitting it to the provider', async () => {
    const generate = vi.fn(async () => result());
    const app = await appWith({ generate });
    const order = await prepare(app);
    await pool.query('update lyric_versions set content=$2 where order_id=$1', [
      order.id,
      JSON.stringify({ ...original, fullLyrics: 'Eu vou te matar' }),
    ]);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: order.url,
          headers: order.headers,
          payload: { instructions: 'Mais energia no refrão', baseVersion: 1 },
        })
      ).statusCode,
    ).toBe(400);
    expect(generate).not.toHaveBeenCalled();
    expect(
      (await pool.query('select status from orders where id=$1', [order.id])).rows[0].status,
    ).toBe('lyrics_ready');
  });

  it.each(['edit', 'approve'] as const)(
    'rechecks the current version and status after %s acquires the order lock first',
    async (action) => {
      const generate = vi.fn(async () => result());
      const app = await appWith({ generate });
      const order = await prepare(app);
      const blocker = await pool.connect();
      const waitForLocks = async (minimum: number) => {
        for (let attempt = 0; attempt < 200; attempt++) {
          const waiters = await pool.query(
            "select count(*)::int as count from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query ilike '%for update%'",
          );
          if (waiters.rows[0].count >= minimum) return;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        throw new Error('Expected order lock waiters did not arrive');
      };
      await blocker.query('begin');
      await blocker.query('select id from orders where id=$1 for update', [order.id]);
      try {
        const mutation = app.inject({
          method: action === 'edit' ? 'PATCH' : 'POST',
          url: `/api/v1/orders/${order.publicId}/lyrics/1${action === 'approve' ? '/approve' : ''}`,
          headers: order.headers,
          payload: action === 'edit' ? changed : {},
        });
        await waitForLocks(1);
        const refinement = app.inject({
          method: 'POST',
          url: order.url,
          headers: order.headers,
          payload: { instructions: 'Mais energia no refrão', baseVersion: 1 },
        });
        await waitForLocks(2);
        await blocker.query('commit');
        expect((await mutation).statusCode).toBe(200);
        expect((await refinement).statusCode).toBe(409);
        expect(generate).not.toHaveBeenCalled();
        expect(
          (
            await pool.query('select kind from lyric_versions where order_id=$1 order by number', [
              order.id,
            ])
          ).rows,
        ).toEqual([{ kind: 'generated' }, { kind: action === 'edit' ? 'edited' : 'approved' }]);
      } finally {
        await blocker.query('rollback');
        blocker.release();
      }
    },
  );
  it('rejects a valid view-only cookie for the same order before spending on refinement', async () => {
    const generate = vi.fn(async () => result());
    const app = await appWith({ generate });
    const order = await prepare(app, 'delivered');
    const token = randomUUID();
    await pool.query(
      'insert into deliveries(order_id,token_hash,delivered_at) values($1,$2,now())',
      [order.id, hashToken(token, env.CUSTOMER_ACCESS_TOKEN_PEPPER)],
    );
    const access = await app.inject({ method: 'POST', url: `/api/v1/deliveries/${token}/access` });
    expect(access.statusCode).toBe(200);
    const headers = { cookie: String(access.headers['set-cookie']).split(';')[0] ?? '' };
    await pool.query("update orders set status='lyrics_ready' where id=$1", [order.id]);
    const detail = await app.inject({ url: `/api/v1/orders/${order.publicId}`, headers });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().privateAccess).toBe(false);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: order.url,
          headers,
          payload: { instructions: 'Mais energia no refrão', baseVersion: 1 },
        })
      ).statusCode,
    ).toBe(401);
    expect(generate).not.toHaveBeenCalled();
  });
});
