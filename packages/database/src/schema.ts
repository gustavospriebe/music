import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  unique,
  uuid,
  varchar,
  type AnyPgColumn,
  type PgTableExtraConfigValue,
} from 'drizzle-orm/pg-core';
export const productType = pgEnum('product_type', ['custom_song']);
export const orderStatus = pgEnum('order_status', [
  'draft',
  'story_completed',
  'lyrics_generating',
  'lyrics_ready',
  'lyrics_approved',
  'payment_pending',
  'paid',
  'audio_queued',
  'audio_generating',
  'review_required',
  'delivered',
  'revision_requested',
  'failed',
  'refunded',
  'cancelled',
]);
export const jobStatus = pgEnum('job_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);
export const jobType = pgEnum('job_type', [
  'generate_lyrics',
  'generate_audio',
  'generate_cover',
  'deliver_notify',
]);
export const lyricKind = pgEnum('lyric_kind', ['generated', 'edited', 'approved']);
export const paymentEnvironment = pgEnum('payment_environment', ['live', 'sandbox', 'local']);
export const paymentStatus = pgEnum('payment_status', [
  'creating',
  'unknown',
  'pending',
  'approved',
  'refunded',
  'rejected',
  'cancelled',
  'expired',
]);
export const productionStatus = pgEnum('production_status', [
  'queued',
  'processing',
  'review_required',
  'completed',
  'failed',
]);
export const productionProvenance = pgEnum('production_provenance', [
  'recorded',
  'legacy_unverified',
]);
export const audioStatus = pgEnum('audio_status', ['pending', 'processing', 'completed', 'failed']);
export const albumCoverStatus = pgEnum('album_cover_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);
export const emailDeliveryStatus = pgEnum('email_delivery_status', ['pending', 'sent', 'failed']);
export const aiUsageKind = pgEnum('ai_usage_kind', ['lyrics', 'audio', 'album_cover']);
export const aiUsageStatus = pgEnum('ai_usage_status', ['ok', 'blocked', 'error', 'rejected']);
export const aiCallStatus = pgEnum('ai_call_status', [
  'started',
  'completed',
  'rejected',
  'failed',
  'unknown',
]);
export const aiCostSource = pgEnum('ai_cost_source', ['reported', 'estimated', 'unknown']);
export const consentKind = pgEnum('consent_kind', [
  'terms',
  'privacy',
  'marketing',
  'reference_image',
  'content_rights',
]);
const dates = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};
export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: productType('type').notNull().unique(),
    name: varchar('name', { length: 120 }).notNull(),
    priceCents: integer('price_cents').notNull(),
    active: boolean('active').default(true).notNull(),
    ...dates,
  },
  (t) => [check('products_price_nonnegative', sql`${t.priceCents} >= 0`)],
);
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    publicId: varchar('public_id', { length: 32 }).notNull().unique(),
    productType: productType('product_type').notNull(),
    status: orderStatus('status').default('draft').notNull(),
    priceCents: integer('price_cents').notNull(),
    currentProductionId: uuid('current_production_id').references(
      (): AnyPgColumn => productions.id,
    ),
    accessTokenHash: text('access_token_hash').notNull(),
    creationKeyHash: text('creation_key_hash'),
    accessRevokedAt: timestamp('access_revoked_at', { withTimezone: true }),
    ...dates,
  },
  (t): PgTableExtraConfigValue[] => [
    check('orders_price_nonnegative', sql`${t.priceCents} >= 0`),
    uniqueIndex('orders_creation_key_hash_unique').on(t.creationKeyHash),
    foreignKey({
      name: 'orders_current_production_order_fk',
      columns: [t.currentProductionId, t.id],
      foreignColumns: [productions.id, productions.orderId],
    }),
  ],
);
export const storySessions = pgTable('story_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  schemaVersion: integer('schema_version').default(2).notNull(),
  data: jsonb('data').notNull(),
  ...dates,
});
export const lyricVersions = pgTable(
  'lyric_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    number: integer('number').notNull(),
    kind: lyricKind('kind').notNull(),
    content: jsonb('content').notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    ...dates,
  },
  (t) => [
    uniqueIndex('lyric_order_number').on(t.orderId, t.number),
    unique('lyric_versions_id_order').on(t.id, t.orderId),
    check('lyric_versions_number_positive', sql`${t.number} > 0`),
  ],
);
export const productions = pgTable(
  'productions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references((): AnyPgColumn => orders.id, { onDelete: 'cascade' })
      .notNull(),
    number: integer('number').notNull(),
    lyricVersionId: uuid('lyric_version_id'),
    status: productionStatus('status').default('queued').notNull(),
    provenance: productionProvenance('provenance').default('recorded').notNull(),
    ...dates,
  },
  (t) => [
    uniqueIndex('productions_order_number').on(t.orderId, t.number),
    unique('productions_id_order').on(t.id, t.orderId),
    check('productions_number_positive', sql`${t.number} > 0`),
    check(
      'productions_recorded_lyrics',
      sql`${t.provenance} <> 'recorded' or ${t.lyricVersionId} is not null`,
    ),
    foreignKey({
      name: 'productions_lyric_order_fk',
      columns: [t.lyricVersionId, t.orderId],
      foreignColumns: [lyricVersions.id, lyricVersions.orderId],
    }),
  ],
);
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'restrict' })
      .notNull(),
    provider: varchar('provider', { length: 30 }).notNull(),
    /** NULL preserves historical uncertainty; new attempts must choose their environment. */
    environment: paymentEnvironment('environment'),
    status: paymentStatus('status').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: varchar('currency', { length: 3 }).default('BRL').notNull(),
    attempt: integer('attempt').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 180 }).notNull(),
    externalReference: varchar('external_reference', { length: 160 }).notNull(),
    externalPaymentId: varchar('external_payment_id', { length: 160 }),
    checkoutUrl: text('checkout_url'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastReconciledAt: timestamp('last_reconciled_at', { withTimezone: true }),
    reconcileAfter: timestamp('reconcile_after', { withTimezone: true }).defaultNow().notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    lastError: text('last_error'),
    ...dates,
  },
  (t) => [
    index('payments_order_id').on(t.orderId),
    index('payments_reconcile_after').on(t.status, t.reconcileAfter),
    uniqueIndex('payments_idempotency_key').on(t.idempotencyKey),
    uniqueIndex('payments_provider_external').on(t.provider, t.environment, t.externalPaymentId),
    uniqueIndex('payments_provider_external_legacy')
      .on(t.provider, t.externalPaymentId)
      .where(sql`${t.environment} is null`),
    uniqueIndex('payments_order_attempt').on(t.orderId, t.attempt),
    uniqueIndex('payments_active_order')
      .on(t.orderId)
      .where(sql`${t.status} in ('creating','unknown','pending')`),
    check('payments_amount_nonnegative', sql`${t.amountCents} >= 0`),
    check('payments_attempt_positive', sql`${t.attempt} > 0`),
    check('payments_currency_brl', sql`${t.currency} = 'BRL'`),
  ],
);
export const generationJobs = pgTable(
  'generation_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: jobType('type').notNull(),
    status: jobStatus('status').default('pending').notNull(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    payload: jsonb('payload').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 180 }).notNull().unique(),
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    runAt: timestamp('run_at', { withTimezone: true }).defaultNow().notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: varchar('locked_by', { length: 100 }),
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    lastError: text('last_error'),
    ...dates,
  },
  (t) => [
    index('generation_jobs_status_run_at').on(t.status, t.runAt),
    index('generation_jobs_order_id').on(t.orderId),
    check('generation_jobs_attempts_nonnegative', sql`${t.attempts} >= 0`),
    check('generation_jobs_max_attempts_positive', sql`${t.maxAttempts} > 0`),
  ],
);
export const storedFiles = pgTable(
  'stored_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    storageKey: text('storage_key').notNull().unique(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    ...dates,
  },
  (t) => [
    index('stored_files_order_id').on(t.orderId),
    unique('stored_files_id_order').on(t.id, t.orderId),
    check('stored_files_size_nonnegative', sql`${t.sizeBytes} >= 0`),
  ],
);
export const audioGenerations = pgTable(
  'audio_generations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    variant: integer('variant').notNull(),
    productionId: uuid('production_id').notNull(),
    jobId: uuid('job_id').references(() => generationJobs.id, { onDelete: 'set null' }),
    leaseToken: uuid('lease_token'),
    selected: boolean('selected').default(false).notNull(),
    durationMs: integer('duration_ms'),
    status: audioStatus('status').notNull(),
    fileId: uuid('file_id'),
    provider: varchar('provider', { length: 30 }).notNull(),
    model: varchar('model', { length: 120 }),
    externalId: varchar('external_id', { length: 160 }),
    attempt: integer('attempt').default(0).notNull(),
    ...dates,
  },
  (t) => [
    uniqueIndex('audio_production_variant_attempt').on(t.productionId, t.variant, t.attempt),
    uniqueIndex('audio_production_variant_selected')
      .on(t.productionId, t.variant)
      .where(sql`${t.selected}`),
    index('audio_generations_order_id').on(t.orderId),
    check('audio_generations_variant_range', sql`${t.variant} in (1, 2)`),
    check('audio_generations_attempt_nonnegative', sql`${t.attempt} >= 0`),
    check(
      'audio_generations_duration_positive',
      sql`${t.durationMs} is null or ${t.durationMs} > 0`,
    ),
    check(
      'audio_generations_selected_complete',
      sql`not ${t.selected} or (${t.status} = 'completed' and ${t.fileId} is not null)`,
    ),
    foreignKey({
      name: 'audio_generations_production_order_fk',
      columns: [t.productionId, t.orderId],
      foreignColumns: [productions.id, productions.orderId],
    }),
    foreignKey({
      name: 'audio_generations_file_order_fk',
      columns: [t.fileId, t.orderId],
      foreignColumns: [storedFiles.id, storedFiles.orderId],
    }),
  ],
);
export const albumCovers = pgTable(
  'album_covers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    attempt: integer('attempt').notNull(),
    status: albumCoverStatus('status').default('pending').notNull(),
    referenceFileId: uuid('reference_file_id').references(() => storedFiles.id, {
      onDelete: 'set null',
    }),
    hadReference: boolean('had_reference').default(false).notNull(),
    coverFileId: uuid('cover_file_id').references(() => storedFiles.id, {
      onDelete: 'set null',
    }),
    provider: varchar('provider', { length: 30 }).notNull().default('openrouter'),
    model: varchar('model', { length: 120 }).notNull(),
    lastError: text('last_error'),
    ...dates,
  },
  (t) => [
    uniqueIndex('album_covers_order_attempt').on(t.orderId, t.attempt),
    unique('album_covers_id_order').on(t.id, t.orderId),
    index('album_covers_status_updated').on(t.status, t.updatedAt),
    check('album_covers_attempt_range', sql`${t.attempt} between 1 and 2`),
    foreignKey({
      name: 'album_covers_reference_order_fk',
      columns: [t.referenceFileId, t.orderId],
      foreignColumns: [storedFiles.id, storedFiles.orderId],
    }),
    foreignKey({
      name: 'album_covers_file_order_fk',
      columns: [t.coverFileId, t.orderId],
      foreignColumns: [storedFiles.id, storedFiles.orderId],
    }),
  ],
);
export const aiCalls = pgTable(
  'ai_calls',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    jobId: uuid('job_id').references(() => generationJobs.id, { onDelete: 'set null' }),
    kind: aiUsageKind('kind').notNull(),
    provider: varchar('provider', { length: 30 }).notNull(),
    model: varchar('model', { length: 120 }),
    status: aiCallStatus('status').default('started').notNull(),
    leaseToken: uuid('lease_token'),
    externalId: varchar('external_id', { length: 160 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('ai_calls_job_id').on(t.jobId),
    index('ai_calls_order_id').on(t.orderId),
    index('ai_calls_status_created').on(t.status, t.createdAt),
  ],
);
/** Append-only AI cost ledger: one row per provider call (lyrics + each audio variant). */
export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    jobId: uuid('job_id').references(() => generationJobs.id, { onDelete: 'set null' }),
    aiCallId: uuid('ai_call_id').references(() => aiCalls.id, { onDelete: 'restrict' }),
    kind: aiUsageKind('kind').notNull(),
    provider: varchar('provider', { length: 30 }).notNull().default('openrouter'),
    model: varchar('model', { length: 120 }),
    externalId: varchar('external_id', { length: 160 }),
    inputTokens: integer('input_tokens').default(0).notNull(),
    outputTokens: integer('output_tokens').default(0).notNull(),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }),
    costSource: aiCostSource('cost_source').default('unknown').notNull(),
    latencyMs: integer('latency_ms'),
    status: aiUsageStatus('status').notNull(),
    error: text('error'),
    attempt: integer('attempt').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('ai_usage_order_id').on(t.orderId),
    index('ai_usage_created_at').on(t.createdAt),
    uniqueIndex('ai_usage_call_once').on(t.aiCallId),
    check('ai_usage_tokens_nonnegative', sql`${t.inputTokens} >= 0 and ${t.outputTokens} >= 0`),
    check(
      'ai_usage_cost_consistent',
      sql`(${t.costSource} = 'unknown' and ${t.costUsd} is null) or (${t.costSource} <> 'unknown' and ${t.costUsd} is not null and ${t.costUsd} >= 0)`,
    ),
    uniqueIndex('ai_usage_order_kind_external')
      .on(t.orderId, t.kind, t.externalId)
      .where(sql`${t.externalId} is not null`),
  ],
);
export const orderEvents = pgTable(
  'order_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    type: varchar('type', { length: 80 }).notNull(),
    data: jsonb('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('order_events_order_id').on(t.orderId)],
);
export const orderContacts = pgTable('order_contacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  email: varchar('email', { length: 320 }).notNull(),
  name: varchar('name', { length: 120 }),
  marketingAccepted: boolean('marketing_accepted').default(false).notNull(),
  ...dates,
});
export const orderConsents = pgTable(
  'order_consents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    kind: consentKind('kind').notNull(),
    policyVersion: varchar('policy_version', { length: 120 }).notNull(),
    accepted: boolean('accepted').notNull(),
    coverId: uuid('cover_id').references(() => albumCovers.id, { onDelete: 'set null' }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('order_consents_order_kind_recorded').on(t.orderId, t.kind, t.recordedAt),
    check('order_consents_policy_nonblank', sql`length(trim(${t.policyVersion})) > 0`),
    foreignKey({
      name: 'order_consents_cover_order_fk',
      columns: [t.coverId, t.orderId],
      foreignColumns: [albumCovers.id, albumCovers.orderId],
    }),
  ],
);
export const paymentWebhookEvents = pgTable(
  'payment_webhook_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: varchar('provider', { length: 30 }).notNull(),
    environment: paymentEnvironment('environment'),
    externalEventId: varchar('external_event_id', { length: 160 }).notNull(),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    payload: jsonb('payload').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('payment_webhook_provider_event').on(t.provider, t.environment, t.externalEventId),
    uniqueIndex('payment_webhook_provider_event_legacy')
      .on(t.provider, t.externalEventId)
      .where(sql`${t.environment} is null`),
  ],
);
export const deliveries = pgTable(
  'deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    productionId: uuid('production_id'),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    ...dates,
  },
  (t) => [
    uniqueIndex('deliveries_order_id').on(t.orderId),
    uniqueIndex('deliveries_token_hash').on(t.tokenHash),
    foreignKey({
      name: 'deliveries_production_order_fk',
      columns: [t.productionId, t.orderId],
      foreignColumns: [productions.id, productions.orderId],
    }),
  ],
);
export const revisionRequests = pgTable(
  'revision_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    message: text('message').notNull(),
    ...dates,
  },
  (t) => [index('revision_requests_order_id').on(t.orderId)],
);
export type EmailDeliveryMessage = {
  deliveryId: string;
  webUrl: string;
  from: string;
  subject: string;
  textTemplate: string;
  htmlTemplate: string;
};
export const emailDeliveries = pgTable(
  'email_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    productionId: uuid('production_id'),
    template: varchar('template', { length: 60 }).notNull(),
    message: jsonb('message').$type<EmailDeliveryMessage>(),
    recipient: varchar('recipient', { length: 320 }).notNull(),
    provider: varchar('provider', { length: 30 }).notNull(),
    status: emailDeliveryStatus('status').notNull(),
    externalId: varchar('external_id', { length: 160 }),
    ...dates,
  },
  (t) => [
    uniqueIndex('email_delivery_intent_once')
      .on(t.orderId, t.productionId, t.template)
      .where(sql`${t.message} is not null`),
    foreignKey({
      name: 'email_deliveries_production_order_fk',
      columns: [t.productionId, t.orderId],
      foreignColumns: [productions.id, productions.orderId],
    }),
  ],
);
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    event: varchar('event', { length: 80 }).notNull(),
    productType: productType('product_type'),
    orderPublicId: varchar('order_public_id', { length: 32 }),
    /** Random per-browser id (localStorage, no PII); enables pre-order beacons later. */
    visitorId: varchar('visitor_id', { length: 64 }),
    utm: jsonb('utm'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('analytics_event_created').on(t.event, t.createdAt),
    index('analytics_visitor_created').on(t.visitorId, t.createdAt),
    index('analytics_order_public').on(t.orderPublicId),
  ],
);
export const adminUsers = pgTable('admin_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  ...dates,
});
export const adminSessions = pgTable('admin_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => adminUsers.id, { onDelete: 'cascade' })
    .notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const adminNotes = pgTable(
  'admin_notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    adminUserId: uuid('admin_user_id').references(() => adminUsers.id, { onDelete: 'set null' }),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('admin_notes_order_id').on(t.orderId)],
);
