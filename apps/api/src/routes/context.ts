import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, getTableColumns, gt, sql } from 'drizzle-orm';
import {
  adminNotes,
  aiCalls,
  orderConsents,
  albumCovers,
  adminSessions,
  audioGenerations,
  analyticsEvents,
  createDb,
  deliveries,
  emailDeliveries,
  generationJobs,
  lyricVersions,
  orderContacts,
  orders,
  payments,
  productions,
  storedFiles,
  storySessions,
} from '@resenha/database';
import {
  createAccessToken,
  hashToken,
  mergeStoryContact,
  sanitizeAiError,
  stableDeliveryToken,
} from '@resenha/domain';
import type { LyricsProvider, StorageProvider } from '@resenha/providers';
import type { Env } from '../env.js';
import { requestLyricsGeneration } from '../orders/generate-lyrics.js';
import { replaceAudioProduction } from '../orders/production.js';
import { PublicHttpError } from '../http.js';
import { publicConfiguration } from '../configuration.js';
import type { PaymentProvider } from '../payment.js';
import { type RecoveryContext } from '../recovery.js';

export type HttpDb = ReturnType<typeof createDb>['db'];
export type HttpPool = ReturnType<typeof createDb>['pool'];

export type HttpDeps = {
  app: FastifyInstance;
  env: Env;
  db: HttpDb;
  pool: HttpPool;
  storage: StorageProvider;
  paymentProvider: PaymentProvider;
  overrides: { lyrics?: LyricsProvider; payment?: PaymentProvider };
};

export type CoverRow = {
  status: string;
  attempt: number;
  referenceFileId: string | null;
  hadReference: boolean;
  coverFileId: string | null;
  createdAt: Date;
};

