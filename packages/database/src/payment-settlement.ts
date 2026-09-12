import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  assertPaymentMatches,
  assertTransition,
  canTransition,
  nextPaymentStatus,
  parsePaymentDetails,
  type PaymentDetails,
  type PaymentEnvironment,
  type PaymentStatus,
} from '@resenha/domain';

export type PaymentAudioSelection = { provider: 'openrouter' | 'google'; model: string };
export type PaymentLookup = {
  getPayment(id: string): Promise<PaymentDetails>;
  findPayment(reference: string): Promise<PaymentDetails | null>;
};
export type PaymentResolver = (provider: string, environment: PaymentEnvironment) => PaymentLookup;
export type SettlementNotification = {
  provider: string;
  environment: PaymentEnvironment;
  eventId: string;
  externalPaymentId: string;
  kind: 'approved' | 'refunded';
};
type PaymentRow = {
  id: string;
  order_id: string;
  provider: string;
  environment: PaymentEnvironment | null;
  status: PaymentStatus;
  amount_cents: number;
  currency: string;
  external_reference: string;
  external_payment_id: string | null;
};
type OrderRow = {
  id: string;
  status: Parameters<typeof assertTransition>[0];
  price_cents: number;
  current_production_id: string | null;
};

const event = (client: PoolClient, orderId: string, type: string, data: unknown = {}) =>
  client.query('insert into order_events(order_id,type,data) values($1,$2,$3)', [
    orderId,
    type,
    JSON.stringify(data),
  ]);

const startProduction = async (
  client: PoolClient,
  order: OrderRow,
  selection: PaymentAudioSelection,
): Promise<boolean> => {
  // A late second charge is money to reconcile, never permission for another production.
  if (order.status !== 'payment_pending' || order.current_production_id) {
    await event(client, order.id, 'payment_approved_requires_attention');
    return false;
  }
  const lyric = await client.query<{ id: string }>(
    `select id from lyric_versions where order_id=$1 and kind='approved' and approved_at is not null
     order by number desc limit 1`,
    [order.id],
  );
  if (!lyric.rows[0]) {
    // Persist the financial truth even when an old/inconsistent order cannot be produced.
    assertTransition(order.status, 'paid');
    await client.query("update orders set status='paid',updated_at=now() where id=$1", [order.id]);
    await event(client, order.id, 'payment_approved_missing_lyrics');
    return false;
  }
  const productionId = randomUUID();
  await client.query(
    `insert into productions(id,order_id,number,lyric_version_id,status,provenance)
     select $1,$2,coalesce(max(number),0)+1,$3,'queued','recorded' from productions where order_id=$2`,
    [productionId, order.id, lyric.rows[0].id],
  );
  assertTransition(order.status, 'paid');
  assertTransition('paid', 'audio_queued');
  await client.query(
    "update orders set status='audio_queued',current_production_id=$2,updated_at=now() where id=$1",
    [order.id, productionId],
  );
  await client.query(
    `insert into generation_jobs(type,order_id,payload,idempotency_key,max_attempts)
     values('generate_audio',$1,$2,$3,6)`,
    [order.id, JSON.stringify({ productionId, ...selection }), `audio:${productionId}`],
  );
  await event(client, order.id, 'production_queued', { productionId });
  return true;
};

const revokeRefundedOrder = async (client: PoolClient, order: OrderRow) => {
  const changeStatus = canTransition(order.status, 'refunded');
  if (changeStatus) assertTransition(order.status, 'refunded');
  await client.query(
    `update orders set status=case when $2 then 'refunded'::order_status else status end,
     access_revoked_at=coalesce(access_revoked_at,now()),creation_key_hash=null,updated_at=now() where id=$1`,
    [order.id, changeStatus],
  );
  await client.query(
    'update deliveries set revoked_at=coalesce(revoked_at,now()),updated_at=now() where order_id=$1',
    [order.id],
  );
  await client.query(
    `update generation_jobs set status='cancelled',locked_at=null,locked_by=null,
     lease_token=null,lease_expires_at=null,updated_at=now()
     where order_id=$1 and status in ('pending','processing')`,
    [order.id],
  );
  await client.query(
    `update productions set status='failed',updated_at=now()
     where order_id=$1 and status in ('queued','processing','review_required')`,
    [order.id],
  );
  await event(client, order.id, 'payment_refunded');
};

