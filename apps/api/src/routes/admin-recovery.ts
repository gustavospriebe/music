import type { FastifyInstance } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createAlbumCoverSchema, adminResolveAiCallSchema } from '@resenha/contracts';
import {
  adminNotes,
  orderConsents,
  orderEvents,
  aiCalls,
  albumCovers,
  aiUsage,
  generationJobs,
  orders,
  storedFiles,
} from '@resenha/database';
import { assertTransition } from '@resenha/domain';
import { MAX_REFERENCE_IMAGE_BYTES, normalizeReferenceImage } from '../providers.js';
import { coverAttempt, jobRecovery, publicFailure, recoveryFor } from '../recovery.js';
import { publicConfiguration } from '../configuration.js';
import type { HttpContext } from './context.js';

export const registerAdminRecoveryRoutes = (app: FastifyInstance, ctx: HttpContext) => {
  const { env, db, storage, fail, requireAdmin, recoveryContext } = ctx;

  app.post('/api/v1/admin/orders/:id/ai-calls/:callId/resolve', async (request) => {
    const admin = await requireAdmin(request);
    const { id, callId } = request.params as { id: string; callId: string };
    const input = adminResolveAiCallSchema.parse(request.body);
    await db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
      if (!order) throw fail('Pedido não encontrado.', 404);
      const [call] = await tx
        .select()
        .from(aiCalls)
        .where(and(eq(aiCalls.id, callId), eq(aiCalls.orderId, id)))
        .for('update');
      if (!call || call.status !== 'unknown')
        throw fail('Esta chamada não tem resultado pendente de revisão.', 409);
      const [busy] = await tx
        .select({ id: generationJobs.id })
        .from(generationJobs)
        .where(and(eq(generationJobs.orderId, id), eq(generationJobs.status, 'processing')))
        .limit(1);
      if (busy) throw fail('Aguarde o trabalho em execução antes de resolver a chamada.', 409);
      await tx
        .update(aiCalls)
        .set({ status: 'failed', finishedAt: new Date() })
        .where(eq(aiCalls.id, callId));
      await tx
        .insert(aiUsage)
        .values({
          aiCallId: call.id,
          orderId: id,
          jobId: call.jobId,
          kind: call.kind,
          provider: call.provider,
          model: call.model,
          status: 'error',
          costSource: 'unknown',
          costUsd: null,
          error: 'AI_RESULT_UNKNOWN',
        })
        .onConflictDoNothing({ target: aiUsage.aiCallId });
      await tx.insert(orderEvents).values({
        orderId: id,
        type: 'ai_retry_authorized',
        data: { aiCallId: call.id, previousStatus: 'unknown', costSource: 'unknown' },
      });
      await tx.insert(adminNotes).values({
        orderId: id,
        adminUserId: admin.userId,
        message: `Resultado externo desconhecido revisado; custo anterior continua desconhecido. Uma nova execução foi autorizada separadamente: ${input.note}`,
      });
    });
    return { resolved: true };
  });

  app.post(
    '/api/v1/admin/jobs/:id/retry',
    { bodyLimit: MAX_REFERENCE_IMAGE_BYTES + 64 * 1024 },
    async (request) => {
      const session = await requireAdmin(request);
      const id = (request.params as { id: string }).id;
      let reference: Buffer | undefined;
      const policyVersion = publicConfiguration(env).commercial.policyVersion;
      if (request.isMultipart()) {
        const upload = await request.file();
        if (!upload || upload.fieldname !== 'reference')
          throw fail('Envie a foto e confirme o consentimento.');
        const bytes = await upload.toBuffer();
        if (
          !policyVersion ||
          (upload.fields.policyVersion as { value?: unknown } | undefined)?.value !== policyVersion
        )
          throw fail(
            'As condições de uso da imagem mudaram. Recarregue e confirme novamente.',
            409,
          );
        if ((upload.fields.consent as { value?: unknown } | undefined)?.value !== 'true')
          throw fail('Confirme o consentimento para a foto.');
        if (upload.file.truncated) throw fail('A foto deve ter no máximo 8 MB.', 413);
        reference = await normalizeReferenceImage(bytes, upload.mimetype).catch(() => {
          throw fail('Envie uma foto JPEG, PNG ou WebP válida.');
        });
      } else createAlbumCoverSchema.parse(request.body ?? {});
      const [initial] = await db.select().from(generationJobs).where(eq(generationJobs.id, id));
      if (!initial) throw fail('Trabalho não encontrado.', 404);
      let referenceKey: string | undefined;
      let oldReferenceKey: string | undefined;
      try {
        await db.transaction(async (tx) => {
          const [order] = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, initial.orderId))
            .for('update');
          if (!order) throw fail('Pedido não encontrado.', 404);
          const [job] = await tx
            .select()
            .from(generationJobs)
            .where(eq(generationJobs.id, id))
            .for('update');
          if (!job) throw fail('Trabalho não encontrado.', 404);
          const context = await recoveryContext(order, tx);
          const capability = jobRecovery(job, context);
          if (!capability.canRetry)
            throw fail(capability.retryBlockedReason ?? 'Trabalho indisponível.', 409);
          if (reference && job.type !== 'generate_cover')
            throw fail('Este trabalho não aceita foto.', 400);
          if (job.type === 'generate_cover') {
            const cover = context.covers.find(
              (item) => item.attempt === coverAttempt(job.payload),
            )!;
            if (capability.requiresReference && !reference)
              throw fail(
                'A referência original foi removida. Envie uma nova foto com consentimento.',
                409,
              );
            let assetId = cover.referenceFileId;
            if (reference) {
              referenceKey = `orders/${order.publicId}/references/${nanoid(24)}.jpg`;
              await storage.put(referenceKey, reference, 'image/jpeg');
              const [asset] = await tx
                .insert(storedFiles)
                .values({
                  orderId: order.id,
                  storageKey: referenceKey,
                  mimeType: 'image/jpeg',
                  sizeBytes: reference.length,
                })
                .returning({ id: storedFiles.id });
              assetId = asset!.id;
              await tx.insert(orderConsents).values({
                orderId: order.id,
                kind: 'reference_image',
                policyVersion: policyVersion!,
                accepted: true,
                coverId: cover.id,
              });
              if (cover.referenceFileId) {
                const [old] = await tx
                  .select({ key: storedFiles.storageKey })
                  .from(storedFiles)
                  .where(eq(storedFiles.id, cover.referenceFileId));
                oldReferenceKey = old?.key;
              }
            }
            await tx
              .update(albumCovers)
              .set({
                status: 'pending',
                referenceFileId: assetId,
                hadReference: cover.hadReference || Boolean(reference),
                lastError: null,
                updatedAt: new Date(),
              })
              .where(eq(albumCovers.id, cover.id));
            if (reference && cover.referenceFileId)
              await tx.delete(storedFiles).where(eq(storedFiles.id, cover.referenceFileId));
          }
          const type = job.type;
          await tx
            .update(generationJobs)
            .set({
              status: 'pending',
              leaseToken: null,
              leaseExpiresAt: null,
              maxAttempts: sql`greatest(${generationJobs.maxAttempts}, ${generationJobs.attempts} + 1)`,
              runAt: new Date(),
              lockedAt: null,
              lockedBy: null,
              lastError: null,
              updatedAt: new Date(),
            })
            .where(eq(generationJobs.id, id));
          if (type === 'generate_lyrics' && order.status !== 'lyrics_generating') {
            assertTransition(order.status, 'lyrics_generating');
            await tx
              .update(orders)
              .set({ status: 'lyrics_generating', updatedAt: new Date() })
              .where(eq(orders.id, order.id));
          }
          await tx.insert(adminNotes).values({
            orderId: order.id,
            adminUserId: session.userId,
            message: `Retomada solicitada: ${type === 'generate_cover' ? 'capa' : type === 'deliver_notify' ? 'aviso de entrega' : type === 'generate_lyrics' ? 'letra' : 'áudios faltantes'}. Diagnóstico anterior: ${publicFailure(job.lastError) ?? 'Falha sem diagnóstico disponível.'}`,
          });
        });
      } catch (error) {
        if (referenceKey) await storage.delete(referenceKey).catch(() => undefined);
        throw error;
      }
      if (oldReferenceKey) await storage.delete(oldReferenceKey).catch(() => undefined);
      return { queued: true };
    },
  );

  app.post('/api/v1/admin/orders/:id/email/retry', async (request) => {
    const session = await requireAdmin(request);
    createAlbumCoverSchema.parse(request.body ?? {});
    const id = (request.params as { id: string }).id;
    return db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
      if (!order) throw fail('Pedido não encontrado.', 404);
      const context = await recoveryContext(order, tx);
      if (context.deliveryBlocked || order.status !== 'delivered' || !context.audioReady)
        throw fail(recoveryFor(context).email.reason ?? 'Entrega indisponível.', 409);
      if (context.emailSent) return { queued: false, alreadySent: true };
      const capability = recoveryFor(context).email;
      if (!capability.canRetry) throw fail(capability.reason ?? 'Aviso indisponível.', 409);
      const [existing] = await tx
        .select()
        .from(generationJobs)
        .where(and(eq(generationJobs.orderId, id), eq(generationJobs.type, 'deliver_notify')))
        .orderBy(desc(generationJobs.createdAt))
        .limit(1)
        .for('update');
      if (existing)
        await tx
          .update(generationJobs)
          .set({
            status: 'pending',
            leaseToken: null,
            leaseExpiresAt: null,
            maxAttempts: sql`greatest(${generationJobs.maxAttempts}, ${generationJobs.attempts} + 1)`,
            runAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(generationJobs.id, existing.id));
      else
        await tx.insert(generationJobs).values({
          orderId: id,
          type: 'deliver_notify',
          payload: {},
          idempotencyKey: `notification:${id}:${order.currentProductionId}`,
          maxAttempts: 1,
        });
      await tx.insert(adminNotes).values({
        orderId: id,
        adminUserId: session.userId,
        message: `Retomada do aviso de entrega solicitada. ${publicFailure(existing?.lastError ?? null) ?? 'A mensagem existente será reutilizada.'}`,
      });
      return { queued: true };
    });
  });
};
