import Fastify, { LogController } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ZodError } from 'zod';
import {
  adminOrdersQuerySchema,
  approveLyricsSchema,
  createAlbumCoverSchema,
  beaconEventSchema,
  createOrderSchema,
  deliveryAccessSchema,
  generatedLyricsSchema,
  storySchema,
  type GeneratedLyrics,
} from '@resenha/contracts';
import {
  adminNotes,
  albumCovers,
  adminSessions,
  adminUsers,
  aiUsage,
  analyticsEvents,
  audioGenerations,
  createDb,
  deliveries,
  generationJobs,
  lyricsVersions,
  orders,
  paymentWebhookEvents,
  payments,
  products,
  revisionRequests,
  storedAssets,
  storySubmissions,
} from '@resenha/database';
import {
  assertTransition,
  createAccessToken,
  evaluateContent,
  hashToken,
  sanitizeAiError,
  validateLyrics,
  verifyToken,
  type AiUsageSample,
  type AiUsageStatus,
} from '@resenha/domain';
import { createStorage, readStorageConfig } from '@resenha/providers';
import type { Env } from './env.js';
import {
  createAbacatePayProvider,
  createLyricsProvider,
  MAX_REFERENCE_IMAGE_BYTES,
  normalizeReferenceImage,
  verifyAbacatePaySecret,
  type LyricsProvider,
  type LyricsResult,
} from './providers.js';
/** Saldo da key OpenRouter (`GET /key` documentado, gratuito); falha best-effort vira `null`. */
export const fetchOpenRouterKeyUsage = async (
  apiKey: string | undefined,
): Promise<{ usage: number; limit: number | null; remaining: number | null } | null> => {
  if (!apiKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/key', {
      signal: controller.signal,
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      data?: { usage?: number; limit?: number | null; limit_remaining?: number | null };
    };
    if (typeof body.data?.usage !== 'number') return null;
    return {
      usage: body.data.usage,
      limit: typeof body.data.limit === 'number' ? body.data.limit : null,
      remaining: typeof body.data.limit_remaining === 'number' ? body.data.limit_remaining : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const ADMIN_TZ = 'America/Sao_Paulo';
/** Offset (ms) de `ADMIN_TZ` num instante UTC, via Intl (vale para DST histórico). */
export const tzOffsetMs = (timeZone: string, utcMs: number): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = get('hour') === 24 ? 0 : get('hour');
  return (
    Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second')) - utcMs
  );
};
/** Meia-noite de `date` (YYYY-MM-DD) em `ADMIN_TZ`, devolvida como ISO UTC. */
export const spDayStartUtc = (date: string): string => {
  const midnightGuess = Date.parse(`${date}T00:00:00.000Z`);
  let start = midnightGuess - tzOffsetMs(ADMIN_TZ, midnightGuess);
  start = midnightGuess - tzOffsetMs(ADMIN_TZ, start);
  return new Date(start).toISOString();
};
/** Dia corrido seguinte (para o limite exclusivo do `to`). */
export const nextUtcDate = (date: string): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);

export const httpLogContext = (route: string, statusCode: number, elapsedTime: number) => ({
  route,
  statusCode,
  latencyMs: Math.round(elapsedTime),
});

export const requestLogController = new LogController({ disableRequestLogging: true });

