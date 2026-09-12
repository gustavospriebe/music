import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  adminNotes,
  audioGenerations,
  deliveries,
  generationJobs,
  lyricVersions,
  orderEvents,
  orders,
  productions,
} from '@resenha/database';
import { assertTransition } from '@resenha/domain';
import type { HttpDb } from '../routes/context.js';
import { audioRecoveryReason, type RecoveryContext } from '../recovery.js';
import { PublicHttpError } from '../http.js';

type Transaction = Parameters<Parameters<HttpDb['transaction']>[0]>[0];
type Selection = { provider: 'google' | 'openrouter'; model: string };

export const replaceAudioProduction = async (
  db: HttpDb,
  selection: Selection,
  recoveryContext: (order: typeof orders.$inferSelect, tx: Transaction) => Promise<RecoveryContext>,
  id: string,
  adminUserId: string,
  audioId?: string,
): Promise<{ queued: true }> =>
  db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
    if (!order) throw new PublicHttpError('Pedido não encontrado.', 404);
    const reason = audioRecoveryReason(await recoveryContext(order, tx));
    if (reason) throw new PublicHttpError(reason, 409);
    const [lyrics] = await tx
      .select()
      .from(lyricVersions)
      .where(and(eq(lyricVersions.orderId, id), sql`${lyricVersions.approvedAt} is not null`))
      .orderBy(desc(lyricVersions.number))
      .limit(1);
    if (!lyrics) throw new PublicHttpError('Uma letra aprovada é necessária.', 409);
    const [current] = order.currentProductionId
      ? await tx.select().from(productions).where(eq(productions.id, order.currentProductionId))
      : [];
    const [delivery] = await tx.select().from(deliveries).where(eq(deliveries.orderId, id));
    const released = Boolean(
      current &&
      (current.status === 'completed' ||
        order.status === 'delivered' ||
        delivery?.productionId === current.id),
    );
    let variant: number | undefined;
    let partner: typeof audioGenerations.$inferSelect | undefined;
    if (audioId) {
      const [audio] = await tx
        .select()
        .from(audioGenerations)
        .where(and(eq(audioGenerations.id, audioId), eq(audioGenerations.orderId, id)));
      if (!audio || audio.productionId !== current?.id)
        throw new PublicHttpError('Este áudio pertence a uma produção anterior.', 409);
      if (current.provenance !== 'recorded' || current.lyricVersionId !== lyrics.id)
        throw new PublicHttpError(
          'A letra aprovada mudou ou a origem não está comprovada. Solicite uma nova produção das duas versões.',
          409,
        );
      variant = audio.variant;
      if ((audio.provider === 'google' || audio.provider === 'openrouter') && audio.model?.trim())
        selection = { provider: audio.provider, model: audio.model };
      if (released) {
        if (!audio.selected)
          throw new PublicHttpError('Selecione a versão que foi liberada nesta produção.', 409);
        [partner] = await tx
          .select()
          .from(audioGenerations)
          .where(
            and(
              eq(audioGenerations.productionId, current.id),
              eq(audioGenerations.variant, variant === 1 ? 2 : 1),
              eq(audioGenerations.selected, true),
              eq(audioGenerations.status, 'completed'),
              sql`${audioGenerations.fileId} is not null`,
              sql`${audioGenerations.durationMs} >= 10000`,
            ),
          );
        if (!partner)
          throw new PublicHttpError(
            'A outra versão não tem áudio validado para reaproveitar. Solicite uma nova produção das duas versões.',
            409,
          );
      }
    }

    // Released productions and their selection are immutable delivery history.
    let productionId = variant && !released ? current!.id : undefined;
    let productionNumber = current?.number;
    if (!productionId) {
      const [last] = await tx
        .select({ number: productions.number })
        .from(productions)
        .where(eq(productions.orderId, id))
        .orderBy(desc(productions.number))
        .limit(1);
      productionNumber = (last?.number ?? 0) + 1;
      const [created] = await tx
        .insert(productions)
        .values({
          orderId: id,
          number: productionNumber,
          lyricVersionId: lyrics.id,
          status: 'queued',
        })
        .returning();
      productionId = created!.id;
      if (partner) {
        // This is a reference to an already validated artifact, not a new provider generation.
        const [reused] = await tx
          .insert(audioGenerations)
          .values({
            orderId: id,
            productionId,
            variant: partner.variant,
            attempt: 1,
            status: 'completed',
            selected: true,
            fileId: partner.fileId,
            durationMs: partner.durationMs,
            provider: partner.provider,
            model: partner.model,
            externalId: partner.externalId,
          })
          .returning({ id: audioGenerations.id });
        await tx.insert(orderEvents).values({
          orderId: id,
          type: 'audio_reused',
          data: {
            productionId,
            audioId: reused!.id,
            sourceProductionId: current!.id,
            sourceAudioId: partner.id,
            variant: partner.variant,
            lyricVersion: lyrics.number,
          },
        });
      }
    } else {
      await tx
        .update(productions)
        .set({ status: 'queued', updatedAt: new Date() })
        .where(eq(productions.id, productionId));
      await tx
        .update(audioGenerations)
        .set({ selected: false, updatedAt: new Date() })
        .where(
          and(
            eq(audioGenerations.productionId, productionId),
            eq(audioGenerations.variant, variant!),
          ),
        );
    }
    let status = order.status;
    if (status === 'delivered') {
      assertTransition(status, 'revision_requested');
      status = 'revision_requested';
    }
    if (status === 'review_required') {
      assertTransition(status, 'failed');
      status = 'failed';
    }
    if (status !== 'audio_queued') assertTransition(status, 'audio_queued');
    await tx
      .update(orders)
      .set({ status: 'audio_queued', currentProductionId: productionId, updatedAt: new Date() })
      .where(eq(orders.id, id));
    await tx.insert(generationJobs).values({
      type: 'generate_audio',
      orderId: id,
      payload: { productionId, ...selection, ...(variant ? { variant } : {}) },
      idempotencyKey: `audio:${productionId}:replace:${randomUUID()}`,
      maxAttempts: 1,
    });
    await tx.insert(orderEvents).values({
      orderId: id,
      type: 'production_requested',
      data: { productionNumber, lyricVersion: lyrics.number, variant: variant ?? null },
    });
    await tx.insert(adminNotes).values({
      orderId: id,
      adminUserId,
      message: partner
        ? `Nova produção ${productionNumber}: recriar a versão ${variant} e reaproveitar a outra versão validada da mesma letra. A entrega anterior foi preservada.`
        : variant
          ? `Nova tentativa da versão ${variant} solicitada na mesma letra. Histórico preservado.`
          : 'Nova produção das duas versões solicitada com a letra aprovada atual. Histórico preservado.',
    });
    return { queued: true };
  });