/** All observations, including webhooks, use this transaction. No provider I/O is held in it. */
export const settlePayment = async (
  pool: Pool,
  paymentId: string,
  value: PaymentDetails,
  audioSelection: PaymentAudioSelection,
  notification?: SettlementNotification,
): Promise<{ status: PaymentStatus; productionStarted: boolean; duplicate: boolean }> => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const identity = await client.query<{ order_id: string }>(
      'select order_id from payments where id=$1',
      [paymentId],
    );
    if (!identity.rows[0]) throw new Error('Payment attempt not found.');
    const orderResult = await client.query<OrderRow>(
      'select id,status,price_cents,current_production_id from orders where id=$1 for update',
      [identity.rows[0].order_id],
    );
    const order = orderResult.rows[0];
    const result = await client.query<PaymentRow>('select * from payments where id=$1 for update', [
      paymentId,
    ]);
    const payment = result.rows[0];
    if (!order || !payment) throw new Error('Payment attempt not found.');
    const details = parsePaymentDetails(value);
    assertPaymentMatches(
      {
        provider: payment.provider,
        environment: payment.environment,
        externalPaymentId: payment.external_payment_id,
        externalReference: payment.external_reference,
        amountCents: payment.amount_cents,
        currency: payment.currency,
      },
      details,
    );
    if (details.amountCents !== order.price_cents)
      throw new Error('Payment amount differs from order.');
    let eventId: string | undefined;
    if (notification) {
      if (
        notification.provider !== details.provider ||
        notification.environment !== details.environment ||
        notification.externalPaymentId !== details.id ||
        (notification.kind === 'refunded' && details.status !== 'refunded') ||
        (notification.kind === 'approved' && !['approved', 'refunded'].includes(details.status))
      ) {
        throw new Error('Payment notification is not confirmed by the provider.');
      }
      const inserted = await client.query<{ id: string }>(
        `insert into payment_webhook_events(provider,environment,external_event_id,payment_id,payload)
         values($1,$2,$3,$4,$5) on conflict(provider,environment,external_event_id) do nothing returning id`,
        [
          notification.provider,
          notification.environment,
          notification.eventId,
          paymentId,
          JSON.stringify({
            kind: notification.kind,
            status: details.status,
            environment: details.environment,
          }),
        ],
      );
      eventId = inserted.rows[0]?.id;
      if (!eventId) {
        const previous = await client.query<{ payment_id: string | null }>(
          'select payment_id from payment_webhook_events where provider=$1 and environment=$2 and external_event_id=$3',
          [notification.provider, notification.environment, notification.eventId],
        );
        if (previous.rows[0]?.payment_id !== paymentId)
          throw new Error('Payment event identity conflict.');
        await client.query('commit');
        return { status: payment.status, productionStarted: false, duplicate: true };
      }
    }
    const status = nextPaymentStatus(payment.status, details.status);
    await client.query(
      `update payments set status=$2::payment_status,external_payment_id=$3,checkout_url=coalesce($4,checkout_url),
       expires_at=coalesce($5,expires_at),paid_at=case when $6::boolean then coalesce(paid_at,now()) else paid_at end,
       refunded_at=case when $7::boolean then coalesce(refunded_at,now()) else refunded_at end,
       last_reconciled_at=now(),last_error=null,reconcile_after=now()+case when $2::payment_status='approved' then interval '1 day' else interval '30 seconds' end,
       updated_at=now() where id=$1`,
      [
        paymentId,
        status,
        details.id,
        details.checkoutUrl ?? null,
        details.expiresAt ?? null,
        details.status === 'approved' || details.status === 'refunded',
        details.status === 'refunded',
      ],
    );
    let productionStarted = false;
    if (status === 'approved' && payment.status !== 'approved' && payment.status !== 'refunded') {
      await event(client, order.id, 'payment_approved');
      productionStarted = await startProduction(client, order, audioSelection);
    }
    if (status === 'refunded' && payment.status !== 'refunded')
      await revokeRefundedOrder(client, order);
    if (eventId)
      await client.query('update payment_webhook_events set processed_at=now() where id=$1', [
        eventId,
      ]);
    await client.query('commit');
    return { status, productionStarted, duplicate: false };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};

