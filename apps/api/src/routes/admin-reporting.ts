import type { FastifyInstance } from 'fastify';
import { and, inArray, sql } from 'drizzle-orm';
import { readQueueMetrics, aiUsage, analyticsEvents, orders, payments } from '@resenha/database';
import type { HttpContext } from './context.js';

export const registerAdminReportingRoutes = (app: FastifyInstance, ctx: HttpContext) => {
  const { db, requireAdmin, operationalFailure } = ctx;

  /** Agregados operacionais do cockpit admin: totais via SQL, sem paginar tudo no cliente. */
  app.get('/api/v1/admin/overview', async (request) => {
    await requireAdmin(request);
    const [totals] = await db
      .select({
        orders: sql<number>`count(*)::int`,
      })
      .from(orders);
    const financialRows = await db
      .select({
        environment: payments.environment,
        attempts: sql<number>`count(*)::int`,
        paid: sql<number>`count(distinct ${payments.orderId}) filter (where ${payments.status}='approved')::int`,
        approvedCents: sql<number>`coalesce(sum(${payments.amountCents}) filter (where ${payments.status}='approved'),0)::float8`,
        refundedCents: sql<number>`coalesce(sum(${payments.amountCents}) filter (where ${payments.status}='refunded'),0)::float8`,
      })
      .from(payments)
      .groupBy(payments.environment);
    const financialEnvironments = (['live', 'sandbox', 'local', 'unclassified'] as const).map(
      (environment) => {
        const row = financialRows.find(
          (value) => (value.environment ?? 'unclassified') === environment,
        );
        return {
          environment,
          attempts: row?.attempts ?? 0,
          paid: row?.paid ?? 0,
          approvedCents: row?.approvedCents ?? 0,
          refundedCents: row?.refundedCents ?? 0,
        };
      },
    );
    const live = financialEnvironments[0]!;
    const [attention] = await db
      .select({
        failedOperationalOrders: sql<number>`count(*) filter (where ${operationalFailure})::int`,
        failed: sql<number>`count(*) filter (where ${orders.status} = 'failed')::int`,
        reviewRequired: sql<number>`count(*) filter (where ${orders.status} = 'review_required')::int`,
        audioQueued: sql<number>`count(*) filter (where ${orders.status} = 'audio_queued')::int`,
        lyricsGenerating: sql<number>`count(*) filter (where ${orders.status} = 'lyrics_generating')::int`,
      })
      .from(orders);
    return {
      queue: await readQueueMetrics(ctx.pool),
      totals: {
        orders: totals?.orders ?? 0,
        paid: live.paid,
        revenueCents: live.approvedCents,
        refundedCents: live.refundedCents,
      },
      financialEnvironments,
      attention: {
        failedOperationalOrders: attention?.failedOperationalOrders ?? 0,
        failed: attention?.failed ?? 0,
        reviewRequired: attention?.reviewRequired ?? 0,
        audioQueued: attention?.audioQueued ?? 0,
        lyricsGenerating: attention?.lyricsGenerating ?? 0,
      },
    };
  });

  /** Custo de IA agregado para o painel admin (mês corrente + últimos 30 dias). */
  app.get('/api/v1/admin/ai-usage/summary', async (request) => {
    await requireAdmin(request);
    const zero = '0';
    const [month] = await db
      .select({
        totalUsd: sql<string | null>`sum(${aiUsage.costUsd})::text`,
        lyricsUsd: sql<
          string | null
        >`sum(${aiUsage.costUsd}) filter (where ${aiUsage.kind} = 'lyrics')::text`,
        audioUsd: sql<
          string | null
        >`sum(${aiUsage.costUsd}) filter (where ${aiUsage.kind} = 'audio')::text`,
        estimatedCalls: sql<number>`count(*) filter (where ${aiUsage.costSource} = 'estimated')::int`,
        unknownCostCalls: sql<number>`count(*) filter (where ${aiUsage.costSource} = 'unknown')::int`,
        calls: sql<number>`count(*)::int`,
        blocked: sql<number>`count(*) filter (where ${aiUsage.status} = 'blocked')::int`,
      })
      .from(aiUsage)
      .where(sql`date_trunc('month', ${aiUsage.createdAt}) = date_trunc('month', now())`);
    const byDay = await db
      .select({
        day: sql<string>`date_trunc('day', ${aiUsage.createdAt})::date::text`,
        totalUsd: sql<string | null>`sum(${aiUsage.costUsd})::text`,
        estimatedCalls: sql<number>`count(*) filter (where ${aiUsage.costSource} = 'estimated')::int`,
        unknownCostCalls: sql<number>`count(*) filter (where ${aiUsage.costSource} = 'unknown')::int`,
        calls: sql<number>`count(*)::int`,
        blocked: sql<number>`count(*) filter (where ${aiUsage.status} = 'blocked')::int`,
      })
      .from(aiUsage)
      .where(sql`${aiUsage.createdAt} >= date_trunc('day', now()) - interval '29 days'`)
      .groupBy(sql`1`)
      .orderBy(sql`1`);
    return {
      month: {
        estimatedCalls: month?.estimatedCalls ?? 0,
        unknownCostCalls: month?.unknownCostCalls ?? 0,
        totalUsd: month?.totalUsd ?? zero,
        lyricsUsd: month?.lyricsUsd ?? zero,
        audioUsd: month?.audioUsd ?? zero,
        calls: month?.calls ?? 0,
        blocked: month?.blocked ?? 0,
      },
      byDay: byDay.map((row) => ({
        day: row.day,
        estimatedCalls: row.estimatedCalls,
        unknownCostCalls: row.unknownCostCalls,
        totalUsd: row.totalUsd ?? zero,
        calls: row.calls,
        blocked: row.blocked,
      })),
    };
  });

  /** Funil de conversão por etapa (pedidos distintos) + custo médio por entrega. */
  app.get('/api/v1/admin/analytics/funnel', async (request) => {
    await requireAdmin(request);
    const rawDays = Number((request.query as { days?: string }).days ?? 30);
    const days = Number.isFinite(rawDays) ? Math.min(90, Math.max(1, Math.floor(rawDays))) : 30;
    const stages = [
      'order_created',
      'story_saved',
      'lyrics_generated',
      'lyrics_approved',
      'checkout_started',
      'paid',
      'delivered',
    ];
    const counts = await db
      .select({
        event: analyticsEvents.event,
        orders: sql<number>`count(distinct ${analyticsEvents.orderPublicId})::int`,
      })
      .from(analyticsEvents)
      .where(
        and(
          sql`${analyticsEvents.createdAt} >= date_trunc('day', now()) - interval '${sql.raw(String(days))} days'`,
          inArray(analyticsEvents.event, stages),
        ),
      )
      .groupBy(analyticsEvents.event);
    const byEvent = new Map(counts.map((row) => [row.event, row.orders]));
    const steps = stages.map((event, index) => {
      const orders = byEvent.get(event) ?? 0;
      const previous = index === 0 ? null : (byEvent.get(stages[index - 1] as string) ?? 0);
      return { event, orders, rateFromPrevious: previous ? orders / previous : null };
    });
    const [cost] = await db
      .select({
        perSaleUsd: sql<
          string | null
        >`(sum(${aiUsage.costUsd}) / nullif(count(distinct ${aiUsage.orderId}), 0))::text`,
        sales: sql<number>`count(distinct ${aiUsage.orderId})::int`,
      })
      .from(aiUsage)
      .where(
        and(
          sql`${aiUsage.createdAt} >= date_trunc('day', now()) - interval '${sql.raw(String(days))} days'`,
          sql`exists (select 1 from orders where orders.id = ${aiUsage.orderId} and orders.status = 'delivered')`,
          sql`exists (select 1 from payments where payments.order_id = ${aiUsage.orderId} and payments.environment = 'live' and payments.status = 'approved')`,
        ),
      );
    const preOrder = await db
      .select({
        event: analyticsEvents.event,
        visitors: sql<number>`count(distinct ${analyticsEvents.visitorId})::int`,
      })
      .from(analyticsEvents)
      .where(
        and(
          sql`${analyticsEvents.createdAt} >= date_trunc('day', now()) - interval '${sql.raw(String(days))} days'`,
          inArray(analyticsEvents.event, ['landing_view', 'form_started', 'form_completed']),
        ),
      )
      .groupBy(analyticsEvents.event);
    return {
      days,
      steps,
      preOrder,
      perSaleUsd: cost?.perSaleUsd ?? '0',
      salesWithCost: cost?.sales ?? 0,
    };
  });
};