export const buildApp = async (env: Env, overrides: { lyrics?: LyricsProvider } = {}) => {
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
  const lyrics = overrides.lyrics ?? createLyricsProvider(env);
  const storage = createStorage(readStorageConfig(env));
  const abacatePay = createAbacatePayProvider(env);
  /** POSTs sem corpo (ex.: gerar letra, aprovar) são válidos; JSON inválido segue 400. */
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    const text = (body as string).trim();
    if (!text) return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch (error) {
      (error as { statusCode?: number }).statusCode = 400;
      done(error as Error, undefined);
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
  const fail = (message: string, statusCode = 400) =>
    Object.assign(new Error(message), { statusCode });
  const orderFor = async (publicId: string) => {
    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    if (!order) throw fail('Pedido não encontrado', 404);
    return order;
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
  /** Uma linha por chamada ao provedor, inclusive tentativas rejeitadas (cobradas igual). */
  const recordLyricsUsage = async (
    orderId: string,
    usage: AiUsageSample,
    status: AiUsageStatus,
    error: string | null,
    attempt: number,
  ): Promise<void> => {
    await db
      .insert(aiUsage)
      .values({
        orderId,
        jobId: null,
        kind: 'lyrics',
        provider: 'openrouter',
        model: usage.model,
        externalId: usage.requestId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
        latencyMs: usage.latencyMs,
        status,
        error,
        attempt,
      })
      .onConflictDoNothing();
  };
  const setAccessCookie = (reply: FastifyReply, kind: 'order' | 'order_view', publicId: string) =>
    reply.setCookie(`${kind}_${publicId}`, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
      signed: true,
    });
  const hasSignedAccess = (
    kind: 'order' | 'order_view',
    publicId: string,
    request: FastifyRequest,
  ) => {
    const value = request.cookies[`${kind}_${publicId}`];
    if (!value) return false;
    const unsigned = request.unsignCookie(value);
    return unsigned.valid && unsigned.value === '1';
  };
  const hasAccess = (publicId: string, request: FastifyRequest) =>
    hasSignedAccess('order', publicId, request);
  /**
   * Sessão limitada de recovery (link de entrega compartilhável): só leitura do
   * status/letra/áudio, sem `story` (PII) e sem mutações. Mutações exigem `hasAccess`.
   */
  const hasViewAccess = (publicId: string, request: FastifyRequest) =>
    hasAccess(publicId, request) || hasSignedAccess('order_view', publicId, request);
  const coverAvailable = Boolean(
    env.OPENROUTER_API_KEY &&
    env.OPENROUTER_COVER_TEXT_MODEL &&
    env.OPENROUTER_COVER_REFERENCE_MODEL,
  );
  type CoverRow = {
    status: string;
    attempt: number;
    referenceAssetId: string | null;
    hadReference: boolean;
    coverAssetId: string | null;
    createdAt: Date;
  };
  const publicCover = (row: CoverRow, canMutate: boolean) => ({
    status: row.status,
    attempt: row.attempt,
    canRegenerate: canMutate && row.status === 'completed' && row.attempt === 1,
    hasReference: row.hadReference,
    createdAt: row.createdAt.toISOString(),
    ...(row.status === 'completed' && row.coverAssetId
      ? { downloadUrl: '/api/v1/cover/download' }
      : {}),
  });
  const latestCover = async (orderId: string): Promise<CoverRow | undefined> => {
    const [cover] = await db
      .select({
        status: albumCovers.status,
        attempt: albumCovers.attempt,
        referenceAssetId: albumCovers.referenceAssetId,
        hadReference: albumCovers.hadReference,
        coverAssetId: albumCovers.coverAssetId,
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
  app.setErrorHandler((error, request, reply) => {
    const invalid = error instanceof ZodError;
    const statusCode = invalid ? 400 : ((error as { statusCode?: number }).statusCode ?? 500);
    const fields = invalid
      ? [...new Set(error.issues.map((issue) => issue.path.join('.')))].filter(Boolean).slice(0, 6)
      : [];
    return reply.status(statusCode).send({
      error: {
        code: invalid ? 'VALIDATION_FAILED' : 'REQUEST_FAILED',
        message: invalid
          ? `Revise os campos informados.${fields.length ? ` (${fields.join(', ')})` : ''}`
          : error instanceof Error
            ? error.message
            : 'Erro inesperado',
        requestId: request.id,
      },
    });
  });
  app.get('/api/v1/health/live', async () => ({ status: 'ok' }));
  app.get('/api/v1/health/ready', async () => {
    await db.execute(sql`select 1`);
    return { status: 'ok' };
  });
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
  app.post('/api/v1/orders', async (request, reply) => {
    const input = createOrderSchema.parse(request.body);
    const creationKeyHash = hashToken(input.creationKey, env.CUSTOMER_ACCESS_TOKEN_PEPPER);
    const [existing] = await db
      .select()
      .from(orders)
      .where(eq(orders.creationKeyHash, creationKeyHash));
    if (existing) {
      setAccessCookie(reply, 'order', existing.publicId);
      return reply.status(201).send({ publicId: existing.publicId });
    }
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.type, input.productType), eq(products.active, true)));
    if (!product) throw fail('Produto indisponível.', 404);
    const token = createAccessToken();
    const [order] = await db
      .insert(orders)
      .values({
        publicId: nanoid(16),
        productType: input.productType,
        priceCents: product.priceCents,
        accessTokenHash: hashToken(token, env.CUSTOMER_ACCESS_TOKEN_PEPPER),
        creationKeyHash,
      })
      .onConflictDoNothing({ target: orders.creationKeyHash })
      .returning();
    const created = Boolean(order);
    const resolved =
      order ??
      (await db.select().from(orders).where(eq(orders.creationKeyHash, creationKeyHash)))[0];
    if (!resolved) throw fail('Não foi possível criar o pedido.', 503);
    setAccessCookie(reply, 'order', resolved.publicId);
    if (created) await recordEvent('order_created', resolved, input.visitorId);
    return reply.status(201).send({ publicId: resolved.publicId });
  });
  app.patch('/api/v1/orders/:publicId/story', async (request) => {
    const storyPublicId = (request.params as { publicId: string }).publicId;
    if (!hasAccess(storyPublicId, request)) throw fail('Acesso privado necessário', 401);
    const order = await orderFor(storyPublicId);
    if (!['draft', 'story_completed'].includes(order.status))
      throw fail('O formulário não pode mais ser alterado.');
    const story = storySchema.parse(request.body);
    if (story.productType !== order.productType) throw fail('Tipo de produto inválido.');
    const content = evaluateContent(JSON.stringify(story));
    if (!content.allowed) throw fail(content.reason);
    const isFirstSave = order.status === 'draft';
    await db.transaction(async (tx) => {
      await tx
        .insert(storySubmissions)
        .values({ orderId: order.id, data: story })
        .onConflictDoUpdate({
          target: storySubmissions.orderId,
          set: { data: story, updatedAt: new Date() },
        });
      if (isFirstSave) {
        assertTransition('draft', 'story_completed');
        await tx
          .update(orders)
          .set({ status: 'story_completed', updatedAt: new Date() })
          .where(eq(orders.id, order.id));
      }
    });
    if (isFirstSave) await recordEvent('story_saved', order);
    return { saved: true };
  });
  app.post(
    '/api/v1/orders/:publicId/lyrics/generate',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request) => {
      const generatePublicId = (request.params as { publicId: string }).publicId;
      if (!hasAccess(generatePublicId, request)) throw fail('Acesso privado necessário', 401);
      const order = await orderFor(generatePublicId);
      if (order.status === 'draft') throw fail('Preencha o formulário antes de gerar a letra.');
      if (
        !['story_completed', 'lyrics_ready', 'failed', 'lyrics_generating'].includes(order.status)
      )
        throw fail('Este pedido não aceita mais geração de letra.');
      const [submission] = await db
        .select()
        .from(storySubmissions)
        .where(eq(storySubmissions.orderId, order.id));
      if (!submission) throw fail('Formulário ausente');
      const story = storySchema.parse(submission.data);
      const [generated] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(lyricsVersions)
        .where(and(eq(lyricsVersions.orderId, order.id), eq(lyricsVersions.kind, 'generated')));
      if (generated && generated.count >= 4)
        throw fail('O limite de três novas gerações foi atingido.');
      const claimStartedAt = new Date();
      const staleBefore = new Date(claimStartedAt.getTime() - 5 * 60 * 1_000);
      if (order.status !== 'lyrics_generating') assertTransition(order.status, 'lyrics_generating');
      const [claim] = await db
        .update(orders)
        .set({ status: 'lyrics_generating', updatedAt: claimStartedAt })
        .where(
          and(
            eq(orders.id, order.id),
            eq(orders.status, order.status),
            ...(order.status === 'lyrics_generating' ? [lte(orders.updatedAt, staleBefore)] : []),
          ),
        )
        .returning({ updatedAt: orders.updatedAt });
      if (!claim)
        throw fail('A letra já está sendo criada. Aguarde a conclusão desta tentativa.', 409);
      try {
        let feedback: string | undefined;
        let content: GeneratedLyrics | undefined;
        let errors: string[] = [];
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          let result: LyricsResult;
          const startedAt = Date.now();
          try {
            result = await lyrics.generate(story, feedback);
          } catch (error) {
            await recordLyricsUsage(
              order.id,
              {
                requestId: null,
                model: env.OPENROUTER_TEXT_MODEL ?? 'unknown',
                inputTokens: 0,
                outputTokens: 0,
                costUsd: null,
                latencyMs: Date.now() - startedAt,
              },
              'error',
              sanitizeAiError(error),
              attempt,
            );
            throw error;
          }
          errors = validateLyrics(result.lyrics, story);
          if (!errors.length) {
            await recordLyricsUsage(order.id, result.usage, 'ok', null, attempt);
            content = result.lyrics;
            break;
          }
          feedback = errors.join(' ');
          await recordLyricsUsage(
            order.id,
            result.usage,
            'rejected',
            `Letra reprovada na validação: ${feedback}`.slice(0, 500),
            attempt,
          );
          content = undefined;
        }
        if (!content) throw fail(`${errors.join(' ')} Tente novamente.`);
        const version = await db.transaction(async (tx) => {
          assertTransition('lyrics_generating', 'lyrics_ready');
          const [transitioned] = await tx
            .update(orders)
            .set({ status: 'lyrics_ready', updatedAt: new Date() })
            .where(
              and(
                eq(orders.id, order.id),
                eq(orders.status, 'lyrics_generating'),
                eq(orders.updatedAt, claim.updatedAt),
              ),
            )
            .returning({ id: orders.id });
          if (!transitioned) throw fail('Esta tentativa de geração expirou.', 409);
          const [countRow = { count: 0 }] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(lyricsVersions)
            .where(eq(lyricsVersions.orderId, order.id));
          const [inserted] = await tx
            .insert(lyricsVersions)
            .values({ orderId: order.id, number: countRow.count + 1, kind: 'generated', content })
            .returning({ number: lyricsVersions.number, kind: lyricsVersions.kind });
          return inserted;
        });
        await recordEvent('lyrics_generated', order);
        return version;
      } catch (error) {
        assertTransition('lyrics_generating', 'failed');
        await db
          .update(orders)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(
            and(
              eq(orders.id, order.id),
              eq(orders.status, 'lyrics_generating'),
              eq(orders.updatedAt, claim.updatedAt),
            ),
          );
        if ((error as { statusCode?: number }).statusCode) throw error;
        throw fail('Não foi possível gerar a letra agora. Tente novamente.', 500);
      }
    },
  );
  app.patch('/api/v1/orders/:publicId/lyrics/:versionNumber', async (request) => {
    const editPublicId = (request.params as { publicId: string }).publicId;
    if (!hasAccess(editPublicId, request)) throw fail('Acesso privado necessário', 401);
    const order = await orderFor(editPublicId);
    if (order.status !== 'lyrics_ready') throw fail('A letra está bloqueada.');
    const versionNumber = Number((request.params as { versionNumber: string }).versionNumber);
    if (!Number.isInteger(versionNumber) || versionNumber < 1) throw fail('Versão inválida.', 404);
    const [base] = await db
      .select({ number: lyricsVersions.number })
      .from(lyricsVersions)
      .where(and(eq(lyricsVersions.orderId, order.id), eq(lyricsVersions.number, versionNumber)));
    if (!base) throw fail('Versão não encontrada.', 404);
    const content = generatedLyricsSchema.parse(request.body);
    const [countRow = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lyricsVersions)
      .where(eq(lyricsVersions.orderId, order.id));
    const [version] = await db
      .insert(lyricsVersions)
      .values({ orderId: order.id, number: countRow.count + 1, kind: 'edited', content })
      .returning({ number: lyricsVersions.number, kind: lyricsVersions.kind });
    return version;
  });
  app.post('/api/v1/orders/:publicId/lyrics/:versionNumber/approve', async (request) => {
    const approvePublicId = (request.params as { publicId: string }).publicId;
    if (!hasAccess(approvePublicId, request)) throw fail('Acesso privado necessário', 401);
    const order = await orderFor(approvePublicId);
    if (order.status !== 'lyrics_ready') throw fail('A letra não está disponível.');
    const versionNumber = Number((request.params as { versionNumber: string }).versionNumber);
    if (!Number.isInteger(versionNumber) || versionNumber < 1) throw fail('Versão inválida.', 404);
    const [version] = await db
      .select({ content: lyricsVersions.content })
      .from(lyricsVersions)
      .where(and(eq(lyricsVersions.orderId, order.id), eq(lyricsVersions.number, versionNumber)));
    if (!version) throw fail('Versão não encontrada.', 404);
    const { content } = approveLyricsSchema.parse(request.body ?? {});
    await db.transaction(async (tx) => {
      const [countRow = { count: 0 }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(lyricsVersions)
        .where(eq(lyricsVersions.orderId, order.id));
      await tx.insert(lyricsVersions).values({
        orderId: order.id,
        number: countRow.count + 1,
        kind: 'approved',
        content: content ?? version.content,
        approvedAt: new Date(),
      });
      assertTransition(order.status, 'lyrics_approved');
      await tx
        .update(orders)
        .set({ status: 'lyrics_approved', updatedAt: new Date() })
        .where(eq(orders.id, order.id));
    });
    await recordEvent('lyrics_approved', order);
    return { approved: true };
  });
  const insertPendingPayment = async (
    order: typeof orders.$inferSelect,
    input: { provider: string; checkoutUrl: string },
  ) => {
    await db.transaction(async (tx) => {
      if (order.status === 'lyrics_approved') {
        assertTransition('lyrics_approved', 'payment_pending');
        await tx
          .update(orders)
          .set({ status: 'payment_pending', updatedAt: new Date() })
          .where(eq(orders.id, order.id));
      }
      await tx.insert(payments).values({
        orderId: order.id,
        provider: input.provider,
        status: 'pending',
        amountCents: order.priceCents,
        checkoutUrl: input.checkoutUrl,
      });
    });
  };
  app.post('/api/v1/orders/:publicId/checkout', async (request) => {
    const checkoutPublicId = (request.params as { publicId: string }).publicId;
    if (!hasAccess(checkoutPublicId, request)) throw fail('Acesso privado necessário', 401);
    const order = await orderFor(checkoutPublicId);
    if (!['lyrics_approved', 'payment_pending'].includes(order.status))
      throw fail('Aprove a letra antes do pagamento.');
    const [existing] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, order.id), eq(payments.status, 'pending')));
    if (existing?.provider === 'dev')
      return { checkoutUrl: `${env.WEB_URL}/pedido/${order.publicId}`, dev: true as const };
    if (existing?.checkoutUrl) return { checkoutUrl: existing.checkoutUrl };
    if (!env.ABACATEPAY_API_KEY) {
      if (env.NODE_ENV === 'production') throw fail('Provider de pagamento não configurado.', 501);
      await db.transaction(async (tx) => {
        if (order.status === 'lyrics_approved') {
          assertTransition('lyrics_approved', 'payment_pending');
          await tx
            .update(orders)
            .set({ status: 'payment_pending', updatedAt: new Date() })
            .where(eq(orders.id, order.id));
        }
        await tx.insert(payments).values({
          orderId: order.id,
          provider: 'dev',
          status: 'pending',
          amountCents: order.priceCents,
          checkoutUrl: `${env.WEB_URL}/pedido/${order.publicId}`,
        });
      });
      await recordEvent('checkout_started', order);
      return {
        checkoutUrl: `${env.WEB_URL}/pedido/${order.publicId}`,
        dev: true,
      };
    }
    if (env.PAYMENT_PROVIDER === 'abacatepay') {
      const checkout = await abacatePay.createCheckout({
        priceCents: order.priceCents,
        externalReference: order.publicId,
        backUrl: `${env.WEB_URL}/pedido/${order.publicId}`,
      });
      await insertPendingPayment(order, {
        provider: 'abacate-pay',
        checkoutUrl: checkout.initPoint,
      });
      await recordEvent('checkout_started', order);
      return { checkoutUrl: checkout.initPoint };
    }
    throw fail('Provider de pagamento não configurado.', 501);
  });
  /** Marca o pagamento aprovado e enfileira o áudio uma única vez; devolve se acabou de pagar. */
  const settleApprovedPayment = async (
    order: typeof orders.$inferSelect,
    payment: typeof payments.$inferSelect,
    externalPaymentId: string,
  ): Promise<boolean> => {
    let justPaid = false;
    await db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({ status: 'approved', externalPaymentId, updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
      const [freshOrder] = await tx.select().from(orders).where(eq(orders.id, order.id));
      if (freshOrder?.status === 'payment_pending') {
        assertTransition('payment_pending', 'paid');
        assertTransition('paid', 'audio_queued');
        await tx
          .update(orders)
          .set({ status: 'audio_queued', updatedAt: new Date() })
          .where(eq(orders.id, order.id));
        await tx
          .insert(generationJobs)
          .values({
            type: 'generate_audio',
            orderId: order.id,
            payload: {},
            idempotencyKey: `audio:${order.id}`,
            maxAttempts: 6,
          })
          .onConflictDoNothing();
        justPaid = true;
      }
    });
    return justPaid;
  };
  /**
   * Webhook AbacatePay (`POST /api/v1/webhooks/abacate-pay?webhookSecret=...`).
   * Autentica pelo secret da URL, busca o billing na API e confere valor/referência.
   * Eventos: `checkout.completed` paga; `EXPIRED`/`CANCELLED` rejeitam; resto ignora.
   */
  app.post('/api/v1/webhooks/abacate-pay', async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    if (
      !verifyAbacatePaySecret({
        received: query.webhookSecret,
        expected: env.ABACATEPAY_WEBHOOK_SECRET,
      })
    )
      throw fail('Secret do webhook inválido.', 401);
    const body = (request.body ?? {}) as {
      id?: string;
      event?: string;
      data?: { id?: string };
    };
    const event = body.event ?? '';
    const billingId = body.data?.id ?? '';
    if (!billingId || !['checkout.completed', 'checkout.refunded'].includes(event))
      return reply.status(200).send({ ignored: true });
    const [webhookEvent] = await db
      .insert(paymentWebhookEvents)
      .values({
        provider: 'abacate-pay',
        externalEventId: `${billingId}:${event}`.slice(0, 160),
        payload: { action: event, billingId },
      })
      .onConflictDoNothing()
      .returning();
    if (!webhookEvent) return reply.status(200).send({ duplicate: true });
    try {
      const billing = await abacatePay.getBilling(billingId);
      if (!billing.externalReference) throw new Error('Billing has no externalId.');
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.publicId, billing.externalReference));
      if (!order) throw new Error('Order not found for externalId.');
      const [payment] = await db
        .select()
        .from(payments)
        .where(and(eq(payments.orderId, order.id), eq(payments.status, 'pending')));
      if (!payment) throw new Error('No pending payment for this order.');
      if (event === 'checkout.completed' && billing.status === 'PAID') {
        if (billing.amountCents !== order.priceCents)
          throw new Error('Billing amount does not match the order.');
        const justPaid = await settleApprovedPayment(order, payment, billing.id);
        if (justPaid) await recordEvent('paid', order);
      } else if (['EXPIRED', 'CANCELLED', 'REFUNDED'].includes(billing.status)) {
        await db
          .update(payments)
          .set({ status: 'rejected', externalPaymentId: billing.id, updatedAt: new Date() })
          .where(eq(payments.id, payment.id));
      }
      await db
        .update(paymentWebhookEvents)
        .set({ paymentId: payment.id, processedAt: new Date() })
        .where(eq(paymentWebhookEvents.id, webhookEvent.id));
      return reply.status(200).send({ processed: true });
    } catch (error) {
      await db
        .update(paymentWebhookEvents)
        .set({ error: error instanceof Error ? error.message.slice(0, 500) : 'unknown' })
        .where(eq(paymentWebhookEvents.id, webhookEvent.id));
      throw error;
    }
  });
  /** Somente fora de produção: confirma um pagamento criado em modo dev (sem credencial). */
  app.post('/api/v1/orders/:publicId/dev-payment/approve', async (request) => {
    if (env.NODE_ENV === 'production') throw fail('Indisponível', 404);
    const publicId = (request.params as { publicId: string }).publicId;
    if (!hasAccess(publicId, request)) throw fail('Acesso privado necessário', 401);
    const order = await orderFor(publicId);
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, order.id), eq(payments.provider, 'dev')));
    if (!payment || payment.provider !== 'dev') throw fail('Pagamento não encontrado', 404);
    let devPaid: { publicId: string; productType: typeof orders.$inferSelect.productType } | null =
      null;
    await db.transaction(async (tx) => {
      const [approved] = await tx
        .update(payments)
        .set({
          status: 'approved',
          externalPaymentId: `dev_${payment.id}`,
          updatedAt: new Date(),
        })
        .where(and(eq(payments.id, payment.id), eq(payments.status, 'pending')))
        .returning({ id: payments.id });
      if (!approved) return;
      const [currentOrder] = await tx.select().from(orders).where(eq(orders.id, payment.orderId));
      if (currentOrder?.status === 'payment_pending') {
        assertTransition('payment_pending', 'paid');
        assertTransition('paid', 'audio_queued');
        await tx
          .update(orders)
          .set({ status: 'audio_queued', updatedAt: new Date() })
          .where(eq(orders.id, currentOrder.id));
        await tx
          .insert(generationJobs)
          .values({
            type: 'generate_audio',
            orderId: currentOrder.id,
            payload: {},
            idempotencyKey: `audio:${currentOrder.id}`,
            maxAttempts: 6,
          })
          .onConflictDoNothing();
        devPaid = { publicId: currentOrder.publicId, productType: currentOrder.productType };
      }
    });
    if (devPaid) await recordEvent('paid', devPaid);
    return { approved: true };
  });
  app.post('/api/v1/orders/:publicId/access/exchange', async (request, reply) => {
    const { token } = (request.body ?? {}) as { token?: string };
    const order = await orderFor((request.params as { publicId: string }).publicId);
    if (
      !token ||
      order.accessRevokedAt ||
      !verifyToken(token, order.accessTokenHash, env.CUSTOMER_ACCESS_TOKEN_PEPPER)
    )
      throw fail('Link de acesso inválido', 401);
    setAccessCookie(reply, 'order', order.publicId);
    return { ok: true };
  });
  app.get('/api/v1/orders/:publicId', async (request) => {
    const publicId = (request.params as { publicId: string }).publicId;
    if (!hasViewAccess(publicId, request)) throw fail('Acesso privado necessário', 401);
    const full = hasAccess(publicId, request);
    const order = await orderFor(publicId);
    const [story] = full
      ? await db.select().from(storySubmissions).where(eq(storySubmissions.orderId, order.id))
      : [undefined];
    const versions = await db
      .select()
      .from(lyricsVersions)
      .where(eq(lyricsVersions.orderId, order.id))
      .orderBy(desc(lyricsVersions.number));
    const audio = await db
      .select({ variant: audioGenerations.variant, status: audioGenerations.status })
      .from(audioGenerations)
      .where(eq(audioGenerations.orderId, order.id));
    const publicOrder = {
      publicId: order.publicId,
      productType: order.productType,
      status: order.status,
      priceCents: order.priceCents,
      createdAt: order.createdAt,
    };
    const publicLyrics = versions.map((version) => ({
      number: version.number,
      kind: version.kind,
      approvedAt: version.approvedAt,
      content: version.content,
    }));
    return {
      order: publicOrder,
      story: story?.data,
      lyrics: publicLyrics,
      audio,
      privateAccess: full,
    };
  });
  app.get('/api/v1/orders/:publicId/cover', async (request) => {
    const publicId = (request.params as { publicId: string }).publicId;
    if (!hasViewAccess(publicId, request)) throw fail('Acesso privado necessário', 401);
    const order = await orderFor(publicId);
    const cover = await latestCover(order.id);
    return {
      available: coverAvailable,
      cover: cover
        ? {
            ...publicCover(cover, hasAccess(publicId, request)),
            ...(cover.status === 'completed' && cover.coverAssetId
              ? { downloadUrl: `/api/v1/orders/${publicId}/cover/download` }
              : {}),
          }
        : null,
    };
  });
  app.post(
    '/api/v1/orders/:publicId/cover',
    {
      bodyLimit: MAX_REFERENCE_IMAGE_BYTES + 64 * 1024,
      config: { rateLimit: { max: 8, timeWindow: '1 hour' } },
    },
    async (request, reply) => {
      const publicId = (request.params as { publicId: string }).publicId;
      if (!hasAccess(publicId, request)) throw fail('Acesso privado necessário', 401);
      if (!coverAvailable) throw fail('Geração de capa indisponível neste ambiente.', 503);
      const order = await orderFor(publicId);

      let normalizedReference: Buffer | undefined;
      if (request.isMultipart()) {
        const upload = await request.file().catch(() => {
          throw fail('Não foi possível ler a foto enviada.');
        });
        if (!upload || upload.fieldname !== 'reference')
          throw fail('Envie uma foto de referência válida.');
        const consent = (upload.fields.consent as { value?: unknown } | undefined)?.value;
        if (consent !== 'true')
          throw fail('Confirme que você pode usar as pessoas presentes na foto.');
        const bytes = await upload.toBuffer();
        if (upload.file.truncated) throw fail('A foto deve ter no máximo 8 MB.', 413);
        normalizedReference = await normalizeReferenceImage(bytes, upload.mimetype).catch(
          (error) => {
            throw fail(error instanceof Error ? error.message : 'Foto inválida.');
          },
        );
      } else {
        createAlbumCoverSchema.parse(request.body ?? {});
      }

      const referenceKey = normalizedReference
        ? `orders/${publicId}/references/${nanoid(24)}.jpg`
        : undefined;
      if (referenceKey && normalizedReference)
        await storage.put(referenceKey, normalizedReference, 'image/jpeg');

      const client = await pool.connect();
      let committed = false;
      try {
        await client.query('begin');
        await client.query('select id from orders where id=$1 for update', [order.id]);
        const payment = await client.query(
          "select 1 from payments where order_id=$1 and status='approved' limit 1",
          [order.id],
        );
        if (!payment.rowCount)
          throw fail('A capa fica disponível após a confirmação do pagamento.');
        const previous = await client.query<CoverRow>(
          `select status,attempt,reference_asset_id as "referenceAssetId",had_reference as "hadReference",cover_asset_id as "coverAssetId",created_at as "createdAt"
           from album_covers where order_id=$1 order by attempt desc limit 1`,
          [order.id],
        );
        const latest = previous.rows[0];
        const attempt = latest ? 2 : 1;
        if (latest && !(latest.attempt === 1 && latest.status === 'completed'))
          throw fail(
            latest.attempt >= 2
              ? 'As duas capas incluídas neste pedido já foram usadas.'
              : 'A primeira capa ainda está sendo criada.',
            409,
          );
        let referenceAssetId: string | null = null;
        if (referenceKey && normalizedReference) {
          const asset = await client.query<{ id: string }>(
            `insert into stored_files(order_id,storage_key,mime_type,size_bytes)
             values($1,$2,'image/jpeg',$3) returning id`,
            [order.id, referenceKey, normalizedReference.length],
          );
          referenceAssetId = asset.rows[0]?.id ?? null;
        }
        const model = referenceAssetId
          ? env.OPENROUTER_COVER_REFERENCE_MODEL!
          : env.OPENROUTER_COVER_TEXT_MODEL!;
        const inserted = await client.query<CoverRow>(
          `insert into album_covers(order_id,attempt,status,reference_asset_id,had_reference,model)
           values($1,$2,'pending',$3,$4,$5)
           returning status,attempt,reference_asset_id as "referenceAssetId",had_reference as "hadReference",cover_asset_id as "coverAssetId",created_at as "createdAt"`,
          [order.id, attempt, referenceAssetId, Boolean(referenceAssetId), model],
        );
        await client.query(
          `insert into generation_jobs(type,order_id,payload,idempotency_key,max_attempts)
           values('generate_cover',$1,$2,$3,1) on conflict(idempotency_key) do nothing`,
          [order.id, JSON.stringify({ attempt }), `cover:${order.id}:${attempt}`],
        );
        await client.query('commit');
        committed = true;
        return reply.status(202).send(publicCover(inserted.rows[0]!, true));
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
        if (!committed && referenceKey) await storage.delete(referenceKey).catch(() => undefined);
      }
    },
  );
  app.get('/api/v1/orders/:publicId/cover/download', async (request, reply) => {
    const publicId = (request.params as { publicId: string }).publicId;
    if (!hasViewAccess(publicId, request)) throw fail('Acesso privado necessário', 401);
    const order = await orderFor(publicId);
    const result = await pool.query<{ storage_key: string; mime_type: string }>(
      `select f.storage_key,f.mime_type from album_covers c
       join stored_files f on f.id=c.cover_asset_id
       where c.order_id=$1 and c.status='completed'
       order by c.attempt desc limit 1`,
      [order.id],
    );
    const asset = result.rows[0];
    if (!asset) throw fail('Capa ainda indisponível.', 404);
    const extension =
      asset.mime_type === 'image/png' ? 'png' : asset.mime_type === 'image/webp' ? 'webp' : 'jpg';
    reply
      .type(asset.mime_type)
      .header('content-disposition', `attachment; filename="capa-${publicId}.${extension}"`);
    return storage.get(asset.storage_key);
  });
  app.get('/api/v1/orders/:publicId/assets/:variant/download', async (request, reply) => {
    const { publicId, variant } = request.params as { publicId: string; variant: string };
    if (!hasViewAccess(publicId, request)) throw fail('Acesso privado necessário', 401);
    const order = await orderFor(publicId);
    if (order.status !== 'delivered') throw fail('Entrega indisponível.', 404);
    const variantNumber = Number(variant);
    if (!Number.isInteger(variantNumber) || variantNumber < 1)
      throw fail('Arquivo não encontrado', 404);
    const [generation] = await db
      .select({ assetId: audioGenerations.assetId })
      .from(audioGenerations)
      .where(
        and(
          eq(audioGenerations.orderId, order.id),
          eq(audioGenerations.variant, variantNumber),
          eq(audioGenerations.status, 'completed'),
        ),
      );
    if (!generation?.assetId) throw fail('Arquivo não encontrado', 404);
    const [asset] = await db
      .select()
      .from(storedAssets)
      .where(and(eq(storedAssets.id, generation.assetId), eq(storedAssets.orderId, order.id)));
    if (!asset) throw fail('Arquivo não encontrado', 404);
    reply
      .type(asset.mimeType)
      .header(
        'content-disposition',
        `attachment; filename="musica-${publicId}${asset.storageKey.slice(asset.storageKey.lastIndexOf('.'))}"`,
      );
    return storage.get(asset.storageKey);
  });
  /** Private delivery links use a random opaque token; internal order IDs never leave this boundary. */
  app.get('/api/v1/deliveries/:token', async (request) => {
    const token = (request.params as { token: string }).token;
    const [delivery] = await db
      .select()
      .from(deliveries)
      .where(
        and(
          deliveries.tokenHash
            ? eq(deliveries.tokenHash, hashToken(token, env.CUSTOMER_ACCESS_TOKEN_PEPPER))
            : undefined,
          sql`${deliveries.revokedAt} is null`,
        ),
      );
    if (!delivery || (delivery.expiresAt && delivery.expiresAt <= new Date()))
      throw fail('Link de entrega inválido ou expirado.', 404);
    const [order] = await db.select().from(orders).where(eq(orders.id, delivery.orderId));
    if (!order || order.status !== 'delivered') throw fail('Entrega indisponível.', 404);
    const lyricRows = await db
      .select()
      .from(lyricsVersions)
      .where(
        and(eq(lyricsVersions.orderId, order.id), sql`${lyricsVersions.approvedAt} is not null`),
      );
    const lyrics = lyricRows.map((row) => ({
      number: row.number,
      kind: row.kind,
      content: row.content,
    }));
    const audio = await db
      .select({ variant: audioGenerations.variant })
      .from(audioGenerations)
      .where(and(eq(audioGenerations.orderId, order.id), eq(audioGenerations.status, 'completed')));
    return { publicOrderId: order.publicId, lyrics, audio };
  });
  app.get('/api/v1/deliveries/:token/files/:variant/download', async (request, reply) => {
    const { token, variant } = request.params as { token: string; variant: string };
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
    const variantNumber = Number(variant);
    if (!Number.isInteger(variantNumber) || variantNumber < 1)
      throw fail('Arquivo não encontrado', 404);
    const [generation] = await db
      .select({ assetId: audioGenerations.assetId })
      .from(audioGenerations)
      .where(
        and(
          eq(audioGenerations.orderId, delivery.orderId),
          eq(audioGenerations.variant, variantNumber),
          eq(audioGenerations.status, 'completed'),
        ),
      );
    if (!generation?.assetId) throw fail('Arquivo não encontrado', 404);
    const [asset] = await db
      .select()
      .from(storedAssets)
      .where(
        and(eq(storedAssets.id, generation.assetId), eq(storedAssets.orderId, delivery.orderId)),
      );
    if (!asset) throw fail('Arquivo não encontrado', 404);
    reply
      .type(asset.mimeType)
      .header(
        'content-disposition',
        `attachment; filename="musica-da-resenha${asset.storageKey.slice(asset.storageKey.lastIndexOf('.'))}"`,
      );
    return storage.get(asset.storageKey);
  });
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
    if (!order || order.status !== 'delivered') throw fail('Entrega indisponível.', 404);
    return order;
  };
  app.get('/api/v1/deliveries/:token/cover', async (request) => {
    const token = (request.params as { token: string }).token;
    const order = await deliveredOrderFor(token);
    const cover = await latestCover(order.id);
    return {
      available: coverAvailable,
      cover: cover
        ? {
            ...publicCover(cover, false),
            ...(cover.status === 'completed' && cover.coverAssetId
              ? { downloadUrl: `/api/v1/deliveries/${token}/cover/download` }
              : {}),
          }
        : null,
    };
  });
  app.get('/api/v1/deliveries/:token/cover/download', async (request, reply) => {
    const token = (request.params as { token: string }).token;
    const order = await deliveredOrderFor(token);
    const result = await pool.query<{ storage_key: string; mime_type: string }>(
      `select f.storage_key,f.mime_type from album_covers c
       join stored_files f on f.id=c.cover_asset_id
       where c.order_id=$1 and c.status='completed'
       order by c.attempt desc limit 1`,
      [order.id],
    );
    const asset = result.rows[0];
    if (!asset) throw fail('Capa ainda indisponível.', 404);
    const extension =
      asset.mime_type === 'image/png' ? 'png' : asset.mime_type === 'image/webp' ? 'webp' : 'jpg';
    reply
      .type(asset.mime_type)
      .header('content-disposition', `attachment; filename="capa-musica-da-resenha.${extension}"`);
    return storage.get(asset.storage_key);
  });
  app.post('/api/v1/orders/:publicId/revision-requests', async (request) => {
    const order = await orderFor((request.params as { publicId: string }).publicId);
    if (!hasAccess(order.publicId, request)) throw fail('Acesso privado necessário', 401);
    const body = (request.body ?? {}) as { message?: string };
    if (!body.message || body.message.length > 1000)
      throw fail('Informe uma solicitação de até 1000 caracteres.');
    await db.insert(revisionRequests).values({ orderId: order.id, message: body.message });
    return { received: true };
  });
  /**
   * Recovery sem cadastro: um link de entrega válido (que o cliente tem no e-mail)
   * vira sessão limitada de leitura neste navegador (sem story/PII, sem mutações).
   * Só vale para pedido já entregue.
   */
  app.post(
    '/api/v1/deliveries/:token/access',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      deliveryAccessSchema.parse(request.body ?? {});
      const token = (request.params as { token: string }).token;
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
      if (!order || order.status !== 'delivered') throw fail('Entrega indisponível.', 404);
      setAccessCookie(reply, 'order_view', order.publicId);
      return { publicId: order.publicId };
    },
  );
  app.post(
    '/api/v1/admin/session',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const body = (request.body ?? {}) as { email?: string; password?: string };
      if (!body.email || !body.password) throw fail('E-mail e senha são obrigatórios.', 401);
      const email = body.email.trim().toLowerCase();
      if (email !== env.ADMIN_EMAIL.toLowerCase() || body.password !== env.ADMIN_PASSWORD)
        throw fail('Credenciais inválidas.', 401);
      const [user] = await db
        .insert(adminUsers)
        .values({ email, passwordHash: 'env-managed' })
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
  app.get('/api/v1/admin/orders', async (request) => {
    await requireAdmin(request);
    const query = adminOrdersQuerySchema.parse(request.query ?? {});
    // Filtro exibe dia corrido Brasil (America/Sao_Paulo, com DST histórico via Intl);
    // persistência e comparação seguem em UTC ISO. (AGENTS.md: UTC no armazenamento.)
    const fromUtc = query.from ? spDayStartUtc(query.from) : undefined;
    const toUtc = query.to ? spDayStartUtc(nextUtcDate(query.to)) : undefined;
    const filters = [
      query.status ? eq(orders.status, query.status) : undefined,
      query.productType ? eq(orders.productType, query.productType) : undefined,
      query.q ? sql`${orders.publicId} ilike ${`%${query.q}%`}` : undefined,
      fromUtc ? sql`${orders.createdAt} >= ${fromUtc}` : undefined,
      toUtc ? sql`${orders.createdAt} < ${toUtc}` : undefined,
    ].filter(Boolean);
    const rows = await db
      .select()
      .from(orders)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(orders.createdAt))
      .limit(30)
      .offset((query.page - 1) * 30);
    return { items: rows, page: query.page };
  });
  app.get('/api/v1/admin/orders/:id', async (request) => {
    await requireAdmin(request);
    const id = (request.params as { id: string }).id;
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) throw fail('Pedido não encontrado', 404);
    const [story] = await db
      .select()
      .from(storySubmissions)
      .where(eq(storySubmissions.orderId, id));
    const lyrics = await db
      .select()
      .from(lyricsVersions)
      .where(eq(lyricsVersions.orderId, id))
      .orderBy(desc(lyricsVersions.number));
    const paymentRows = await db.select().from(payments).where(eq(payments.orderId, id));
    const jobs = await db.select().from(generationJobs).where(eq(generationJobs.orderId, id));
    const audio = await db.select().from(audioGenerations).where(eq(audioGenerations.orderId, id));
    const notes = await db.select().from(adminNotes).where(eq(adminNotes.orderId, id));
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
        calls: sql<number>`count(*)::int`,
      })
      .from(aiUsage)
      .where(eq(aiUsage.orderId, id));
    const aiCost = {
      totalUsd: sums?.totalUsd ?? '0',
      lyricsUsd: sums?.lyricsUsd ?? '0',
      audioUsd: sums?.audioUsd ?? '0',
      inputTokens: sums?.inputTokens ?? 0,
      outputTokens: sums?.outputTokens ?? 0,
      calls: sums?.calls ?? 0,
    };
    return {
      order,
      story: story?.data,
      lyrics,
      payments: paymentRows,
      jobs,
      audio,
      notes,
      aiUsage: usageRows,
      aiCost,
    };
  });
  /** Custo de IA agregado para o painel admin (mês corrente + últimos 30 dias + key). */
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
        calls: sql<number>`count(*)::int`,
        blocked: sql<number>`count(*) filter (where ${aiUsage.status} = 'blocked')::int`,
      })
      .from(aiUsage)
      .where(sql`date_trunc('month', ${aiUsage.createdAt}) = date_trunc('month', now())`);
    const byDay = await db
      .select({
        day: sql<string>`date_trunc('day', ${aiUsage.createdAt})::date::text`,
        totalUsd: sql<string | null>`sum(${aiUsage.costUsd})::text`,
        calls: sql<number>`count(*)::int`,
        blocked: sql<number>`count(*) filter (where ${aiUsage.status} = 'blocked')::int`,
      })
      .from(aiUsage)
      .where(sql`${aiUsage.createdAt} >= date_trunc('day', now()) - interval '29 days'`)
      .groupBy(sql`1`)
      .orderBy(sql`1`);
    return {
      month: {
        totalUsd: month?.totalUsd ?? zero,
        lyricsUsd: month?.lyricsUsd ?? zero,
        audioUsd: month?.audioUsd ?? zero,
        calls: month?.calls ?? 0,
        blocked: month?.blocked ?? 0,
      },
      byDay: byDay.map((row) => ({
        day: row.day,
        totalUsd: row.totalUsd ?? zero,
        calls: row.calls,
        blocked: row.blocked,
      })),
      key: await fetchOpenRouterKeyUsage(env.OPENROUTER_API_KEY),
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
  /** Prévia em streaming do áudio para a revisão administrativa. */
  app.get('/api/v1/admin/orders/:id/assets/:assetId/stream', async (request, reply) => {
    await requireAdmin(request);
    const { id, assetId } = request.params as { id: string; assetId: string };
    const [asset] = await db
      .select()
      .from(storedAssets)
      .where(and(eq(storedAssets.id, assetId), eq(storedAssets.orderId, id)));
    if (!asset) throw fail('Arquivo não encontrado', 404);
    reply.type(asset.mimeType).header('content-disposition', 'inline');
    return storage.get(asset.storageKey);
  });
  app.post('/api/v1/admin/jobs/:id/retry', async (request) => {
    await requireAdmin(request);
    const id = (request.params as { id: string }).id;
    await db
      .update(generationJobs)
      .set({
        status: 'pending',
        runAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(generationJobs.id, id));
    return { queued: true };
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
    await requireAdmin(request);
    const id = (request.params as { id: string }).id;
    const token = createAccessToken();
    await db
      .update(orders)
      .set({
        accessTokenHash: hashToken(token, env.CUSTOMER_ACCESS_TOKEN_PEPPER),
        accessRevokedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id));
    return { accessToken: token };
  });
  app.post('/api/v1/admin/orders/:id/audio/:audioId/approve', async (request) => {
    await requireAdmin(request);
    const { id, audioId } = request.params as { id: string; audioId: string };
    const [audio] = await db
      .select()
      .from(audioGenerations)
      .where(and(eq(audioGenerations.id, audioId), eq(audioGenerations.orderId, id)));
    if (!audio || audio.status !== 'completed') throw fail('Áudio não está pronto.', 400);
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (order?.status !== 'review_required') throw fail('Pedido não está em revisão.', 400);
    const ready = await db
      .select({ variant: audioGenerations.variant })
      .from(audioGenerations)
      .where(
        and(
          eq(audioGenerations.orderId, id),
          eq(audioGenerations.status, 'completed'),
          sql`${audioGenerations.assetId} is not null`,
        ),
      );
    const readyVariants = new Set(ready.map((row) => row.variant));
    if (!readyVariants.has(1) || !readyVariants.has(2))
      throw fail('Ambas as versões precisam estar prontas com áudio.', 400);
    assertTransition('review_required', 'delivered');
    const token = createAccessToken();
    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({ status: 'delivered', updatedAt: new Date() })
        .where(eq(orders.id, id));
      await tx
        .insert(deliveries)
        .values({
          orderId: id,
          tokenHash: hashToken(token, env.CUSTOMER_ACCESS_TOKEN_PEPPER),
          deliveredAt: new Date(),
        })
        .onConflictDoNothing();
      // O worker conclui este job pelo caminho já entregue (par pronto + delivered)
      // e dispara o e-mail com o link privado; reexecutável via email_deliveries.
      await tx
        .insert(generationJobs)
        .values({
          type: 'generate_audio',
          orderId: id,
          payload: {},
          idempotencyKey: `audio:${id}:deliver-notify:${Date.now()}`,
          maxAttempts: 6,
        })
        .onConflictDoNothing();
    });
    await recordEvent('delivered', order);
    return { delivered: true, deliveryToken: token };
  });
  app.post('/api/v1/admin/orders/:id/audio/:audioId/regenerate', async (request) => {
    await requireAdmin(request);
    const { id, audioId } = request.params as { id: string; audioId: string };
    const [audio] = await db
      .select()
      .from(audioGenerations)
      .where(and(eq(audioGenerations.id, audioId), eq(audioGenerations.orderId, id)));
    if (!audio) throw fail('Áudio não encontrado.', 404);
    await db.insert(generationJobs).values({
      type: 'generate_audio',
      orderId: id,
      payload: { variant: audio.variant },
      idempotencyKey: `audio:${id}:variant:${audio.variant}:${Date.now()}`,
      maxAttempts: 6,
    });
    return { queued: true };
  });
  /** Novo conteúdo aprovado após o pagamento, para correção editorial (ex.: filtro do provedor). */
  app.patch('/api/v1/admin/orders/:id/lyrics', async (request) => {
    const session = await requireAdmin(request);
    const id = (request.params as { id: string }).id;
    const content = generatedLyricsSchema.parse(request.body);
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) throw fail('Pedido não encontrado', 404);
    const [submission] = await db
      .select()
      .from(storySubmissions)
      .where(eq(storySubmissions.orderId, id));
    if (!submission) throw fail('Formulário ausente');
    const errors = validateLyrics(content, storySchema.parse(submission.data));
    if (errors.length) throw fail(errors.join(' '));
    const [countRow = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lyricsVersions)
      .where(eq(lyricsVersions.orderId, id));
    const [version] = await db
      .insert(lyricsVersions)
      .values({
        orderId: id,
        number: countRow.count + 1,
        kind: 'edited',
        content,
        approvedAt: new Date(),
      })
      .returning();
    await db
      .insert(adminNotes)
      .values({
        orderId: id,
        adminUserId: session.userId,
        message: 'Letra revisada pela administração e marcada como aprovada.',
      })
      .onConflictDoNothing();
    return version;
  });
  /** Reproduz as duas versões do zero, usando a letra aprovada mais recente. */
  app.post('/api/v1/admin/orders/:id/audio/rebuild', async (request) => {
    await requireAdmin(request);
    const id = (request.params as { id: string }).id;
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) throw fail('Pedido não encontrado', 404);
    const start: typeof order.status =
      order.status === 'delivered'
        ? 'revision_requested'
        : order.status === 'review_required'
          ? 'failed'
          : order.status;
    if (!['failed', 'revision_requested', 'audio_queued'].includes(start))
      throw fail('Este pedido não pode ser reproduzido agora.', 400);
    await db.transaction(async (tx) => {
      if (start !== 'audio_queued') {
        if (order.status !== start) {
          assertTransition(order.status, start);
          await tx
            .update(orders)
            .set({ status: start, updatedAt: new Date() })
            .where(eq(orders.id, id));
        }
        assertTransition(start, 'audio_queued');
        await tx
          .update(orders)
          .set({ status: 'audio_queued', updatedAt: new Date() })
          .where(eq(orders.id, id));
      }
      await tx.delete(audioGenerations).where(eq(audioGenerations.orderId, id));
      await tx
        .insert(generationJobs)
        .values({
          type: 'generate_audio',
          orderId: id,
          payload: {},
          idempotencyKey: `audio:${id}:rebuild:${Date.now()}`,
          maxAttempts: 6,
        })
        .onConflictDoNothing();
    });
    return { queued: true };
  });
  return app;
};
