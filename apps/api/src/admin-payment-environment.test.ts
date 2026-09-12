import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createDb } from '@resenha/database';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { parseEnv } from './env.js';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl) throw new Error('DATABASE_URL_TEST must identify an isolated local database');
const parsedUrl = new URL(databaseUrl);
if (
  !['localhost', '127.0.0.1'].includes(parsedUrl.hostname) ||
  !/(?:_test|_remediation_[a-z_]+)$/.test(parsedUrl.pathname)
)
  throw new Error('Financial reporting tests require an isolated local database');
const { pool } = createDb(databaseUrl);
type FinancialRow = {
  environment: string;
  attempts: number;
  paid: number;
  approvedCents: number;
  refundedCents: number;
};
type Overview = {
  totals: { orders: number; paid: number; revenueCents: number; refundedCents: number };
  financialEnvironments: FinancialRow[];
};
type Funnel = {
  perSaleUsd: string;
  salesWithCost: number;
  steps: { event: string; orders: number }[];
};
const apps: FastifyInstance[] = [];
const cookies: string[] = [];
const orderIds: string[] = [];
let storageRoot: string;
let baseline: Overview;
let baselineFunnel: Funnel;
let baselineCost: number;
let unknownOrderId: string;

const overview = async (index = 0) =>
  (
    await apps[index]!.inject({
      url: '/api/v1/admin/overview',
      headers: { cookie: cookies[index]! },
    })
  ).json<Overview>();
const funnel = async () =>
  (
    await apps[0]!.inject({
      url: '/api/v1/admin/analytics/funnel',
      headers: { cookie: cookies[0]! },
    })
  ).json<Funnel>();
const cost = async () =>
  Number(
    (
      await apps[0]!.inject({
        url: '/api/v1/admin/ai-usage/summary',
        headers: { cookie: cookies[0]! },
      })
    ).json().month.totalUsd,
  );

