import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl) throw new Error('DATABASE_URL_TEST must identify the isolated schema database');
const parsedUrl = new URL(databaseUrl);
if (
  !['localhost', '127.0.0.1'].includes(parsedUrl.hostname) ||
  !/(?:_test|_remediation_[a-z_]+)$/.test(parsedUrl.pathname)
)
  throw new Error('Schema tests require an explicitly isolated local database');
const pool = new Pool({ connectionString: databaseUrl });
afterAll(() => pool.end());

type Fixture = {
  orderId: string;
  otherOrderId: string;
  lyricId: string;
  otherLyricId: string;
  productionId: string;
  otherProductionId: string;
  revisionProductionId: string;
  fileId: string;
  otherFileId: string;
  paymentKey: string;
  externalPaymentId: string;
  aiCallId: string;
};

const paymentInsert = `insert into payments(order_id,provider,status,amount_cents,currency,
  attempt,idempotency_key,external_reference,external_payment_id,environment)
  values($1,$2,$3,$4,$5,$6,$7,$8,$9,'sandbox')`;
const emailInsert = `insert into email_deliveries(order_id,production_id,template,message,
  recipient,provider,status)
  values($1,$2,'delivery_ready','{}','fixture@example.test','local-log','pending')`;

/** Uncommitted fixtures cannot be claimed by jobs.test.ts; every scenario rolls back. */
const withFixture = async (test: (client: PoolClient, fixture: Fixture) => Promise<void>) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const fixture: Fixture = {
      orderId: randomUUID(),
      otherOrderId: randomUUID(),
      lyricId: randomUUID(),
      otherLyricId: randomUUID(),
      productionId: randomUUID(),
      otherProductionId: randomUUID(),
      revisionProductionId: randomUUID(),
      fileId: randomUUID(),
      otherFileId: randomUUID(),
      paymentKey: randomUUID(),
      externalPaymentId: randomUUID(),
      aiCallId: randomUUID(),
    };
    for (const [orderId, lyricId, productionId, fileId] of [
      [fixture.orderId, fixture.lyricId, fixture.productionId, fixture.fileId],
      [fixture.otherOrderId, fixture.otherLyricId, fixture.otherProductionId, fixture.otherFileId],
    ]) {
      await client.query(
        `insert into orders(id,public_id,product_type,price_cents,access_token_hash)
         values($1,$2,'custom_song',1990,'synthetic-hash')`,
        [orderId, randomUUID().replaceAll('-', '')],
      );
      await client.query(
        `insert into lyric_versions(id,order_id,number,kind,content)
         values($1,$2,1,'approved','{}')`,
        [lyricId, orderId],
      );
      await client.query(
        'insert into productions(id,order_id,number,lyric_version_id) values($1,$2,1,$3)',
        [productionId, orderId, lyricId],
      );
      await client.query(
        `insert into stored_files(id,order_id,storage_key,mime_type,size_bytes)
         values($1,$2,$3,'audio/wav',48000)`,
        [fileId, orderId, `schema-test/${randomUUID()}`],
      );
    }
    await client.query(
      'insert into productions(id,order_id,number,lyric_version_id) values($1,$2,2,$3)',
      [fixture.revisionProductionId, fixture.orderId, fixture.lyricId],
    );
    await client.query(
      `insert into audio_generations(order_id,production_id,variant,attempt,status,
       provider,file_id,duration_ms,selected)
       values($1,$2,1,1,'completed','synthetic',$3,12000,true)`,
      [fixture.orderId, fixture.productionId, fixture.fileId],
    );
    await client.query(paymentInsert, [
      fixture.orderId,
      'synthetic',
      'pending',
      1990,
      'BRL',
      1,
      fixture.paymentKey,
      randomUUID(),
      fixture.externalPaymentId,
    ]);
    await client.query(emailInsert, [fixture.orderId, fixture.productionId]);
    await client.query(
      "insert into ai_calls(id,order_id,kind,provider) values($1,$2,'lyrics','synthetic')",
      [fixture.aiCallId, fixture.orderId],
    );
    await client.query(
      "insert into ai_usage(order_id,ai_call_id,kind,status) values($1,$2,'lyrics','error')",
      [fixture.orderId, fixture.aiCallId],
    );
    await test(client, fixture);
  } finally {
    try {
      await client.query('rollback');
    } finally {
      client.release();
    }
  }
};

