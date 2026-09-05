import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { createDb, products } from '@resenha/database';
import { hashToken } from '@resenha/domain';
import { buildApp } from './app.js';
import type { Env } from './env.js';

let storagePath = '';
const databaseUrl =
  process.env.DATABASE_URL_TEST ?? 'postgresql://resenha:resenha@localhost:5433/resenha_test';
const baseEnv: Env = {
  NODE_ENV: 'test',
  API_PORT: 3001,
  DATABASE_URL: databaseUrl,
  WEB_URL: 'http://localhost:5175',
  COOKIE_SECRET: 'a-local-cookie-secret-with-more-than-32-chars',
  CUSTOMER_ACCESS_TOKEN_PEPPER: 'a-local-token-pepper-with-more-than-32-chars',
  ADMIN_EMAIL: 'admin@example.test',
  ADMIN_PASSWORD: 'a-simple-local-password',
  ADMIN_SESSION_TTL: 28_800,
  LYRICS_PROVIDER: 'openrouter',
  MUSIC_PROVIDER: 'openrouter',
  PAYMENT_PROVIDER: 'mercadopago',
  EMAIL_PROVIDER: 'resend',
  AUDIO_REVIEW_MODE: 'automatic',
  LOCAL_STORAGE_PATH: '',
  OPENROUTER_API_KEY: 'test-key-never-called',
  OPENROUTER_COVER_TEXT_MODEL: 'google/gemini-3.1-flash-lite-image',
  OPENROUTER_COVER_REFERENCE_MODEL: 'google/gemini-3.1-flash-image',
};

const { db, pool } = createDb(databaseUrl);
const apps: FastifyInstance[] = [];

beforeAll(async () => {
  storagePath = await mkdtemp(join(tmpdir(), 'resenha-cover-api-'));
  await db.execute(sql`truncate table orders cascade`);
  await db
    .insert(products)
    .values({ type: 'friend_roast', name: 'Produto', priceCents: 4990 })
    .onConflictDoUpdate({ target: products.type, set: { priceCents: 4990 } });
});

afterAll(async () => {
  for (const app of apps) await app.close();
  await pool.end();
  await rm(storagePath, { recursive: true, force: true });
});

const appForTest = async () => {
  const app = await buildApp({ ...baseEnv, LOCAL_STORAGE_PATH: storagePath });
  apps.push(app);
  return app;
};

const createSession = async (app: FastifyInstance) => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    payload: { productType: 'friend_roast', creationKey: randomUUID() },
  });
  return {
    publicId: (response.json() as { publicId: string }).publicId,
    cookie: String(response.headers['set-cookie']).split(';')[0] ?? '',
  };
};

const markPaid = async (publicId: string) => {
  await pool.query("update orders set status='audio_queued' where public_id=$1", [publicId]);
  await pool.query(
    `insert into payments(order_id,provider,status,amount_cents)
     select id,'local','approved',price_cents from orders where public_id=$1`,
    [publicId],
  );
};

