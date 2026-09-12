import type { FastifyInstance } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { lyricsContentSchema } from '@resenha/contracts';
import {
  adminNotes,
  productions,
  orderEvents,
  audioGenerations,
  deliveries,
  generationJobs,
  lyricVersions,
  orders,
  payments,
} from '@resenha/database';
import { assertTransition, stableDeliveryToken, hashToken } from '@resenha/domain';
import { publicFailure, recoveryFor } from '../recovery.js';
import { validateCustomerLyrics } from '../orders/lyrics.js';
import type { HttpContext } from './context.js';

export const registerAdminProductionRoutes = (app: FastifyInstance, ctx: HttpContext) => {
  const {
    env,
    db,
    fail,
    recordEvent,
    requireAdmin,
    generateOrderLyrics,
    recoveryContext,
    enqueueAudioReplacement,
    storyWithContact,
  } = ctx;

  app.post('/api/v1/admin/orders/:id/lyrics/generate', async (request, reply) => {
    const session = await requireAdmin(request);
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, (request.params as { id: string }).id));
    if (!order) throw fail('Pedido não encontrado', 404);
    const outcome = await generateOrderLyrics(order, request.body, true).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    await db.insert(adminNotes).values({
      orderId: order.id,
      adminUserId: session.userId,
      message: outcome.ok
        ? 'Geração de letra solicitada pela administração.'
        : 'Geração de letra solicitada pela administração não concluída. ' +
          publicFailure(outcome.error instanceof Error ? outcome.error.message : null),
    });
    if (!outcome.ok) throw outcome.error;
    return reply.status(202).send(outcome.value);
  });

  app.post('/api/v1/admin/orders/:id/audio/:audioId/approve', async (request) => {
    const session = await requireAdmin(request);
    const { id, audioId } = request.params as { id: string; audioId: string };
    let token: string;
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
      if (current?.status !== 'review_required') throw fail('Pedido não está em revisão.', 400);
      if (!current.currentProductionId) throw fail('Produção sem origem comprovada.', 409);
      const [production] = await tx
        .select()
        .from(productions)
        .where(eq(productions.id, current.currentProductionId))
        .for('update');
      if (!production || production.provenance !== 'recorded')
        throw fail('Produção sem origem comprovada.', 409);
      const ready = await tx
        .select()
        .from(audioGenerations)
        .where(
          and(
            eq(audioGenerations.productionId, production.id),
            eq(audioGenerations.selected, true),
            eq(audioGenerations.status, 'completed'),
            sql`${audioGenerations.fileId} is not null`,
            sql`${audioGenerations.durationMs} >= 10000`,
          ),
        );
      if (
        !ready.some((row) => row.id === audioId) ||
        ![1, 2].every((variant) => ready.some((row) => row.variant === variant))
      )
        throw fail('Ambas as versões da produção atual precisam de áudio válido.', 409);
      const [payment] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.orderId, id), eq(payments.status, 'approved')));
      if (!payment || current.accessRevokedAt) throw fail('Entrega indisponível.', 409);
      assertTransition(current.status, 'delivered');
      await tx
        .update(productions)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(productions.id, production.id));

      const [existingDelivery] = await tx
        .select()
        .from(deliveries)
        .where(eq(deliveries.orderId, id));
      const deliveryId = existingDelivery?.id ?? randomUUID();
      token = stableDeliveryToken(deliveryId, env.CUSTOMER_ACCESS_TOKEN_PEPPER);
      if (
        existingDelivery &&
        (existingDelivery.revokedAt ||
          (existingDelivery.expiresAt && existingDelivery.expiresAt <= new Date()) ||
          existingDelivery.tokenHash !== hashToken(token, env.CUSTOMER_ACCESS_TOKEN_PEPPER))
      )
        throw fail('Acesso de entrega requer revisão administrativa.', 409);
      await tx
        .update(orders)
        .set({ status: 'delivered', updatedAt: new Date() })
        .where(eq(orders.id, id));
      await tx
        .insert(deliveries)
        .values({
          id: deliveryId,
          orderId: id,
          tokenHash: hashToken(token, env.CUSTOMER_ACCESS_TOKEN_PEPPER),
          productionId: production.id,
          deliveredAt: new Date(),
        })
        .onConflictDoUpdate({
          target: deliveries.orderId,
          set: { productionId: production.id, deliveredAt: new Date(), updatedAt: new Date() },
        });
      await tx.insert(orderEvents).values({
        orderId: id,
        type: 'production_approved',
        data: { productionNumber: production.number },
      });
      await tx.insert(adminNotes).values({
        orderId: id,
        adminUserId: session.userId,
        message: 'As duas versões de áudio foram aprovadas para entrega.',
      });
      await tx
        .insert(generationJobs)
        .values({
          type: 'deliver_notify',
          orderId: id,
          payload: {},
          idempotencyKey: `notification:${id}:${production.id}`,
          maxAttempts: 6,
        })
        .onConflictDoNothing();
    });
    const [delivered] = await db.select().from(orders).where(eq(orders.id, id));
    if (delivered) await recordEvent('delivered', delivered);
    return { delivered: true, deliveryToken: token! };
  });

  app.post('/api/v1/admin/orders/:id/audio/:audioId/regenerate', async (request) => {
    const session = await requireAdmin(request);
    const { id, audioId } = request.params as { id: string; audioId: string };
    return enqueueAudioReplacement(id, session.userId, audioId);
  });

  app.patch('/api/v1/admin/orders/:id/lyrics', async (request) => {
    const session = await requireAdmin(request);
    const id = (request.params as { id: string }).id;
    const candidate = lyricsContentSchema.parse(request.body);
    return db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
      if (!order) throw fail('Pedido não encontrado.', 404);
      const context = await recoveryContext(order, tx);
      if (!recoveryFor(context).lyrics.canEdit)
        throw fail(
          recoveryFor(context).lyrics.reason ?? 'Esta etapa não permite editar a letra.',
          409,
        );
      const story = await storyWithContact(id);
      if (!story) throw fail('Formulário ausente.');
      const content = validateCustomerLyrics(candidate, story);
      const [latest] = await tx
        .select({ number: lyricVersions.number })
        .from(lyricVersions)
        .where(eq(lyricVersions.orderId, id))
        .orderBy(desc(lyricVersions.number))
        .limit(1);
      const [version] = await tx
        .insert(lyricVersions)
        .values({
          orderId: id,
          number: (latest?.number ?? 0) + 1,
          kind: 'edited',
          content,
          approvedAt: context.paid ? new Date() : null,
        })
        .returning();
      if (!context.paid && order.status !== 'lyrics_ready') {
        assertTransition(order.status, 'lyrics_ready');
        await tx
          .update(orders)
          .set({ status: 'lyrics_ready', updatedAt: new Date() })
          .where(eq(orders.id, id));
      }
      await tx.insert(adminNotes).values({
        orderId: id,
        adminUserId: session.userId,
        message: context.paid
          ? 'Letra corrigida pela administração para a próxima produção.'
          : 'Letra recuperada pela administração e disponível para aprovação do cliente.',
      });
      return version;
    });
  });

  app.post('/api/v1/admin/orders/:id/audio/rebuild', async (request) => {
    const session = await requireAdmin(request);
    return enqueueAudioReplacement((request.params as { id: string }).id, session.userId);
  });
};