type Rejection = {
  name: string;
  code: string;
  constraint?: string;
  query: string;
  parameters: (fixture: Fixture) => unknown[];
};
const rejection = (
  name: string,
  code: string,
  constraint: string | undefined,
  query: string,
  parameters: Rejection['parameters'],
): Rejection => ({ name, code, constraint, query, parameters });

const cases: Rejection[] = [
  rejection(
    'invalid payment environment',
    '22P02',
    undefined,
    "update payments set environment='production' where order_id=$1",
    (f) => [f.orderId],
  ),
  rejection(
    'negative order price',
    '23514',
    'orders_price_nonnegative',
    'update orders set price_cents=-1 where id=$1',
    (f) => [f.orderId],
  ),
  rejection(
    'dead product enum',
    '22P02',
    undefined,
    "update orders set product_type='friend_roast' where id=$1",
    (f) => [f.orderId],
  ),
  rejection(
    'recorded production without lyrics',
    '23514',
    'productions_recorded_lyrics',
    'insert into productions(order_id,number) values($1,3)',
    (f) => [f.orderId],
  ),
  rejection(
    'production linked to another order lyric',
    '23503',
    'productions_lyric_order_fk',
    'insert into productions(order_id,number,lyric_version_id) values($1,3,$2)',
    (f) => [f.orderId, f.otherLyricId],
  ),
  rejection(
    'current production owned by another order',
    '23503',
    'orders_current_production_order_fk',
    'update orders set current_production_id=$2 where id=$1',
    (f) => [f.orderId, f.otherProductionId],
  ),
  rejection(
    'negative stored file size',
    '23514',
    'stored_files_size_nonnegative',
    'update stored_files set size_bytes=-1 where id=$1',
    (f) => [f.fileId],
  ),
  rejection(
    'audio linked to another order production',
    '23503',
    'audio_generations_production_order_fk',
    "insert into audio_generations(order_id,production_id,variant,status,provider) values($1,$2,2,'pending','synthetic')",
    (f) => [f.orderId, f.otherProductionId],
  ),
  rejection(
    'audio linked to another order file',
    '23503',
    'audio_generations_file_order_fk',
    "insert into audio_generations(order_id,production_id,variant,status,provider,file_id) values($1,$2,2,'pending','synthetic',$3)",
    (f) => [f.orderId, f.productionId, f.otherFileId],
  ),
  rejection(
    'invalid audio variant',
    '23514',
    'audio_generations_variant_range',
    "insert into audio_generations(order_id,production_id,variant,status,provider) values($1,$2,3,'pending','synthetic')",
    (f) => [f.orderId, f.productionId],
  ),
  rejection(
    'invalid audio duration',
    '23514',
    'audio_generations_duration_positive',
    "insert into audio_generations(order_id,production_id,variant,status,provider,duration_ms) values($1,$2,2,'pending','synthetic',0)",
    (f) => [f.orderId, f.productionId],
  ),
  rejection(
    'selection of incomplete audio',
    '23514',
    'audio_generations_selected_complete',
    "insert into audio_generations(order_id,production_id,variant,status,provider,selected) values($1,$2,2,'pending','synthetic',true)",
    (f) => [f.orderId, f.productionId],
  ),
  rejection(
    'two selected generations for one variant',
    '23505',
    'audio_production_variant_selected',
    "insert into audio_generations(order_id,production_id,variant,attempt,status,provider,file_id,selected) values($1,$2,1,2,'completed','synthetic',$3,true)",
    (f) => [f.orderId, f.productionId, f.fileId],
  ),
  rejection(
    'repeated audio attempt',
    '23505',
    'audio_production_variant_attempt',
    "insert into audio_generations(order_id,production_id,variant,attempt,status,provider) values($1,$2,1,1,'failed','synthetic')",
    (f) => [f.orderId, f.productionId],
  ),
  rejection('negative payment', '23514', 'payments_amount_nonnegative', paymentInsert, (f) => [
    f.otherOrderId,
    'synthetic',
    'rejected',
    -1,
    'BRL',
    1,
    randomUUID(),
    randomUUID(),
    null,
  ]),
  rejection('non-BRL payment', '23514', 'payments_currency_brl', paymentInsert, (f) => [
    f.otherOrderId,
    'synthetic',
    'rejected',
    1990,
    'USD',
    1,
    randomUUID(),
    randomUUID(),
    null,
  ]),
  rejection('invalid payment attempt', '23514', 'payments_attempt_positive', paymentInsert, (f) => [
    f.otherOrderId,
    'synthetic',
    'rejected',
    1990,
    'BRL',
    0,
    randomUUID(),
    randomUUID(),
    null,
  ]),
  rejection('two active payment attempts', '23505', 'payments_active_order', paymentInsert, (f) => [
    f.orderId,
    'synthetic',
    'unknown',
    1990,
    'BRL',
    2,
    randomUUID(),
    randomUUID(),
    null,
  ]),
  rejection(
    'duplicate payment idempotency key',
    '23505',
    'payments_idempotency_key',
    paymentInsert,
    (f) => [
      f.otherOrderId,
      'synthetic',
      'rejected',
      1990,
      'BRL',
      1,
      f.paymentKey,
      randomUUID(),
      null,
    ],
  ),
  rejection(
    'duplicate external payment identity',
    '23505',
    'payments_provider_external',
    paymentInsert,
    (f) => [
      f.otherOrderId,
      'synthetic',
      'rejected',
      1990,
      'BRL',
      1,
      randomUUID(),
      randomUUID(),
      f.externalPaymentId,
    ],
  ),
  rejection(
    'delivery linked to another order production',
    '23503',
    'deliveries_production_order_fk',
    'insert into deliveries(order_id,production_id,token_hash) values($1,$2,$3)',
    (f) => [f.orderId, f.otherProductionId, randomUUID()],
  ),
  rejection(
    'duplicate email intention for a production',
    '23505',
    'email_delivery_intent_once',
    emailInsert,
    (f) => [f.orderId, f.productionId],
  ),
  rejection(
    'email linked to another order production',
    '23503',
    'email_deliveries_production_order_fk',
    emailInsert,
    (f) => [f.otherOrderId, f.productionId],
  ),
  rejection(
    'blank consent policy',
    '23514',
    'order_consents_policy_nonblank',
    "insert into order_consents(order_id,kind,policy_version,accepted) values($1,'terms',' ',true)",
    (f) => [f.orderId],
  ),
  rejection(
    'negative job attempts',
    '23514',
    'generation_jobs_attempts_nonnegative',
    "insert into generation_jobs(order_id,type,payload,idempotency_key,attempts) values($1,'generate_lyrics','{}',$2,-1)",
    (f) => [f.orderId, randomUUID()],
  ),
  rejection(
    'zero job attempt budget',
    '23514',
    'generation_jobs_max_attempts_positive',
    "insert into generation_jobs(order_id,type,payload,idempotency_key,max_attempts) values($1,'generate_lyrics','{}',$2,0)",
    (f) => [f.orderId, randomUUID()],
  ),
  rejection(
    'unknown cost with an amount',
    '23514',
    'ai_usage_cost_consistent',
    "insert into ai_usage(order_id,kind,status,cost_source,cost_usd) values($1,'lyrics','error','unknown',1)",
    (f) => [f.orderId],
  ),
  rejection(
    'reported cost without amount',
    '23514',
    'ai_usage_cost_consistent',
    "insert into ai_usage(order_id,kind,status,cost_source) values($1,'lyrics','error','reported')",
    (f) => [f.orderId],
  ),
  rejection(
    'negative estimated cost',
    '23514',
    'ai_usage_cost_consistent',
    "insert into ai_usage(order_id,kind,status,cost_source,cost_usd) values($1,'lyrics','error','estimated',-1)",
    (f) => [f.orderId],
  ),
  rejection(
    'negative token counter',
    '23514',
    'ai_usage_tokens_nonnegative',
    "insert into ai_usage(order_id,kind,status,input_tokens) values($1,'lyrics','error',-1)",
    (f) => [f.orderId],
  ),
  rejection(
    'duplicate usage for an AI call',
    '23505',
    'ai_usage_call_once',
    "insert into ai_usage(order_id,ai_call_id,kind,status) values($1,$2,'lyrics','error')",
    (f) => [f.orderId, f.aiCallId],
  ),
];

