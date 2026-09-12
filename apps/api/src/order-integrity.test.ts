import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, products } from '@resenha/database';
import { buildApp } from './app.js';
import { parseEnv } from './env.js';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (
  !databaseUrl ||
  !['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname) ||
  !/test|remediation/.test(new URL(databaseUrl).pathname)
)
  throw new Error('An explicitly isolated local DATABASE_URL_TEST is required.');
const env = parseEnv({
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  COOKIE_SECRET: 'synthetic-cookie-secret-more-than-32-characters',
  CUSTOMER_ACCESS_TOKEN_PEPPER: 'synthetic-token-pepper-more-than-32-characters',
  ADMIN_EMAIL: 'audit@example.test',
  ADMIN_PASSWORD: 'synthetic-admin-password',
  PAYMENT_PROVIDER: 'disabled',
});
const { db, pool } = createDb(databaseUrl);
const app = await buildApp(env, {
  lyrics: {
    generate: async () => {
      throw new Error('No external call is authorized in this test');
    },
  },
});
const lyrics = {
  title: 'O passeio',
  summary: 'Uma boa memória',
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
    { type: 'verse', label: 'Verso', lyrics: 'Nosso passeio de bicicleta' },
    { type: 'chorus', label: 'Refrão', lyrics: 'Uma alegria que ficou' },
    { type: 'outro', label: 'Final', lyrics: 'Vamos celebrar' },
  ],
  fullLyrics: 'Nosso passeio de bicicleta\nUma alegria que ficou\nVamos celebrar',
  safetyNotes: [],
};
const prepare = async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    payload: { productType: 'custom_song', creationKey: randomUUID() },
  });
  expect(created.statusCode).toBe(201);
  const publicId = created.json().publicId as string;
  const headers = { cookie: String(created.headers['set-cookie']).split(';')[0]! };
  const saved = await app.inject({
    method: 'PATCH',
    url: `/api/v1/orders/${publicId}/story`,
    headers,
    payload: {
      productType: 'custom_song',
      buyerEmail: 'synthetic-buyer@example.test',
      buyerName: 'Pessoa fictícia',
      subjectName: 'Nosso passeio',
      genre: 'MPB',
      voice: 'either',
      mood: 'Calmo',
      brief: 'Um passeio de bicicleta com boas recordações',
      facts: ['Nosso passeio de bicicleta'],
      termsAccepted: true,
      safetyConfirmed: true,
      marketingAccepted: false,
      policyVersion: 'draft-v1',
    },
  });
  expect(saved.statusCode).toBe(200);
  const id = (
    await pool.query("update orders set status='lyrics_ready' where public_id=$1 returning id", [
      publicId,
    ])
  ).rows[0].id as string;
  await pool.query(
    "insert into lyric_versions(order_id,number,kind,content) values($1,1,'generated',$2)",
    [id, JSON.stringify(lyrics)],
  );
  return { id, publicId, headers };
};
const admin = async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/session',
    payload: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  return { cookie: String(response.headers['set-cookie']).split(';')[0]! };
};
beforeAll(async () => {
  await db
    .insert(products)
    .values({ type: 'custom_song', name: 'Sua música', priceCents: 4990 })
    .onConflictDoUpdate({ target: products.type, set: { active: true, priceCents: 4990 } });
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('order integrity at HTTP and persistence boundaries', () => {
  it('records explicit consent with version/time and keeps buyer contact outside the creative brief', async () => {
    const order = await prepare();
    const creative = (
      await pool.query('select data from story_sessions where order_id=$1', [order.id])
    ).rows[0].data;
    for (const key of [
      'buyerEmail',
      'buyerName',
      'termsAccepted',
      'marketingAccepted',
      'safetyConfirmed',
      'policyVersion',
    ])
      expect(creative).not.toHaveProperty(key);
    const consents = (
      await pool.query(
        'select kind,accepted,policy_version,recorded_at from order_consents where order_id=$1',
        [order.id],
      )
    ).rows;
    expect(consents).toHaveLength(4);
    expect(consents.find((row) => row.kind === 'marketing').accepted).toBe(false);
    expect(consents.every((row) => row.policy_version === 'draft-v1' && row.recorded_at)).toBe(
      true,
    );
    const read = (
      await app.inject({ url: `/api/v1/orders/${order.publicId}`, headers: order.headers })
    ).json();
    expect(read.story).toMatchObject({
      termsAccepted: true,
      safetyConfirmed: true,
      marketingKnown: true,
      policyVersion: 'draft-v1',
    });
    await pool.query('delete from order_consents where order_id=$1', [order.id]);
    const legacy = (
      await app.inject({ url: `/api/v1/orders/${order.publicId}`, headers: order.headers })
    ).json();
    expect(legacy.story).not.toHaveProperty('termsAccepted');
    expect(legacy.story.marketingKnown).toBe(false);
  });
  it('rejects prohibited public edits and approval overrides; keeps canonical edited text', async () => {
    const order = await prepare();
    const url = `/api/v1/orders/${order.publicId}/lyrics/1`;
    const dangerous = { ...lyrics, fullLyrics: 'Nosso passeio de bicicleta. Vou te matar.' };
    expect(
      (await app.inject({ method: 'PATCH', url, headers: order.headers, payload: dangerous }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `${url}/approve`,
          headers: order.headers,
          payload: { content: dangerous },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url,
          headers: order.headers,
          payload: { ...lyrics, fullLyrics: 'Texto que omite o fato obrigatório' },
        })
      ).statusCode,
    ).toBe(400);
    const newText = 'Nosso passeio de bicicleta\nAgora seguimos juntos em outra direção';
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `${url}/approve`,
          headers: order.headers,
          payload: { content: { ...lyrics, fullLyrics: newText } },
        })
      ).statusCode,
    ).toBe(200);
    const approved = (
      await pool.query("select content from lyric_versions where order_id=$1 and kind='approved'", [
        order.id,
      ])
    ).rows[0].content;
    expect(approved.fullLyrics).toBe(newText);
    expect(approved.sections).toEqual([]);
    expect(
      (
        await pool.query('select count(*)::int as count from lyric_versions where order_id=$1', [
          order.id,
        ])
      ).rows[0].count,
    ).toBe(2);
  });
  it('gives an explicitly retried lyrics job a claimable attempt budget', async () => {
    const order = await prepare();
    await pool.query("update orders set status='failed' where id=$1", [order.id]);
    await pool.query(
      "insert into generation_jobs(order_id,type,status,payload,idempotency_key,attempts,max_attempts) values($1,'generate_lyrics','failed',$2,$3,6,6)",
      [order.id, JSON.stringify({ targetVersion: 2 }), `lyrics:${order.id}:2`],
    );
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${order.publicId}/lyrics/generate`,
      headers: order.headers,
    });
    expect(response.statusCode).toBe(202);
    const job = (
      await pool.query(
        'select status,attempts,max_attempts from generation_jobs where order_id=$1',
        [order.id],
      )
    ).rows[0];
    expect(job.status).toBe('pending');
    expect(job.max_attempts).toBeGreaterThan(job.attempts);
  });
  it('keeps confirmed revenue when production fails', async () => {
    const order = await prepare();
    await pool.query("update orders set status='failed' where id=$1", [order.id]);
    await pool.query(
      "insert into payments(order_id,provider,environment,status,amount_cents,attempt,idempotency_key,external_reference) values($1,'synthetic','live','approved',4990,1,$2,$3)",
      [order.id, randomUUID(), randomUUID()],
    );
    const response = await app.inject({ url: '/api/v1/admin/overview', headers: await admin() });
    expect(response.statusCode).toBe(200);
    expect(response.json().totals.revenueCents).toBeGreaterThanOrEqual(4990);
    expect(response.json().totals.paid).toBeGreaterThanOrEqual(1);
    expect(response.json().queue).toHaveProperty('unknownCalls');
  });
  it('requires explicit operator review before retrying an unknown charged call', async () => {
    const order = await prepare();
    await pool.query("update orders set status='failed' where id=$1", [order.id]);
    const job = (
      await pool.query(
        "insert into generation_jobs(order_id,type,status,payload,idempotency_key,attempts,max_attempts,last_error) values($1,'generate_lyrics','failed',$2,$3,1,1,'AI_RESULT_UNKNOWN') returning id",
        [order.id, JSON.stringify({ targetVersion: 2 }), `lyrics:${order.id}:2`],
      )
    ).rows[0];
    const call = (
      await pool.query(
        "insert into ai_calls(order_id,job_id,kind,provider,status) values($1,$2,'lyrics','openrouter','unknown') returning id",
        [order.id, job.id],
      )
    ).rows[0];
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/orders/${order.publicId}/lyrics/generate`,
          headers: order.headers,
        })
      ).statusCode,
    ).toBe(409);
    const headers = await admin();
    const url = `/api/v1/admin/orders/${order.id}/ai-calls/${call.id}/resolve`;
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          headers,
          payload: { note: 'Conferência sintética' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          headers,
          payload: {
            acknowledgeDuplicateCost: true,
            note: 'Conferência sintética sem artefato utilizável',
          },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await pool.query('select cost_source,cost_usd from ai_usage where ai_call_id=$1', [call.id]))
        .rows[0],
    ).toEqual({ cost_source: 'unknown', cost_usd: null });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/orders/${order.publicId}/lyrics/generate`,
          headers: order.headers,
        })
      ).statusCode,
    ).toBe(202);
  });
});
