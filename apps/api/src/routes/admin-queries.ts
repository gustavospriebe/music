import type { FastifyInstance } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import { adminOrdersQuerySchema } from '@resenha/contracts';
import {
  adminNotes,
  productions,
  orderEvents,
  aiCalls,
  aiUsage,
  audioGenerations,
  emailDeliveries,
  generationJobs,
  lyricVersions,
  orders,
  payments,
  revisionRequests,
  storySessions,
} from '@resenha/database';
import {
  audioRecoveryReason,
  failureCode,
  jobRecovery,
  publicFailure,
  recoveryFor,
  referenceRequired,
} from '../recovery.js';
import { nextUtcDate, spDayStartUtc } from '../http.js';
import type { HttpContext } from './context.js';

export const registerAdminQueriesRoutes = (app: FastifyInstance, ctx: HttpContext) => {
  const { db, fail, requireAdmin, operationalFailure, recoveryContext, storyWithContact } = ctx;

  app.get('/api/v1/admin/orders', async (request) => {
    await requireAdmin(request);
    const query = adminOrdersQuerySchema.parse(request.query ?? {});
    // Filtro exibe dia corrido Brasil (America/Sao_Paulo, com DST histórico via Intl);
    // persistência e comparação seguem em UTC ISO. (AGENTS.md: UTC no armazenamento.)
    const fromUtc = query.from ? spDayStartUtc(query.from) : undefined;
    const toUtc = query.to ? spDayStartUtc(nextUtcDate(query.to)) : undefined;
    const filters = [
      query.status ? eq(orders.status, query.status) : undefined,
      query.attention === 'failures' ? operationalFailure : undefined,
      query.productType ? eq(orders.productType, query.productType) : undefined,
      query.q ? sql`${orders.publicId} ilike ${`%${query.q}%`}` : undefined,
      fromUtc ? sql`${orders.createdAt} >= ${fromUtc}` : undefined,
      toUtc ? sql`${orders.createdAt} < ${toUtc}` : undefined,
    ].filter(Boolean);
    const where = filters.length ? and(...filters) : undefined;
    const pageSize = 30;
    const rows = await db
      .select({
        id: orders.id,
        publicId: orders.publicId,
        productType: orders.productType,
        status: orders.status,
        priceCents: orders.priceCents,
        createdAt: orders.createdAt,
        subjectName: sql<string | null>`${storySessions.data} ->> 'subjectName'`,
      })
      .from(orders)
      .leftJoin(storySessions, eq(storySessions.orderId, orders.id))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(pageSize)
      .offset((query.page - 1) * pageSize);
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(where);
    return { items: rows, page: query.page, total: countRow?.count ?? 0, pageSize };
  });

  app.get('/api/v1/admin/orders/:id', async (request) => {
    await requireAdmin(request);
    const id = (request.params as { id: string }).id;
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) throw fail('Pedido não encontrado', 404);
    const story = await storyWithContact(id);
    const lyrics = await db
      .select()
      .from(lyricVersions)
      .where(eq(lyricVersions.orderId, id))
      .orderBy(desc(lyricVersions.number));
    const paymentRows = await db.select().from(payments).where(eq(payments.orderId, id));
    const jobs = await db.select().from(generationJobs).where(eq(generationJobs.orderId, id));
    const audio = await db
      .select()
      .from(audioGenerations)
      .where(
        and(
          eq(audioGenerations.orderId, id),
          sql`${audioGenerations.productionId} = ${order.currentProductionId}`,
        ),
      );
    const productionHistory = await db
      .select()
      .from(productions)
      .where(eq(productions.orderId, id))
      .orderBy(desc(productions.number));
    const unknownCalls = await db
      .select({
        id: aiCalls.id,
        kind: aiCalls.kind,
        provider: aiCalls.provider,
        status: aiCalls.status,
        createdAt: aiCalls.createdAt,
      })
      .from(aiCalls)
      .where(and(eq(aiCalls.orderId, id), eq(aiCalls.status, 'unknown')));
    const events = await db
      .select({ type: orderEvents.type, data: orderEvents.data, createdAt: orderEvents.createdAt })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, id))
      .orderBy(desc(orderEvents.createdAt))
      .limit(100);
    const notes = await db.select().from(adminNotes).where(eq(adminNotes.orderId, id));
    const revisionRows = await db
      .select({ message: revisionRequests.message, createdAt: revisionRequests.createdAt })
      .from(revisionRequests)
      .where(eq(revisionRequests.orderId, id))
      .orderBy(desc(revisionRequests.createdAt));
    const usageRows = await db.select().from(aiUsage).where(eq(aiUsage.orderId, id));
    const [sums] = await db
      .select({
        totalUsd: sql<string | null>`sum(${aiUsage.costUsd})::text`,
        lyricsUsd: sql<
          string | null
        >`sum(${aiUsage.costUsd}) filter (where ${aiUsage.kind} = 'lyrics')::text`,
        audioUsd: sql<
          string | null
        >`sum(${aiUsage.costUsd}) filter (where ${aiUsage.kind} = 'audio')::text`,
        inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
        estimatedCalls: sql<number>`count(*) filter (where ${aiUsage.costSource} = 'estimated')::int`,
        unknownCostCalls: sql<number>`count(*) filter (where ${aiUsage.costSource} = 'unknown')::int`,
        calls: sql<number>`count(*)::int`,
      })
      .from(aiUsage)
      .where(eq(aiUsage.orderId, id));
    const aiCost = {
      estimatedCalls: sums?.estimatedCalls ?? 0,
      unknownCostCalls: sums?.unknownCostCalls ?? 0,
      totalUsd: sums?.totalUsd ?? '0',
      lyricsUsd: sums?.lyricsUsd ?? '0',
      audioUsd: sums?.audioUsd ?? '0',
      inputTokens: sums?.inputTokens ?? 0,
      outputTokens: sums?.outputTokens ?? 0,
      calls: sums?.calls ?? 0,
    };
    const context = await recoveryContext(order);
    const notifications = await db
      .select({
        id: emailDeliveries.id,
        status: emailDeliveries.status,
        productionId: emailDeliveries.productionId,
        provider: emailDeliveries.provider,
        createdAt: emailDeliveries.createdAt,
        updatedAt: emailDeliveries.updatedAt,
      })
      .from(emailDeliveries)
      .where(eq(emailDeliveries.orderId, id));
    return {
      productionHistory,
      unknownCalls,
      events,
      recovery: recoveryFor(context),
      covers: context.covers.map((cover) => ({
        id: cover.id,
        attempt: cover.attempt,
        status: cover.status,
        hasReference: cover.hadReference,
        referenceAvailable: Boolean(cover.referenceFileId) && !referenceRequired(cover),
        createdAt: cover.createdAt,
        updatedAt: cover.updatedAt,
        lastError: publicFailure(cover.lastError),
        errorCode: failureCode(cover.lastError),
      })),
      notifications,
      order: {
        id: order.id,
        publicId: order.publicId,
        productType: order.productType,
        status: order.status,
        priceCents: order.priceCents,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        accessRevokedAt: order.accessRevokedAt,
      },
      revisionRequests: revisionRows.map((revision, index) => ({
        ...revision,
        status: index === 0 && order.status === 'revision_requested' ? 'pending' : 'processed',
      })),
      story,
      lyrics,
      payments: paymentRows,
      jobs: jobs.map((job) => ({
        ...job,
        lastError: publicFailure(job.lastError),
        errorCode: failureCode(job.lastError),
        ...jobRecovery(job, context),
      })),
      audio: audio.map((item) => ({
        ...item,
        canRegenerate: !audioRecoveryReason(context),
        regenerateBlockedReason: audioRecoveryReason(context),
      })),
      notes,
      aiUsage: usageRows.map((usage) => ({
        ...usage,
        error: publicFailure(usage.error),
        errorCode: failureCode(usage.error),
      })),
      aiCost,
    };
  });
};