describe('persisted schema invariants', () => {
  it('retains event uniqueness when the historical environment is unknown', async () => {
    await withFixture(async (client) => {
      const eventId = randomUUID();
      const insert = `insert into payment_webhook_events(provider,external_event_id,payload)
        values('synthetic',$1,'{}')`;
      await client.query(insert, [eventId]);
      await expect(client.query(insert, [eventId])).rejects.toMatchObject({
        code: '23505',
        constraint: 'payment_webhook_provider_event_legacy',
      });
    });
  });

  it('isolates external payment identities by environment', async () => {
    await withFixture(async (client, fixture) => {
      await client.query(
        `insert into payments(order_id,provider,status,amount_cents,currency,attempt,
         idempotency_key,external_reference,external_payment_id,environment)
         values($1,'synthetic','pending',1990,'BRL',1,$2,$3,$4,'live')`,
        [fixture.otherOrderId, randomUUID(), randomUUID(), fixture.externalPaymentId],
      );
      const rows = await client.query<{ environment: string }>(
        'select environment from payments where provider=$1 and external_payment_id=$2 order by environment',
        ['synthetic', fixture.externalPaymentId],
      );
      expect(rows.rows.map((row) => row.environment).sort()).toEqual(['live', 'sandbox']);
    });
  });

  it('retains uniqueness for historical payments without an environment', async () => {
    await withFixture(async (client, fixture) => {
      await client.query('update payments set environment=null where order_id=$1', [
        fixture.orderId,
      ]);
      await expect(
        client.query(
          `insert into payments(order_id,provider,status,amount_cents,currency,attempt,
         idempotency_key,external_reference,external_payment_id)
         values($1,'synthetic','pending',1990,'BRL',1,$2,$3,$4)`,
          [fixture.otherOrderId, randomUUID(), randomUUID(), fixture.externalPaymentId],
        ),
      ).rejects.toMatchObject({ code: '23505', constraint: 'payments_provider_external_legacy' });
    });
  });
  it.each(cases)('rejects $name', async ({ code, constraint, query, parameters }) => {
    await withFixture(async (client, fixture) => {
      await expect(client.query(query, parameters(fixture))).rejects.toMatchObject({
        code,
        ...(constraint ? { constraint } : {}),
      });
    });
  });

  it('permits a revised production to have its own email intention', async () => {
    await withFixture(async (client, fixture) => {
      await client.query(emailInsert, [fixture.orderId, fixture.revisionProductionId]);
      const result = await client.query<{ production_id: string }>(
        'select production_id from email_deliveries where order_id=$1',
        [fixture.orderId],
      );
      expect(result.rows.map((row) => row.production_id).sort()).toEqual(
        [fixture.productionId, fixture.revisionProductionId].sort(),
      );
    });
  });

  it('preserves an unselected audio attempt beside the selected result', async () => {
    await withFixture(async (client, fixture) => {
      await client.query(
        `insert into audio_generations(order_id,production_id,variant,attempt,status,provider)
         values($1,$2,1,2,'failed','synthetic')`,
        [fixture.orderId, fixture.productionId],
      );
      const result = await client.query<{ attempt: number; selected: boolean }>(
        'select attempt,selected from audio_generations where production_id=$1 order by attempt',
        [fixture.productionId],
      );
      expect(result.rows).toEqual([
        { attempt: 1, selected: true },
        { attempt: 2, selected: false },
      ]);
    });
  });
});