describe('financial reporting preserves payment environments', () => {
  beforeAll(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('No external calls permitted');
      }),
    );
    storageRoot = await mkdtemp(join(tmpdir(), 'admin-payment-environment-'));
    for (const environment of ['live', 'sandbox'] as const) {
      const env = parseEnv({
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
        PAYMENT_ENVIRONMENT: environment,
        LOCAL_STORAGE_PATH: storageRoot,
        COOKIE_SECRET: 'synthetic-cookie-secret-more-than-32-characters',
        CUSTOMER_ACCESS_TOKEN_PEPPER: 'synthetic-pepper-more-than-32-characters',
        ADMIN_EMAIL: 'finance-environment@example.test',
        ADMIN_PASSWORD: 'synthetic-password',
      });
      const app = await buildApp(env);
      apps.push(app);
      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/session',
        payload: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
      });
      expect(login.statusCode).toBe(200);
      cookies.push(String(login.headers['set-cookie']).split(';')[0]!);
    }
    baseline = await overview();
    baselineFunnel = await funnel();
    baselineCost = await cost();
    for (const [index, environment] of ['live', 'sandbox', 'local', null].entries()) {
      const amount = (index + 1) * 1000;
      for (const status of ['approved', 'refunded', 'pending']) {
        const id = randomUUID();
        orderIds.push(id);
        await pool.query(
          `insert into orders(id,public_id,product_type,status,price_cents,access_token_hash)
          values($1,$2,'custom_song',$3,$4,'synthetic')`,
          [
            id,
            randomUUID().replaceAll('-', ''),
            status === 'approved' ? 'delivered' : 'payment_pending',
            amount,
          ],
        );
        await pool.query(
          `insert into payments(order_id,provider,environment,status,amount_cents,attempt,idempotency_key,external_reference)
          values($1,'synthetic',$2,$3,$4,1,$5,$6)`,
          [id, environment, status, amount, randomUUID(), randomUUID()],
        );
        if (status === 'approved') {
          await pool.query(
            `insert into ai_usage(order_id,kind,status,cost_usd,cost_source) values($1,'audio','ok',$2,'reported')`,
            [id, index + 1],
          );
          await pool.query(
            `insert into analytics_events(event,order_public_id) select 'paid',public_id from orders where id=$1`,
            [id],
          );
          if (environment === null) unknownOrderId = id;
          if (environment === 'live')
            await pool.query(
              `insert into payments(order_id,provider,environment,status,amount_cents,attempt,idempotency_key,external_reference)
              values($1,'synthetic','live','approved',500,2,$2,$3)`,
              [id, randomUUID(), randomUUID()],
            );
        }
      }
    }
    // A real AI expense can precede any payment; it remains in the operational cost total.
    const unpaidId = randomUUID();
    orderIds.push(unpaidId);
    await pool.query(
      `insert into orders(id,public_id,product_type,price_cents,access_token_hash) values($1,$2,'custom_song',1000,'synthetic')`,
      [unpaidId, randomUUID().replaceAll('-', '')],
    );
    await pool.query(
      `insert into ai_usage(order_id,kind,status,cost_usd,cost_source) values($1,'lyrics','ok',11,'reported')`,
      [unpaidId],
    );
  });
  afterAll(async () => {
    for (const app of apps) await app.close();
    await pool.query(
      'delete from analytics_events where order_public_id in (select public_id from orders where id=any($1::uuid[]))',
      [orderIds],
    );
    await pool.query('delete from payments where order_id=any($1::uuid[])', [orderIds]);
    await pool.query('delete from orders where id=any($1::uuid[])', [orderIds]);
    await pool.end();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('keeps financial and cost reports administrative', async () => {
    for (const path of ['overview', 'ai-usage/summary', 'analytics/funnel'])
      expect((await apps[0]!.inject(`/api/v1/admin/${path}`)).statusCode).toBe(401);
  });

  it('counts only live money and exposes excluded balances without reclassifying history on configuration changes', async () => {
    const result = await overview();
    expect(result.totals).toEqual({
      orders: baseline.totals.orders + 13,
      paid: baseline.totals.paid + 1,
      revenueCents: baseline.totals.revenueCents + 1500,
      refundedCents: baseline.totals.refundedCents + 1000,
    });
    for (const [index, environment] of ['live', 'sandbox', 'local', 'unclassified'].entries()) {
      const old = baseline.financialEnvironments.find((row) => row.environment === environment)!;
      expect(result.financialEnvironments.find((row) => row.environment === environment)).toEqual({
        environment,
        attempts: old.attempts + (index === 0 ? 4 : 3),
        paid: old.paid + 1,
        approvedCents: old.approvedCents + (index + 1) * 1000 + (index === 0 ? 500 : 0),
        refundedCents: old.refundedCents + (index + 1) * 1000,
      });
    }
    const sandboxConfigured = await overview(1);
    expect(sandboxConfigured.totals).toEqual(result.totals);
    expect(sandboxConfigured.financialEnvironments).toEqual(result.financialEnvironments);
    const detail = await apps[1]!.inject({
      url: `/api/v1/admin/orders/${unknownOrderId}`,
      headers: { cookie: cookies[1]! },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().payments[0].environment).toBeNull();
  });

  it('keeps all AI expenses, restricts cost per sale to live delivery, and retains operational funnel counts', async () => {
    expect(await cost()).toBeCloseTo(baselineCost + 21, 6);
    const result = await funnel();
    expect(result.salesWithCost).toBe(baselineFunnel.salesWithCost + 1);
    expect(Number(result.perSaleUsd)).toBeCloseTo(
      (Number(baselineFunnel.perSaleUsd) * baselineFunnel.salesWithCost + 1) /
        (baselineFunnel.salesWithCost + 1),
      6,
    );
    const previousPaid = baselineFunnel.steps.find((step) => step.event === 'paid')!.orders;
    expect(result.steps.find((step) => step.event === 'paid')!.orders).toBe(previousPaid + 4);
    expect(fetch).not.toHaveBeenCalled();
  });
});
