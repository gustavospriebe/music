import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { adminLoginSchema } from '@resenha/contracts';
import { adminSessions, adminUsers } from '@resenha/database';
import { createAccessToken, hashToken, verifyToken } from '@resenha/domain';
import type { HttpContext } from './context.js';

export const registerAdminSessionRoutes = (app: FastifyInstance, ctx: HttpContext) => {
  const { env, db, fail } = ctx;

  app.post(
    '/api/v1/admin/session',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const body = adminLoginSchema.parse(request.body);
      const email = body.email.trim().toLowerCase();
      if (
        email !== env.ADMIN_EMAIL.toLowerCase() ||
        !verifyToken(
          body.password,
          hashToken(env.ADMIN_PASSWORD, env.COOKIE_SECRET),
          env.COOKIE_SECRET,
        )
      )
        throw fail('Credenciais inválidas.', 401);
      const [user] = await db
        .insert(adminUsers)
        .values({ email })
        .onConflictDoUpdate({ target: adminUsers.email, set: { updatedAt: sql`now()` } })
        .returning();
      if (!user) throw fail('Não foi possível iniciar a sessão.', 500);
      const token = createAccessToken();
      const expiresAt = new Date(Date.now() + env.ADMIN_SESSION_TTL * 1000);
      await db.insert(adminSessions).values({
        userId: user.id,
        tokenHash: hashToken(token, env.CUSTOMER_ACCESS_TOKEN_PEPPER),
        expiresAt,
      });
      reply.setCookie('admin_session', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        path: '/',
        expires: expiresAt,
      });
      return { authenticated: true, expiresAt };
    },
  );

  app.delete('/api/v1/admin/session', async (request, reply) => {
    const token = request.cookies.admin_session;
    if (token)
      await db
        .delete(adminSessions)
        .where(eq(adminSessions.tokenHash, hashToken(token, env.CUSTOMER_ACCESS_TOKEN_PEPPER)));
    reply.clearCookie('admin_session', { path: '/' });
    return reply.status(204).send();
  });
};
