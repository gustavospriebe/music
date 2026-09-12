import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { nanoid } from 'nanoid';
import { ZodError } from 'zod';
import { createDb } from '@resenha/database';
import { createStorage, readStorageConfig, type LyricsProvider } from '@resenha/providers';
import type { Env } from './env.js';
import { httpLogContext, PublicHttpError, requestLogController } from './http.js';
import { MAX_REFERENCE_IMAGE_BYTES } from './providers.js';
import { createPaymentProvider, type PaymentProvider } from './payment.js';
import { createHttpContext } from './routes/context.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerOrderRoutes } from './routes/orders.js';
import { registerPaymentRoutes } from './routes/payment.js';
import { registerPublicRoutes } from './routes/public.js';
import { registerWebhookRoutes } from './routes/webhook.js';

export {
  httpLogContext,
  nextUtcDate,
  requestLogController,
  spDayStartUtc,
  tzOffsetMs,
} from './http.js';

export const buildApp = async (
  env: Env,
  overrides: { lyrics?: LyricsProvider; payment?: PaymentProvider } = {},
) => {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    logController: requestLogController,
    genReqId: () => nanoid(12),
    bodyLimit: 100_000,
  });
  /** URLs concretas carregam tokens de capability e UUIDs: loga só o template da rota. */
  app.addHook('onResponse', (request, reply, done) => {
    request.log.info(
      httpLogContext(
        request.routeOptions.url ?? '<unmatched>',
        reply.statusCode,
        reply.elapsedTime,
      ),
      'request completed',
    );
    done();
  });
  const { db, pool } = createDb(env.DATABASE_URL);
  const storage = createStorage(readStorageConfig(env));
  const paymentProvider = overrides.payment ?? createPaymentProvider(env);
  /** POSTs sem corpo (ex.: gerar letra, aprovar) são válidos; JSON inválido segue 400. */
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    request.rawBody = body as Buffer;
    const text = (body as Buffer).toString('utf8').trim();
    if (!text) return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      done(new PublicHttpError('JSON inválido.', 400), undefined);
    }
  });
  app.addHook('onClose', async () => pool.end());
  void app.register(cookie, { secret: env.COOKIE_SECRET });
  void app.register(cors, { origin: env.WEB_URL, credentials: true });
  void app.register(helmet, {
    contentSecurityPolicy: false,
    referrerPolicy: { policy: 'same-origin' },
  });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  await app.register(multipart, {
    limits: { files: 1, fileSize: MAX_REFERENCE_IMAGE_BYTES, fields: 2 },
  });
  void app.register(swagger, {
    openapi: {
      info: { title: 'Música da Resenha API', version: '1.0.0' },
      servers: [{ url: '/api/v1' }],
    },
  });
  void app.register(swaggerUi, { routePrefix: '/documentation' });
  app.setErrorHandler((error, request, reply) => {
    const invalid = error instanceof ZodError;
    const candidate = (error as { statusCode?: number }).statusCode;
    const statusCode = invalid
      ? 400
      : candidate && candidate >= 400 && candidate <= 599
        ? candidate
        : 500;
    const fields = invalid
      ? [...new Set(error.issues.map((issue) => issue.path.join('.')))].filter(Boolean).slice(0, 6)
      : [];
    return reply.status(statusCode).send({
      error: {
        code: invalid ? 'VALIDATION_FAILED' : 'REQUEST_FAILED',
        message: invalid
          ? `Revise os campos informados.${fields.length ? ` (${fields.join(', ')})` : ''}`
          : error instanceof PublicHttpError
            ? error.message
            : statusCode >= 500
              ? 'Não foi possível concluir a solicitação. Tente novamente.'
              : 'Solicitação inválida ou não permitida.',
        requestId: request.id,
      },
    });
  });
  const ctx = createHttpContext({
    app,
    env,
    db,
    pool,
    storage,
    paymentProvider,
    overrides,
  });
  registerPublicRoutes(app, ctx);
  registerOrderRoutes(app, ctx);
  registerPaymentRoutes(app, ctx);
  registerWebhookRoutes(app, ctx);
  registerAdminRoutes(app, ctx);
  return app;
};