const multipart = (consent: string | undefined, bytes: Buffer, mime = 'image/png') => {
  const boundary = `----resenha-${randomUUID()}`;
  const parts: Buffer[] = [];
  if (consent !== undefined)
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="consent"\r\n\r\n${consent}\r\n`,
      ),
    );
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="reference"; filename="foto.png"\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return {
    payload: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
};

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('album cover public flow', () => {
  it('requires owner access and an approved payment before creating an attempt', async () => {
    const app = await appForTest();
    const session = await createSession(app);
    const beforePayment = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/cover`,
      headers: { cookie: session.cookie },
      payload: {},
    });
    expect(beforePayment.statusCode).toBe(400);
    await markPaid(session.publicId);
    const withoutCookie = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/cover`,
      payload: {},
    });
    expect(withoutCookie.statusCode).toBe(401);
  });

  it('serializes concurrent creation, exposes an exact DTO and caps regeneration at two', async () => {
    const app = await appForTest();
    const session = await createSession(app);
    await markPaid(session.publicId);
    const create = () =>
      app.inject({
        method: 'POST',
        url: `/api/v1/orders/${session.publicId}/cover`,
        headers: { cookie: session.cookie },
        payload: {},
      });
    const concurrent = await Promise.all([create(), create()]);
    expect(concurrent.map(({ statusCode }) => statusCode).sort()).toEqual([202, 409]);
    const created = concurrent.find(({ statusCode }) => statusCode === 202)!;
    expect(Object.keys(created.json())).toEqual([
      'status',
      'attempt',
      'canRegenerate',
      'hasReference',
      'createdAt',
    ]);
    const counts = await pool.query(
      `select
         (select count(*)::int from album_covers c join orders o on o.id=c.order_id where o.public_id=$1) covers,
         (select count(*)::int from generation_jobs j join orders o on o.id=j.order_id where o.public_id=$1 and j.type='generate_cover') jobs`,
      [session.publicId],
    );
    expect(counts.rows[0]).toEqual({ covers: 1, jobs: 1 });

    const pendingRegeneration = await create();
    expect(pendingRegeneration.statusCode).toBe(409);
    await pool.query(
      "update album_covers set status='completed' where order_id=(select id from orders where public_id=$1)",
      [session.publicId],
    );
    const regenerated = await create();
    expect(regenerated.statusCode).toBe(202);
    expect(regenerated.json()).toMatchObject({ attempt: 2, canRegenerate: false });
    const third = await create();
    expect(third.statusCode).toBe(409);

    const summary = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${session.publicId}/cover`,
      headers: { cookie: session.cookie },
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({
      available: true,
      cover: { status: 'pending', attempt: 2, canRegenerate: false, hasReference: false },
    });
    expect(JSON.stringify(summary.json())).not.toMatch(/storage|assetId|orderId|"id"/);
  });

  it('requires consent, validates raster bytes and stores a metadata-free private JPEG', async () => {
    const app = await appForTest();
    const noConsent = await createSession(app);
    await markPaid(noConsent.publicId);
    const withoutConsentBody = multipart(undefined, png);
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${noConsent.publicId}/cover`,
      headers: { cookie: noConsent.cookie, ...withoutConsentBody.headers },
      payload: withoutConsentBody.payload,
    });
    expect(rejected.statusCode).toBe(400);

    const invalid = await createSession(app);
    await markPaid(invalid.publicId);
    const bad = multipart('true', Buffer.from('<svg></svg>'), 'image/png');
    const badResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${invalid.publicId}/cover`,
      headers: { cookie: invalid.cookie, ...bad.headers },
      payload: bad.payload,
    });
    expect(badResponse.statusCode).toBe(400);

    const accepted = await createSession(app);
    await markPaid(accepted.publicId);
    const body = multipart('true', png);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${accepted.publicId}/cover`,
      headers: { cookie: accepted.cookie, ...body.headers },
      payload: body.payload,
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ attempt: 1, hasReference: true });
    const stored = await pool.query(
      `select f.storage_key,f.mime_type from stored_files f
       join album_covers c on c.reference_asset_id=f.id
       join orders o on o.id=c.order_id where o.public_id=$1`,
      [accepted.publicId],
    );
    expect(stored.rows[0]?.mime_type).toBe('image/jpeg');
    const bytes = await readFile(join(storagePath, stored.rows[0]?.storage_key));
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });

  it('downloads only a completed cover through the signed order capability', async () => {
    const app = await appForTest();
    const session = await createSession(app);
    await markPaid(session.publicId);
    await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${session.publicId}/cover`,
      headers: { cookie: session.cookie },
      payload: {},
    });
    const key = `orders/${session.publicId}/cover-1.png`;
    await mkdir(join(storagePath, 'orders', session.publicId), { recursive: true });
    await writeFile(join(storagePath, key), png);
    await pool.query(
      `with asset as (
         insert into stored_files(order_id,storage_key,mime_type,size_bytes)
         select id,$2,'image/png',$3 from orders where public_id=$1 returning id
       )
       update album_covers set status='completed',cover_asset_id=asset.id
       from asset where album_covers.order_id=(select id from orders where public_id=$1)`,
      [session.publicId, key, png.length],
    );
    const unauthorized = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${session.publicId}/cover/download`,
    });
    expect(unauthorized.statusCode).toBe(401);
    const downloaded = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${session.publicId}/cover/download`,
      headers: { cookie: session.cookie },
    });
    expect(downloaded.statusCode).toBe(200);
    expect(downloaded.headers['content-type']).toBe('image/png');
    expect(downloaded.rawPayload).toEqual(png);

    const deliveryToken = `delivery-${randomUUID()}-private`;
    await pool.query("update orders set status='delivered' where public_id=$1", [session.publicId]);
    await pool.query(
      `insert into deliveries(order_id,token_hash,delivered_at)
       select id,$2,now() from orders where public_id=$1`,
      [session.publicId, hashToken(deliveryToken, baseEnv.CUSTOMER_ACCESS_TOKEN_PEPPER)],
    );
    const deliverySummary = await app.inject({
      method: 'GET',
      url: `/api/v1/deliveries/${deliveryToken}/cover`,
    });
    expect(deliverySummary.statusCode).toBe(200);
    expect(deliverySummary.json()).toMatchObject({
      available: true,
      cover: { status: 'completed', attempt: 1, canRegenerate: false },
    });
    expect(JSON.stringify(deliverySummary.json())).not.toMatch(/storage|assetId|orderId|"id"/);
    const deliveryDownload = await app.inject({
      method: 'GET',
      url: `/api/v1/deliveries/${deliveryToken}/cover/download`,
    });
    expect(deliveryDownload.statusCode).toBe(200);
    expect(deliveryDownload.rawPayload).toEqual(png);
  });
});
