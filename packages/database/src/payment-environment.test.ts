import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { PaymentDetails, PaymentEnvironment } from '@resenha/domain';
import { reconcilePayment, settlePayment } from './payment-settlement.js';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl) throw new Error('DATABASE_URL_TEST must identify an isolated payment database');
const parsedUrl = new URL(databaseUrl);
if (
  !['localhost', '127.0.0.1'].includes(parsedUrl.hostname) ||
  !/(?:_test|_remediation_[a-z_]+)$/.test(parsedUrl.pathname)
)
  throw new Error('Payment environment tests require an isolated local database');
const pool = new Pool({ connectionString: databaseUrl });
afterAll(() => pool.end());

type Attempt = { id: string; orderId: string; externalId: string; reference: string };
const selection = { provider: 'openrouter' as const, model: 'synthetic' };
const environments: PaymentEnvironment[] = ['live', 'sandbox', 'local'];
const details = (attempt: Attempt, environment: PaymentEnvironment): PaymentDetails => ({
  provider: 'synthetic',
  environment,
  id: attempt.externalId,
  externalReference: attempt.reference,
  status: 'approved',
  amountCents: 1990,
  currency: 'BRL',
});

const cleanupAttempt = async (attempt: Attempt) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('delete from payment_webhook_events where payment_id=$1', [attempt.id]);
    await client.query('delete from payments where id=$1', [attempt.id]);
    await client.query('delete from orders where id=$1', [attempt.orderId]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};

// Settlement owns its transaction. These fixtures commit, use unique identities,
// and delete only their own rows. No approved lyric means no job can reach another test's worker.
const withAttempt = async (
  environment: PaymentEnvironment | null,
  test: (attempt: Attempt) => Promise<void>,
) => {
  const attempt = {
    id: randomUUID(),
    orderId: randomUUID(),
    externalId: randomUUID(),
    reference: randomUUID(),
  };
  try {
    await pool.query(
      `insert into orders(id,public_id,product_type,status,price_cents,access_token_hash)
       values($1,$2,'custom_song','payment_pending',1990,'synthetic-hash')`,
      [attempt.orderId, randomUUID().replaceAll('-', '')],
    );
    await pool.query(
      `insert into payments(id,order_id,provider,environment,status,amount_cents,attempt,
       idempotency_key,external_reference,external_payment_id)
       values($1,$2,'synthetic',$3,'pending',1990,1,$4,$5,$6)`,
      [
        attempt.id,
        attempt.orderId,
        environment,
        randomUUID(),
        attempt.reference,
        attempt.externalId,
      ],
    );
    await test(attempt);
  } finally {
    await cleanupAttempt(attempt);
  }
};

const expectUnsettled = async (attempt: Attempt, environment: PaymentEnvironment | null) => {
  const result = await pool.query<{
    payment_status: string;
    environment: PaymentEnvironment | null;
    order_status: string;
    paid_at: Date | null;
    productions: number;
    jobs: number;
    events: number;
  }>(
    `select p.status as payment_status,p.environment,p.paid_at,o.status as order_status,
      (select count(*)::int from productions where order_id=o.id) as productions,
      (select count(*)::int from generation_jobs where order_id=o.id) as jobs,
      (select count(*)::int from order_events where order_id=o.id) as events
      from payments p join orders o on o.id=p.order_id where p.id=$1`,
    [attempt.id],
  );
  expect(result.rows).toEqual([
    {
      payment_status: 'pending',
      environment,
      order_status: 'payment_pending',
      paid_at: null,
      productions: 0,
      jobs: 0,
      events: 0,
    },
  ]);
};