export const createHttpContext = (deps: HttpDeps) => {
  const { app, env, db, pool, storage, paymentProvider, overrides } = deps;
  type AudioJobSelection = {
    provider: 'openrouter' | 'google';
    model: string;
  };
  const currentAudioJobSelection = (env: Env): AudioJobSelection => ({
    provider: env.MUSIC_PROVIDER,
    model:
      env.MUSIC_PROVIDER === 'google'
        ? env.GOOGLE_MUSIC_MODEL
        : (env.OPENROUTER_MUSIC_MODEL?.trim() ?? ''),
  });
  const fail = (message: string, statusCode = 400) => new PublicHttpError(message, statusCode);
  const orderFor = async (publicId: string) => {
    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    if (!order) throw fail('Pedido não encontrado', 404);
    return order;
  };
  const storyWithContact = async (orderId: string) => {
    const [session] = await db
      .select()
      .from(storySessions)
      .where(eq(storySessions.orderId, orderId));
    if (!session) return undefined;
    const [contact] = await db
      .select()
      .from(orderContacts)
      .where(eq(orderContacts.orderId, orderId));
    if (!contact) throw fail('Contato do pedido ausente.', 409);
    const consents = await db
      .select()
      .from(orderConsents)
      .where(eq(orderConsents.orderId, orderId))
      .orderBy(desc(orderConsents.recordedAt));
    const latest = (kind: typeof orderConsents.$inferSelect.kind) =>
      consents.find((row) => row.kind === kind);
    const terms = latest('terms');
    const privacy = latest('privacy');
    return mergeStoryContact(
      session.data,
      {
        email: contact.email,
        name: contact.name,
        marketingAccepted: contact.marketingAccepted,
      },
      {
        ...(terms && privacy && terms.policyVersion === privacy.policyVersion
          ? {
              termsAccepted: terms.accepted && privacy.accepted,
              policyVersion: terms.policyVersion,
            }
          : {}),
        marketingKnown: Boolean(latest('marketing')),
        ...(latest('content_rights')
          ? { safetyConfirmed: latest('content_rights')!.accepted }
          : {}),
      },
    );
  };
  /** Funnel analytics (no PII): best-effort para nunca quebrar a venda; falha vira warn. */
  const recordEvent = async (
    event: string,
    order: { publicId: string; productType: typeof orders.$inferSelect.productType },
    visitorId?: string | null,
  ): Promise<void> => {
    try {
      let visitor = visitorId ?? null;
      if (!visitor) {
        const [first] = await db
          .select({ visitorId: analyticsEvents.visitorId })
          .from(analyticsEvents)
          .where(
            and(
              eq(analyticsEvents.orderPublicId, order.publicId),
              eq(analyticsEvents.event, 'order_created'),
            ),
          );
        visitor = first?.visitorId ?? null;
      }
      await db.insert(analyticsEvents).values({
        event,
        productType: order.productType,
        orderPublicId: order.publicId,
        visitorId: visitor,
        utm: null,
      });
    } catch (error) {
      app.log.warn({ event, error: sanitizeAiError(error) }, 'analytics event dropped');
    }
  };
  const accessValue = (kind: 'order' | 'order_view', order: typeof orders.$inferSelect) =>
    `${kind}:${order.publicId}:${hashToken(order.accessTokenHash, env.COOKIE_SECRET)}`;
  const setAccessCookie = async (
    reply: FastifyReply,
    kind: 'order' | 'order_view',
    publicId: string,
  ) => {
    const order = await orderFor(publicId);
    reply.setCookie(`${kind}_${publicId}`, accessValue(kind, order), {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
      signed: true,
    });
  };
  const hasSignedAccess = async (
    kind: 'order' | 'order_view',
    publicId: string,
    request: FastifyRequest,
  ) => {
    const value = request.cookies[`${kind}_${publicId}`];
    if (!value) return false;
    const unsigned = request.unsignCookie(value);
    if (!unsigned.valid) return false;
    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    if (!order || order.accessRevokedAt || unsigned.value !== accessValue(kind, order))
      return false;
    if (kind === 'order_view') {
      const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
      return Boolean(
        delivery && !delivery.revokedAt && (!delivery.expiresAt || delivery.expiresAt > new Date()),
      );
    }
    return true;
  };
  const hasAccess = (publicId: string, request: FastifyRequest) =>
    hasSignedAccess('order', publicId, request);
  /** Recovery cookies permit reading only, and follow the live delivery revocation/expiry. */
  const hasViewAccess = async (publicId: string, request: FastifyRequest) =>
    (await hasAccess(publicId, request)) ||
    (await hasSignedAccess('order_view', publicId, request));
  const coverAvailable = Boolean(
    env.OPENROUTER_API_KEY &&
    env.OPENROUTER_COVER_TEXT_MODEL &&
    env.OPENROUTER_COVER_REFERENCE_MODEL,
  );
  const publicCover = (row: CoverRow, canMutate: boolean) => ({
    status: row.status,
    attempt: row.attempt,
    canRegenerate: canMutate && row.status === 'completed' && row.attempt === 1,
    hasReference: row.hadReference,
    createdAt: row.createdAt.toISOString(),
    ...(row.status === 'completed' && row.coverFileId
      ? { downloadUrl: '/api/v1/cover/download' }
      : {}),
  });
  const latestCover = async (orderId: string): Promise<CoverRow | undefined> => {
    const [cover] = await db
      .select({
        status: albumCovers.status,
        attempt: albumCovers.attempt,
        referenceFileId: albumCovers.referenceFileId,
        hadReference: albumCovers.hadReference,
        coverFileId: albumCovers.coverFileId,
        createdAt: albumCovers.createdAt,
      })
      .from(albumCovers)
      .where(eq(albumCovers.orderId, orderId))
      .orderBy(desc(albumCovers.attempt))
      .limit(1);
    return cover;
  };
  const requireAdmin = async (request: { cookies: Record<string, string | undefined> }) => {
    const token = request.cookies.admin_session;
    if (!token) throw fail('Autenticação administrativa necessária', 401);
    const [session] = await db
      .select()
      .from(adminSessions)
      .where(
        and(
          eq(adminSessions.tokenHash, hashToken(token, env.CUSTOMER_ACCESS_TOKEN_PEPPER)),
          gt(adminSessions.expiresAt, new Date()),
        ),
      );
    if (!session) throw fail('Sessão administrativa expirada', 401);
    return session;
  };
  const generateOrderLyrics = (
    order: typeof orders.$inferSelect,
    body: unknown,
    administrative = false,
  ) =>
    requestLyricsGeneration(
      {
        db,
        storyWithContact,
        recoveryContext,
        lyricsAvailable: Boolean(
          overrides.lyrics || publicConfiguration(env).generation.lyricsAvailable,
        ),
      },
      order,
      body,
      administrative,
    );
  const releasedDeliveryFor = async (orderId: string) => {
    const [released] = await db
      .select({ delivery: deliveries })
      .from(deliveries)
      .innerJoin(orders, eq(orders.id, deliveries.orderId))
      .innerJoin(
        productions,
        and(eq(productions.id, deliveries.productionId), eq(productions.orderId, orders.id)),
      )
      .where(
        and(
          eq(orders.id, orderId),
          sql`${orders.accessRevokedAt} is null`,
          sql`${orders.status} not in ('cancelled','refunded')`,
          eq(productions.status, 'completed'),
          sql`${deliveries.revokedAt} is null`,
          sql`${deliveries.deliveredAt} is not null`,
          sql`(${deliveries.expiresAt} is null or ${deliveries.expiresAt} > now())`,
          sql`exists (select 1 from payments where order_id=${orders.id} and status='approved')`,
        ),
      );
    if (!released) throw fail('Entrega indisponível.', 404);
    return released.delivery;
  };
  const deliveredOrderFor = async (token: string) => {
    const [delivery] = await db
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.tokenHash, hashToken(token, env.CUSTOMER_ACCESS_TOKEN_PEPPER)),
          sql`${deliveries.revokedAt} is null`,
        ),
      );
    if (!delivery || (delivery.expiresAt && delivery.expiresAt <= new Date()))
      throw fail('Link de entrega inválido ou expirado.', 404);
    const [order] = await db.select().from(orders).where(eq(orders.id, delivery.orderId));
    if (!order) throw fail('Entrega indisponível.', 404);
    await releasedDeliveryFor(order.id);
    return order;
  };
  const operationalFailure = sql`${orders.status} not in ('cancelled','refunded') and (
    ${orders.status} = 'failed'
    or exists (select 1 from album_covers c where c.order_id=${orders.id} and c.attempt=(select max(c2.attempt) from album_covers c2 where c2.order_id=${orders.id}) and (c.status='failed' or (c.status='processing' and (select j.status from generation_jobs j where j.order_id=${orders.id} and j.type='generate_cover' order by j.created_at desc,j.id desc limit 1)='failed')))
    or (${orders.status}='delivered' and not exists(select 1 from email_deliveries e where e.order_id=${orders.id} and e.production_id=${orders.currentProductionId} and e.status='sent') and (select j.status from generation_jobs j where j.order_id=${orders.id} and j.type in ('deliver_notify','generate_audio') order by j.created_at desc,j.id desc limit 1)='failed')
    or (${orders.status} not in ('delivered','cancelled','refunded') and (select j.status from generation_jobs j where j.order_id=${orders.id} and j.type='generate_audio' order by j.created_at desc,j.id desc limit 1)='failed')
  )`;
  type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const recoveryContext = async (
    order: typeof orders.$inferSelect,
    source: Transaction | typeof db = db,
  ): Promise<RecoveryContext> => {
    const [
      paymentRows,
      versions,
      submissions,
      jobs,
      covers,
      emails,
      links,
      audioRows,
      unresolvedCalls,
    ] = [
      await source.select().from(payments).where(eq(payments.orderId, order.id)),
      await source.select().from(lyricVersions).where(eq(lyricVersions.orderId, order.id)),
      await source
        .select({ id: storySessions.id })
        .from(storySessions)
        .where(eq(storySessions.orderId, order.id)),
      await source
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.orderId, order.id))
        .orderBy(generationJobs.createdAt),
      await source
        .select({ ...getTableColumns(albumCovers), referenceCreatedAt: storedFiles.createdAt })
        .from(albumCovers)
        .leftJoin(storedFiles, eq(storedFiles.id, albumCovers.referenceFileId))
        .where(eq(albumCovers.orderId, order.id)),
      await source
        .select({ status: emailDeliveries.status })
        .from(emailDeliveries)
        .where(
          and(
            eq(emailDeliveries.orderId, order.id),
            sql`${emailDeliveries.productionId} = ${order.currentProductionId}`,
          ),
        ),
      await source.select().from(deliveries).where(eq(deliveries.orderId, order.id)),
      await source
        .select({ variant: audioGenerations.variant })
        .from(audioGenerations)
        .where(
          and(
            eq(audioGenerations.orderId, order.id),
            eq(audioGenerations.status, 'completed'),
            eq(audioGenerations.selected, true),
            sql`${audioGenerations.productionId} = ${order.currentProductionId}`,
            sql`${audioGenerations.fileId} is not null`,
          ),
        ),
      await source
        .select({ kind: aiCalls.kind })
        .from(aiCalls)
        .where(and(eq(aiCalls.orderId, order.id), eq(aiCalls.status, 'unknown'))),
    ];
    const link = links[0];
    return {
      status: order.status,
      currentProductionId: order.currentProductionId,
      latestLyricVersion: Math.max(0, ...versions.map((version) => version.number)),
      unresolvedAiKinds: unresolvedCalls.map((call) => call.kind),
      audioReady: [1, 2].every((variant) => audioRows.some((row) => row.variant === variant)),
      paid: paymentRows.some((item) => item.status === 'approved'),
      approvedLyrics: versions.some((item) => item.approvedAt),
      hasStory: Boolean(submissions.length),
      generatedCount: versions.filter((item) => item.kind === 'generated').length,
      lyricsAvailable: Boolean(
        overrides.lyrics || publicConfiguration(env).generation.lyricsAvailable,
      ),
      jobs,
      covers,
      emailSent: emails.some((item) => item.status === 'sent'),
      deliveryBlocked: Boolean(
        order.accessRevokedAt ||
        (link &&
          (link.revokedAt ||
            (link.expiresAt && link.expiresAt <= new Date()) ||
            link.tokenHash !==
              hashToken(
                stableDeliveryToken(link.id, env.CUSTOMER_ACCESS_TOKEN_PEPPER),
                env.CUSTOMER_ACCESS_TOKEN_PEPPER,
              ))),
      ),
    };
  };
  const revokeOrderAccess = async (id: string, rotate: boolean, adminUserId: string) => {
    const token = createAccessToken();
    await db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
      if (!order) throw fail('Pedido não encontrado', 404);
      await tx
        .update(orders)
        .set({
          accessTokenHash: hashToken(token, env.CUSTOMER_ACCESS_TOKEN_PEPPER),
          creationKeyHash: null,
          accessRevokedAt: rotate ? null : new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, id));
      await tx
        .update(deliveries)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(eq(deliveries.orderId, id));
      await tx.insert(adminNotes).values({
        orderId: id,
        adminUserId,
        message: rotate
          ? 'Link de acesso do cliente substituído; acessos anteriores revogados.'
          : 'Acessos privados do pedido revogados pela administração.',
      });
    });
    return token;
  };
  const enqueueAudioReplacement = (id: string, adminUserId: string, audioId?: string) =>
    replaceAudioProduction(
      db,
      currentAudioJobSelection(env),
      recoveryContext,
      id,
      adminUserId,
      audioId,
    );

  return {
    app,
    env,
    db,
    pool,
    storage,
    paymentProvider,
    overrides,
    fail,
    orderFor,
    recordEvent,
    setAccessCookie,
    hasAccess,
    hasViewAccess,
    coverAvailable,
    publicCover,
    latestCover,
    requireAdmin,
    generateOrderLyrics,
    deliveredOrderFor,
    releasedDeliveryFor,
    operationalFailure,
    recoveryContext,
    revokeOrderAccess,
    enqueueAudioReplacement,
    currentAudioJobSelection,
    storyWithContact,
  };
};

export type HttpContext = ReturnType<typeof createHttpContext>;