/** Claims a short read lease. A crash during create is resolved only by exact reference lookup. */
export const reconcilePayment = async (
  pool: Pool,
  paymentId: string,
  resolver: PaymentResolver,
  selection: PaymentAudioSelection,
  options: { force?: boolean } = {},
): Promise<'settled' | 'unknown' | 'skipped' | 'failed'> => {
  const claimed = await pool.query<PaymentRow>(
    `update payments set reconcile_after=now()+interval '60 seconds',
       status=case when status='creating' then 'unknown'::payment_status else status end
     where id=$1 and provider<>'dev' and status in ('creating','unknown','pending','approved')
       and (reconcile_after<=now() or $2) and (status<>'creating' or created_at<now()-interval '45 seconds') returning *`,
    [paymentId, options.force ?? false],
  );
  const payment = claimed.rows[0];
  if (!payment) return 'skipped';
  if (payment.environment === null) {
    await pool.query(
      `update payments set last_error='PAYMENT_ENVIRONMENT_UNKNOWN',
       reconcile_after=now()+interval '1 day',updated_at=now() where id=$1`,
      [paymentId],
    );
    return 'failed';
  }
  try {
    const provider = resolver(payment.provider, payment.environment);
    const details = payment.external_payment_id
      ? await provider.getPayment(payment.external_payment_id)
      : await provider.findPayment(payment.external_reference);
    if (!details) {
      await pool.query(
        "update payments set last_error='PAYMENT_RESULT_UNKNOWN',last_reconciled_at=now(),updated_at=now() where id=$1 and status in ('creating','unknown')",
        [paymentId],
      );
      return 'unknown';
    }
    await settlePayment(pool, paymentId, details, selection);
    return 'settled';
  } catch {
    await pool.query(
      "update payments set last_error='PAYMENT_RECONCILIATION_FAILED',last_reconciled_at=now(),updated_at=now() where id=$1",
      [paymentId],
    );
    return 'failed';
  }
};

export const reconcileOrderPayment = async (
  pool: Pool,
  orderId: string,
  resolver: PaymentResolver,
  selection: PaymentAudioSelection,
) => {
  const result = await pool.query<{ id: string }>(
    "select id from payments where order_id=$1 and status in ('creating','unknown','pending','approved') and provider<>'dev' and reconcile_after<=now() order by attempt desc limit 1",
    [orderId],
  );
  return result.rows[0]
    ? reconcilePayment(pool, result.rows[0].id, resolver, selection)
    : 'skipped';
};

export const reconcileDuePayments = async (
  pool: Pool,
  resolver: PaymentResolver,
  selection: PaymentAudioSelection,
  options: { limit?: number } = {},
): Promise<{ checked: number; failed: number }> => {
  const limit = Math.min(50, Math.max(1, options.limit ?? 5));
  const result = await pool.query<{ id: string }>(
    `select id from payments where status in ('creating','unknown','pending','approved')
     and provider<>'dev' and reconcile_after<=now() order by reconcile_after,id limit $1`,
    [limit],
  );
  let checked = 0;
  let failed = 0;
  for (const row of result.rows) {
    const outcome = await reconcilePayment(pool, row.id, resolver, selection);
    if (outcome !== 'skipped') checked++;
    if (outcome === 'failed') failed++;
  }
  return { checked, failed };
};