describe('persisted payment environment', () => {
  it.each(environments)(
    'settles and deduplicates a matching %s observation',
    async (environment) => {
      await withAttempt(environment, async (attempt) => {
        const observed = details(attempt, environment);
        const notification = {
          provider: 'synthetic',
          environment,
          eventId: randomUUID(),
          externalPaymentId: attempt.externalId,
          kind: 'approved' as const,
        };
        expect(await settlePayment(pool, attempt.id, observed, selection, notification)).toEqual({
          status: 'approved',
          productionStarted: false,
          duplicate: false,
        });
        expect(await settlePayment(pool, attempt.id, observed, selection, notification)).toEqual({
          status: 'approved',
          productionStarted: false,
          duplicate: true,
        });
        const payment = await pool.query<{ environment: PaymentEnvironment; status: string }>(
          'select environment,status from payments where id=$1',
          [attempt.id],
        );
        expect(payment.rows).toEqual([{ environment, status: 'approved' }]);
        const webhook = await pool.query<{ environment: PaymentEnvironment }>(
          'select environment from payment_webhook_events where payment_id=$1',
          [attempt.id],
        );
        expect(webhook.rows).toEqual([{ environment }]);
      });
    },
  );

  it.each(
    environments.flatMap((persisted) =>
      environments
        .filter((observed) => observed !== persisted)
        .map((observed) => ({ persisted, observed })),
    ),
  )(
    'rejects $observed settlement of a $persisted attempt without effects',
    async ({ persisted, observed }) =>
      withAttempt(persisted, async (attempt) => {
        await expect(
          settlePayment(pool, attempt.id, details(attempt, observed), selection),
        ).rejects.toThrow('Payment does not match its persisted attempt.');
        await expectUnsettled(attempt, persisted);
      }),
  );

  it.each(environments)(
    'does not classify a historical attempt from a %s observation',
    async (environment) => {
      await withAttempt(null, async (attempt) => {
        await expect(
          settlePayment(pool, attempt.id, details(attempt, environment), selection),
        ).rejects.toThrow('Payment does not match its persisted attempt.');
        await expectUnsettled(attempt, null);
      });
    },
  );

  it('rejects a webhook from another environment even when its charge otherwise matches', async () => {
    await withAttempt('sandbox', async (attempt) => {
      await expect(
        settlePayment(pool, attempt.id, details(attempt, 'sandbox'), selection, {
          provider: 'synthetic',
          environment: 'live',
          eventId: randomUUID(),
          externalPaymentId: attempt.externalId,
          kind: 'approved',
        }),
      ).rejects.toThrow('Payment notification is not confirmed by the provider.');
      await expectUnsettled(attempt, 'sandbox');
    });
  });

  it('keeps equal event IDs in separate live and sandbox namespaces', async () => {
    const eventId = randomUUID();
    await withAttempt('sandbox', async (sandbox) =>
      withAttempt('live', async (live) => {
        for (const [attempt, environment] of [
          [sandbox, 'sandbox'],
          [live, 'live'],
        ] as const) {
          expect(
            (
              await settlePayment(pool, attempt.id, details(attempt, environment), selection, {
                provider: 'synthetic',
                environment,
                eventId,
                externalPaymentId: attempt.externalId,
                kind: 'approved',
              })
            ).duplicate,
          ).toBe(false);
        }
        const events = await pool.query<{ environment: PaymentEnvironment }>(
          'select environment from payment_webhook_events where provider=$1 and external_event_id=$2',
          ['synthetic', eventId],
        );
        expect(events.rows.map((row) => row.environment).sort()).toEqual(['live', 'sandbox']);
      }),
    );
  });

  it('blocks historical reconciliation before invoking a provider', async () => {
    await withAttempt(null, async (attempt) => {
      const resolver = vi.fn(() => {
        throw new Error('No provider may be selected for historical uncertainty');
      });
      expect(await reconcilePayment(pool, attempt.id, resolver, selection, { force: true })).toBe(
        'failed',
      );
      expect(resolver).not.toHaveBeenCalled();
      await expectUnsettled(attempt, null);
      const payment = await pool.query<{ last_error: string; last_reconciled_at: Date | null }>(
        'select last_error,last_reconciled_at from payments where id=$1',
        [attempt.id],
      );
      expect(payment.rows).toEqual([
        { last_error: 'PAYMENT_ENVIRONMENT_UNKNOWN', last_reconciled_at: null },
      ]);
    });
  });

  it('resolves by persisted environment and refuses a changed provider environment', async () => {
    await withAttempt('sandbox', async (attempt) => {
      const resolver = vi.fn(() => ({
        getPayment: vi.fn(async () => details(attempt, 'live')),
        findPayment: vi.fn(async () => null),
      }));
      expect(await reconcilePayment(pool, attempt.id, resolver, selection, { force: true })).toBe(
        'failed',
      );
      expect(resolver).toHaveBeenCalledWith('synthetic', 'sandbox');
      await expectUnsettled(attempt, 'sandbox');
    });
  });
});
