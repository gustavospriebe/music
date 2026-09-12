import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { beaconEventSchema } from '@resenha/contracts';
import { analyticsEvents, products } from '@resenha/database';
import { sanitizeAiError } from '@resenha/domain';
import { publicConfiguration } from '../configuration.js';
import type { HttpContext } from './context.js';

export const registerPublicRoutes = (app: FastifyInstance, ctx: HttpContext) => {
  const { env, db } = ctx;
  app.get('/api/v1/health/live', async () => ({ status: 'ok' }));
  app.get('/api/v1/health/ready', async () => {
    await db.execute(sql`select 1`);
    return { status: 'ok' };
  });
  app.get('/api/v1/configuration', async () => publicConfiguration(env));
  app.get('/api/v1/products', async () =>
    db
      .select({
        type: products.type,
        name: products.name,
        priceCents: products.priceCents,
        active: products.active,
      })
      .from(products)
      .where(eq(products.active, true)),
  );
  /** Beacons públicos de funil (whitelist, sem payload de história/PII); best-effort. */
  app.post(
    '/api/v1/analytics/beacon',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const input = beaconEventSchema.parse(request.body);
      try {
        await db.insert(analyticsEvents).values({
          event: input.event,
          productType: input.productType ?? null,
          orderPublicId: null,
          visitorId: input.visitorId,
          utm: null,
        });
      } catch (error) {
        app.log.warn({ error: sanitizeAiError(error) }, 'analytics beacon dropped');
      }
      return { received: true };
    },
  );
};
