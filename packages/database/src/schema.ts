import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
export const productType = pgEnum('product_type', [
  'friend_roast',
  'team_anthem',
  'emotional_tribute',
]);
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
const dates = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};
export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: productType('type').notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  priceCents: integer('price_cents').notNull(),
  active: boolean('active').default(true).notNull(),
  ...dates,
});
export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  publicId: varchar('public_id', { length: 32 }).notNull().unique(),
  productType: productType('product_type').notNull(),
  status: orderStatus('status').default('draft').notNull(),
  priceCents: integer('price_cents').notNull(),
  accessTokenHash: text('access_token_hash').notNull(),
  accessRevokedAt: timestamp('access_revoked_at', { withTimezone: true }),
  ...dates,
});
/** Progressive customer intake. The legacy name was story_submissions. */
export const storySessions = pgTable('story_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  schemaVersion: integer('schema_version').default(1).notNull(),
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
    kind: varchar('kind', { length: 20 }).notNull(),
    content: jsonb('content').notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    ...dates,
  },
  (t) => [uniqueIndex('lyrics_order_number').on(t.orderId, t.number)],
);
export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .references(() => orders.id, { onDelete: 'restrict' })
    .notNull(),
  provider: varchar('provider', { length: 30 }).notNull(),
  status: varchar('status', { length: 30 }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 3 }).default('BRL').notNull(),
  externalPaymentId: varchar('external_payment_id', { length: 160 }).unique(),
  checkoutUrl: text('checkout_url'),
  ...dates,
});
export const generationJobs = pgTable('generation_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: varchar('type', { length: 50 }).notNull(),
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
  lastError: text('last_error'),
  ...dates,
});
export const storedFiles = pgTable('stored_files', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  storageKey: text('storage_key').notNull().unique(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  ...dates,
});
export const audioGenerations = pgTable(
  'audio_generations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    variant: integer('variant').notNull(),
    status: varchar('status', { length: 30 }).notNull(),
    assetId: uuid('asset_id').references(() => storedFiles.id),
    provider: varchar('provider', { length: 30 }).notNull(),
    model: varchar('model', { length: 120 }),
    externalId: varchar('external_id', { length: 160 }),
    attempt: integer('attempt').default(0).notNull(),
    ...dates,
  },
  (t) => [uniqueIndex('audio_order_variant').on(t.orderId, t.variant)],
);
export const orderEvents = pgTable('order_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  type: varchar('type', { length: 80 }).notNull(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
/** Contact data is deliberately separated from session answers for privacy. */
export const leads = pgTable('leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 320 }).notNull(),
  name: varchar('name', { length: 120 }),
  whatsapp: varchar('whatsapp', { length: 32 }),
  marketingAccepted: boolean('marketing_accepted').default(false).notNull(),
  ...dates,
});
export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  sku: varchar('sku', { length: 80 }).notNull(),
  name: varchar('name', { length: 160 }).notNull(),
  quantity: integer('quantity').default(1).notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  ...dates,
});
export const paymentWebhookEvents = pgTable(
  'payment_webhook_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: varchar('provider', { length: 30 }).notNull(),
    externalEventId: varchar('external_event_id', { length: 160 }).notNull(),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    payload: jsonb('payload').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('payment_webhook_provider_event').on(t.provider, t.externalEventId)],
);
export const deliveries = pgTable('deliveries', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  ...dates,
});
// Compatibility exports keep the Phase 1 application operational while the public
// vocabulary and physical database names follow the MVP specification.
export const storySubmissions = storySessions;
export const lyricsVersions = lyricVersions;
export const storedAssets = storedFiles;
export const revisionRequests = pgTable('revision_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  message: text('message').notNull(),
  ...dates,
});
export const emailDeliveries = pgTable('email_deliveries', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  template: varchar('template', { length: 60 }).notNull(),
  recipient: varchar('recipient', { length: 320 }).notNull(),
  provider: varchar('provider', { length: 30 }).notNull(),
  status: varchar('status', { length: 30 }).notNull(),
  externalId: varchar('external_id', { length: 160 }),
  ...dates,
});
export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  event: varchar('event', { length: 80 }).notNull(),
  productType: productType('product_type'),
  orderPublicId: varchar('order_public_id', { length: 32 }),
  utm: jsonb('utm'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const adminUsers = pgTable('admin_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
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
export const adminNotes = pgTable('admin_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  adminUserId: uuid('admin_user_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
