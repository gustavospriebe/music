import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { adminNotes, storedFiles } from '@resenha/database';
import { sendPrivateFile } from '../files/download.js';
import type { HttpContext } from './context.js';

export const registerAdminAccessRoutes = (app: FastifyInstance, ctx: HttpContext) => {
  const { db, storage, fail, requireAdmin, revokeOrderAccess } = ctx;

  /** Prévia em streaming do áudio para a revisão administrativa. */
  app.get('/api/v1/admin/orders/:id/assets/:assetId/stream', async (request, reply) => {
    await requireAdmin(request);
    const { id, assetId } = request.params as { id: string; assetId: string };
    const [asset] = await db
      .select()
      .from(storedFiles)
      .where(and(eq(storedFiles.id, assetId), eq(storedFiles.orderId, id)));
    if (!asset) throw fail('Arquivo não encontrado', 404);
    reply.type(asset.mimeType).header('content-disposition', 'inline');
    return sendPrivateFile(request, reply, storage, asset);
  });

  app.post('/api/v1/admin/orders/:id/notes', async (request) => {
    const session = await requireAdmin(request);
    const body = (request.body ?? {}) as { message?: string };
    if (!body.message || body.message.length > 2000) throw fail('Nota inválida.');
    const id = (request.params as { id: string }).id;
    await db
      .insert(adminNotes)
      .values({ orderId: id, adminUserId: session.userId, message: body.message });
    return { created: true };
  });

  app.post('/api/v1/admin/orders/:id/access/rotate', async (request) => {
    const session = await requireAdmin(request);
    return {
      accessToken: await revokeOrderAccess(
        (request.params as { id: string }).id,
        true,
        session.userId,
      ),
    };
  });

  app.post('/api/v1/admin/orders/:id/access/revoke', async (request) => {
    const session = await requireAdmin(request);
    await revokeOrderAccess((request.params as { id: string }).id, false, session.userId);
    return { revoked: true };
  });
};
