import { randomUUID } from 'node:crypto';
import Fastify, { LogController } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, getTableColumns, gt, inArray, lte, sql } from 'drizzle-orm';
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
  generateLyricsSchema,
  storySchema,
  revisionRequestSchema,
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
  emailDeliveries,
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
  stableDeliveryToken,
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
import { createPaymentProvider, type PaymentProvider } from './payment.js';
import { publicConfiguration, orderPaymentConfiguration } from './configuration.js';
import {
  createLyricsProvider,
  MAX_REFERENCE_IMAGE_BYTES,
  normalizeReferenceImage,
  verifyAbacatePaySecret,
  type LyricsProvider,
  type LyricsResult,
  type LyricsRefinement,
} from './providers.js';
import {
  audioRecoveryReason,
  failureCode,
  coverAttempt,
  jobRecovery,
  publicFailure,
  recoveryFor,
  referenceRequired,
  type RecoveryContext,
} from './recovery.js';
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

type AudioJobSelection = {
  provider: 'openrouter' | 'google';
  model: string;
};

const currentAudioJobSelection = (env: Env): AudioJobSelection => ({
  provider: env.MUSIC_PROVIDER,
  model:
    env.MUSIC_PROVIDER === 'google'
      ? env.GOOGLE_MUSIC_MODEL
      : (env.OPENROUTER_MUSIC_MODEL?.trim() ?? ''),
});

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
  const lyrics = overrides.lyrics ?? createLyricsProvider(env);
  const storage = createStorage(readStorageConfig(env));
  const paymentProvider = overrides.payment ?? createPaymentProvider(env);
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
  const accessValue = (kind: 'order' | 'order_view', order: typeof orders.$inferSelect) =>
    `${kind}:${order.publicId}:${hashToken(order.accessTokenHash, env.COOKIE_SECRET)}`;
  const setAccessCookie = async (
    reply: FastifyReply,
    kind: 'order' | 'order_view',
    publicId: string,
  ) => {
    const order = await orderFor(publicId);
    reply.setCookie(`${kind}_${publicId}`, accessValue(kind, order), {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
      signed: true,
    });
  };
  const hasSignedAccess = async (
    kind: 'order' | 'order_view',
    publicId: string,
    request: FastifyRequest,
  ) => {
    const value = request.cookies[`${kind}_${publicId}`];
    if (!value) return false;
    const unsigned = request.unsignCookie(value);
    if (!unsigned.valid) return false;
    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    if (!order || order.accessRevokedAt || unsigned.value !== accessValue(kind, order))
      return false;
    if (kind === 'order_view') {
      const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
      return Boolean(
        delivery && !delivery.revokedAt && (!delivery.expiresAt || delivery.expiresAt > new Date()),
      );
    }
    return true;
  };
  const hasAccess = (publicId: string, request: FastifyRequest) =>
    hasSignedAccess('order', publicId, request);
  /** Recovery cookies permit reading only, and follow the live delivery revocation/expiry. */
  const hasViewAccess = async (publicId: string, request: FastifyRequest) =>
    (await hasAccess(publicId, request)) ||
    (await hasSignedAccess('order_view', publicId, request));
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
  app.post('/api/v1/orders', async (request, reply) => {
    const input = createOrderSchema.parse(request.body);
    const creationKeyHash = hashToken(input.creationKey, env.CUSTOMER_ACCESS_TOKEN_PEPPER);
    const [existing] = await db
      .select()
      .from(orders)
      .where(eq(orders.creationKeyHash, creationKeyHash));
    if (existing) {
      await setAccessCookie(reply, 'order', existing.publicId);
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
    await setAccessCookie(reply, 'order', resolved.publicId);
    if (created) await recordEvent('order_created', resolved, input.visitorId);
    return reply.status(201).send({ publicId: resolved.publicId });
  });
  app.patch('/api/v1/orders/:publicId/story', async (request) => {
    const storyPublicId = (request.params as { publicId: string }).publicId;
    if (!(await hasAccess(storyPublicId, request))) throw fail('Acesso privado necessário', 401);
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
  const generateOrderLyrics = async (
    order: typeof orders.$inferSelect,
    body: unknown,
    administrative = false,
  ) => {
    const input = generateLyricsSchema.parse(body ?? {});
    if ('instructions' in input) {
      if (order.status !== 'lyrics_ready')
        throw fail('O refinamento exige uma letra pronta e salva.', 409);
      const assessment = evaluateContent(input.instructions);
      if (!assessment.allowed) throw fail(assessment.reason);
    }
    if (order.status === 'draft') throw fail('Preencha o formulário antes de gerar a letra.');
    if (!['story_completed', 'lyrics_ready', 'failed', 'lyrics_generating'].includes(order.status))
      throw fail('Este pedido não aceita mais geração de letra.');
    const [submission] = await db
      .select()
      .from(storySubmissions)
      .where(eq(storySubmissions.orderId, order.id));
    if (!submission) throw fail('Formulário ausente');
    const story = storySchema.parse(submission.data);
    if (!overrides.lyrics && !publicConfiguration(env).generation.lyricsAvailable)
      throw fail('Criação da letra temporariamente indisponível. Sua história está salva.', 503);
    const { claim, refinement } = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(orders).where(eq(orders.id, order.id)).for('update');
      if (!current) throw fail('Pedido não encontrado', 404);
      const context = await recoveryContext(current, tx);
      if (
        context.paid ||
        context.jobs.some((job) => ['pending', 'processing'].includes(job.status))
      )
        throw fail('Este pedido já está em produção ou aguardando processamento.', 409);
      if (administrative) {
        if (!recoveryFor(context).lyrics.canGenerate)
          throw fail(
            recoveryFor(context).lyrics.generateBlockedReason ??
              'A letra não pode ser gerada nesta etapa.',
            409,
          );
      }
      let refinement: LyricsRefinement | undefined;
      if ('instructions' in input) {
        if (current.status !== 'lyrics_ready')
          throw fail('O refinamento exige uma letra pronta e salva.', 409);
        const [base] = await tx
          .select()
          .from(lyricsVersions)
          .where(
            and(eq(lyricsVersions.orderId, order.id), eq(lyricsVersions.number, input.baseVersion)),
          );
        if (!base) throw fail('Versão não encontrada.', 404);
        const [latest] = await tx
          .select({ number: lyricsVersions.number })
          .from(lyricsVersions)
          .where(eq(lyricsVersions.orderId, order.id))
          .orderBy(desc(lyricsVersions.number))
          .limit(1);
        if (latest?.number !== input.baseVersion)
          throw fail('A letra foi atualizada. Use a versão salva mais recente.', 409);
        const saved = generatedLyricsSchema.parse(base.content);
        const canonical = {
          title: saved.title,
          fullLyrics: saved.fullLyrics,
          musicalDirection: saved.musicalDirection,
        };
        const assessment = evaluateContent(JSON.stringify(canonical));
        if (!assessment.allowed) throw fail(assessment.reason);
        refinement = { instructions: input.instructions, lyrics: canonical };
      }
      const [generated] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(lyricsVersions)
        .where(and(eq(lyricsVersions.orderId, order.id), eq(lyricsVersions.kind, 'generated')));
      if (generated && generated.count >= 4)
        throw fail('O limite de três novas gerações foi atingido.');
      if (
        !['story_completed', 'lyrics_ready', 'failed', 'lyrics_generating'].includes(current.status)
      )
        throw fail('Este pedido não aceita mais geração de letra.');
      const claimStartedAt = new Date();
      const staleBefore = new Date(claimStartedAt.getTime() - 5 * 60 * 1_000);
      if (current.status !== 'lyrics_generating')
        assertTransition(current.status, 'lyrics_generating');
      const [claim] = await tx
        .update(orders)
        .set({ status: 'lyrics_generating', updatedAt: claimStartedAt })
        .where(
          and(
            eq(orders.id, order.id),
            eq(orders.status, current.status),
            ...(current.status === 'lyrics_generating' ? [lte(orders.updatedAt, staleBefore)] : []),
          ),
        )
        .returning({ updatedAt: orders.updatedAt });
      if (!claim)
        throw fail('A letra já está sendo criada. Aguarde a conclusão desta tentativa.', 409);
      return { claim, refinement };
    });
    try {
      let feedback: string | undefined;
      let content: GeneratedLyrics | undefined;
      let errors: string[] = [];
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        let result: LyricsResult;
        const startedAt = Date.now();
        try {
          result = await lyrics.generate(story, feedback, refinement);
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
      const restoredStatus = refinement ? 'lyrics_ready' : 'failed';
      assertTransition('lyrics_generating', restoredStatus);
      await db
        .update(orders)
        .set({ status: restoredStatus, updatedAt: new Date() })
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
  };
  app.post(
    '/api/v1/orders/:publicId/lyrics/generate',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request) => {
      const publicId = (request.params as { publicId: string }).publicId;
      if (!(await hasAccess(publicId, request))) throw fail('Acesso privado necessário', 401);
      return generateOrderLyrics(await orderFor(publicId), request.body);
    },
  );
  app.post('/api/v1/admin/orders/:id/lyrics/generate', async (request) => {
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
        ? 'Geração de letra solicitada pela administração e concluída.'
        : 'Geração de letra solicitada pela administração não concluída. ' +
          publicFailure(outcome.error instanceof Error ? outcome.error.message : null),
    });
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  });
  app.patch('/api/v1/orders/:publicId/lyrics/:versionNumber', async (request) => {
    const editPublicId = (request.params as { publicId: string }).publicId;
    if (!(await hasAccess(editPublicId, request))) throw fail('Acesso privado necessário', 401);
    const versionNumber = Number((request.params as { versionNumber: string }).versionNumber);
    if (!Number.isInteger(versionNumber) || versionNumber < 1) throw fail('Versão inválida.', 404);
    const content = generatedLyricsSchema.parse(request.body);
    return db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.publicId, editPublicId))
        .for('update');
      if (!order) throw fail('Pedido não encontrado', 404);
      if (order.status !== 'lyrics_ready') throw fail('A letra está bloqueada.');
      const [base] = await tx
        .select({ number: lyricsVersions.number })
        .from(lyricsVersions)
        .where(and(eq(lyricsVersions.orderId, order.id), eq(lyricsVersions.number, versionNumber)));
      if (!base) throw fail('Versão não encontrada.', 404);
      const [countRow = { count: 0 }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(lyricsVersions)
        .where(eq(lyricsVersions.orderId, order.id));
      const [version] = await tx
        .insert(lyricsVersions)
        .values({ orderId: order.id, number: countRow.count + 1, kind: 'edited', content })
        .returning({ number: lyricsVersions.number, kind: lyricsVersions.kind });
      return version;
    });
  });
  app.post('/api/v1/orders/:publicId/lyrics/:versionNumber/approve', async (request) => {
    const approvePublicId = (request.params as { publicId: string }).publicId;
    if (!(await hasAccess(approvePublicId, request))) throw fail('Acesso privado necessário', 401);
    const versionNumber = Number((request.params as { versionNumber: string }).versionNumber);
    if (!Number.isInteger(versionNumber) || versionNumber < 1) throw fail('Versão inválida.', 404);
    const { content } = approveLyricsSchema.parse(request.body ?? {});
    const order = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.publicId, approvePublicId))
        .for('update');
      if (!order) throw fail('Pedido não encontrado', 404);
      if (order.status !== 'lyrics_ready') throw fail('A letra não está disponível.');
      const [version] = await tx
        .select({ content: lyricsVersions.content })
        .from(lyricsVersions)
        .where(and(eq(lyricsVersions.orderId, order.id), eq(lyricsVersions.number, versionNumber)));
      if (!version) throw fail('Versão não encontrada.', 404);
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
      return order;
    });
    await recordEvent('lyrics_approved', order);
    return { approved: true };
  });
  app.post('/api/v1/orders/:publicId/checkout', async (request) => {
    const publicId = (request.params as { publicId: string }).publicId;
    if (!(await hasAccess(publicId, request))) throw fail('Acesso privado necessário', 401);
    const result = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.publicId, publicId))
        .for('update');
      if (!order) throw fail('Pedido não encontrado', 404);
      if (!['lyrics_approved', 'payment_pending'].includes(order.status)) {
        if (
          [
            'paid',
            'audio_queued',
            'audio_generating',
            'review_required',
            'revision_requested',
            'delivered',
          ].includes(order.status)
        )
          throw fail('Este pedido já foi pago. Acompanhe a produção na página do pedido.');
        if (['failed', 'refunded', 'cancelled'].includes(order.status))
          throw fail('Este pedido não está disponível para pagamento. Abra a página do pedido.');
        throw fail('Aprove a letra antes do pagamento.');
      }
      const config = orderPaymentConfiguration(env, order.priceCents);
      if (!config.checkoutAllowed)
        throw fail(config.unavailableReason ?? 'Pagamento indisponível.', 409);
      const [existing] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.orderId, order.id), eq(payments.status, 'pending')));
      if (existing?.provider === 'dev')
        return { checkoutUrl: `${env.WEB_URL}/pedido/${order.publicId}`, dev: true as const };
      if (existing?.checkoutUrl) return { checkoutUrl: existing.checkoutUrl };
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.type, order.productType));
      // The order lock serializes checkout. The key is stable across network/transaction retry;
      // a rejected attempt changes the count and intentionally starts a new checkout.
      const [attempts] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(payments)
        .where(eq(payments.orderId, order.id));
      const preference = config.devFallback
        ? null
        : await paymentProvider.createCheckout({
            title: product?.name ?? 'Sua música',
            priceCents: order.priceCents,
            externalReference: order.publicId,
            backUrl: `${env.WEB_URL}/pedido/${order.publicId}`,
            idempotencyKey: `checkout:${order.publicId}:${attempts?.count ?? 0}`,
          });
      const checkoutUrl = preference?.checkoutUrl ?? `${env.WEB_URL}/pedido/${order.publicId}`;
      if (order.status === 'lyrics_approved') {
        assertTransition(order.status, 'payment_pending');
        await tx
          .update(orders)
          .set({ status: 'payment_pending', updatedAt: new Date() })
          .where(eq(orders.id, order.id));
      }
      await tx.insert(payments).values({
        orderId: order.id,
        provider: config.devFallback ? 'dev' : 'abacate-pay',
        status: 'pending',
        amountCents: order.priceCents,
        checkoutUrl,
      });
      return config.devFallback ? { checkoutUrl, dev: true as const } : { checkoutUrl };
    });
    await recordEvent('checkout_started', await orderFor(publicId));
    return result;
  });
  /** O webhook apenas notifica: valida o secret, busca o billing e confere valor/referência. */
  app.post('/api/v1/webhooks/abacate-pay', async (request, reply) => {
    if (env.PAYMENT_PROVIDER !== 'abacatepay')
      throw fail('Webhook indisponível para provider atual.', 404);
    const query = request.query as Record<string, string | undefined>;
    const receivedSecret =
      query.webhookSecret ??
      (request.headers['x-webhook-secret'] as string | undefined) ??
      (request.headers['x-secret'] as string | undefined);
    if (
      !verifyAbacatePaySecret({
        received: receivedSecret,
        expected: env.ABACATEPAY_WEBHOOK_SECRET,
      })
    )
      throw fail('Secret do webhook inválido.', 401);
    const body = (request.body ?? {}) as {
      event?: string;
      data?: { id?: string };
    };
    const eventName = body.event ?? '';
    const billingId = String(body.data?.id ?? '');
    if (!billingId || !['checkout.completed', 'checkout.refunded'].includes(eventName))
      return reply.status(200).send({ ignored: true });
    const billing = await paymentProvider.getPayment(billingId);
    const externalEventId = `${billing.id}:${billing.status}`.slice(0, 160);
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`payment:${billing.id}`}))`);
      const [event] = await tx
        .insert(paymentWebhookEvents)
        .values({
          provider: 'abacate-pay',
          externalEventId,
          payload: { action: eventName, status: billing.status },
        })
        .onConflictDoNothing()
        .returning();
      if (!event) return { duplicate: true as const };
      if (!billing.externalReference) throw fail('Pagamento sem referência de pedido.');
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.publicId, billing.externalReference))
        .for('update');
      if (!order) throw fail('Pedido do pagamento não encontrado.', 404);
      const [alreadyApproved] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.orderId, order.id), eq(payments.status, 'approved')));
      if (alreadyApproved) {
        if (alreadyApproved.externalPaymentId !== billing.id)
          throw fail('Pedido já confirmado por outro pagamento.');
        await tx
          .update(paymentWebhookEvents)
          .set({ paymentId: alreadyApproved.id, processedAt: new Date() })
          .where(eq(paymentWebhookEvents.id, event.id));
        return { duplicate: true as const };
      }
      const [payment] = await tx
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.orderId, order.id),
            eq(payments.provider, 'abacate-pay'),
            eq(payments.status, 'pending'),
          ),
        );
      if (!payment) throw fail('Nenhum pagamento pendente para este pedido.');
      let justPaid = false;
      if (eventName === 'checkout.completed' && billing.status === 'approved') {
        if (
          billing.amountCents !== order.priceCents ||
          billing.amountCents !== payment.amountCents ||
          billing.currency !== 'BRL'
        )
          throw fail('Valor ou moeda do pagamento diverge do pedido.');
        if (order.status !== 'payment_pending')
          throw fail('Pedido indisponível para confirmação de pagamento.');
        await tx
          .update(payments)
          .set({ status: 'approved', externalPaymentId: billing.id, updatedAt: new Date() })
          .where(eq(payments.id, payment.id));
        assertTransition(order.status, 'paid');
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
            payload: currentAudioJobSelection(env),
            idempotencyKey: `audio:${order.id}`,
            maxAttempts: 6,
          })
          .onConflictDoNothing();
        justPaid = true;
      } else if (['rejected', 'cancelled'].includes(billing.status)) {
        await tx
          .update(payments)
          .set({ status: 'rejected', externalPaymentId: billing.id, updatedAt: new Date() })
          .where(eq(payments.id, payment.id));
      }
      await tx
        .update(paymentWebhookEvents)
        .set({ paymentId: payment.id, processedAt: new Date() })
        .where(eq(paymentWebhookEvents.id, event.id));
      return { processed: true as const, paidOrder: justPaid ? order : null };
    });
    if ('paidOrder' in result && result.paidOrder) await recordEvent('paid', result.paidOrder);
    return reply
      .status(200)
      .send('duplicate' in result ? { duplicate: true } : { processed: true });
  });
  /** Somente fora de produção: confirma um pagamento criado em modo dev (sem credenciais). */
  app.post('/api/v1/orders/:publicId/dev-payment/approve', async (request) => {
    if (env.NODE_ENV === 'production') throw fail('Indisponível', 404);
    const publicId = (request.params as { publicId: string }).publicId;
    if (!(await hasAccess(publicId, request))) throw fail('Acesso privado necessário', 401);
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
            payload: currentAudioJobSelection(env),
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
    await setAccessCookie(reply, 'order', order.publicId);
    return { ok: true };
  });
  app.get('/api/v1/orders/:publicId', async (request) => {
    const publicId = (request.params as { publicId: string }).publicId;
    if (!(await hasViewAccess(publicId, request))) throw fail('Acesso privado necessário', 401);
    const full = await hasAccess(publicId, request);
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
      remainingGenerations: Math.max(
        0,
        4 - versions.filter((version) => version.kind === 'generated').length,
      ),
      audio,
      privateAccess: full,
      payment: orderPaymentConfiguration(env, order.priceCents),
    };
  });
  app.get('/api/v1/orders/:publicId/cover', async (request) => {
    const publicId = (request.params as { publicId: string }).publicId;
    if (!(await hasViewAccess(publicId, request))) throw fail('Acesso privado necessário', 401);
    const order = await orderFor(publicId);
    const cover = await latestCover(order.id);
    return {
      available: coverAvailable,
      cover: cover
        ? {
            ...publicCover(cover, await hasAccess(publicId, request)),
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
      if (!(await hasAccess(publicId, request))) throw fail('Acesso privado necessário', 401);
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
    if (!(await hasViewAccess(publicId, request))) throw fail('Acesso privado necessário', 401);
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
    if (!(await hasViewAccess(publicId, request))) throw fail('Acesso privado necessário', 401);
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
          eq(deliveries.tokenHash, hashToken(token, env.CUSTOMER_ACCESS_TOKEN_PEPPER)),
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
    const [order] = await db.select().from(orders).where(eq(orders.id, delivery.orderId));
    if (!order || order.status !== 'delivered') throw fail('Entrega indisponível.', 404);
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
    const publicId = (request.params as { publicId: string }).publicId;
    if (!(await hasAccess(publicId, request))) throw fail('Acesso privado necessário', 401);
    const { message } = revisionRequestSchema.parse(request.body);
    await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.publicId, publicId))
        .for('update');
      if (!order) throw fail('Pedido não encontrado', 404);
      if (order.status === 'revision_requested') return;
      if (order.status !== 'delivered')
        throw fail('Ajustes ficam disponíveis após a entrega.', 409);
      assertTransition(order.status, 'revision_requested');
      await tx.insert(revisionRequests).values({ orderId: order.id, message });
      await tx
        .update(orders)
        .set({ status: 'revision_requested', updatedAt: new Date() })
        .where(eq(orders.id, order.id));
    });
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
      await setAccessCookie(reply, 'order_view', order.publicId);
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
  const operationalFailure = sql`${orders.status} not in ('cancelled','refunded') and (
    ${orders.status} = 'failed'
    or exists (select 1 from album_covers c where c.order_id=${orders.id} and c.attempt=(select max(c2.attempt) from album_covers c2 where c2.order_id=${orders.id}) and (c.status='failed' or (c.status='processing' and (select j.status from generation_jobs j where j.order_id=${orders.id} and j.type='generate_cover' order by j.created_at desc,j.id desc limit 1)='failed')))
    or (${orders.status}='delivered' and not exists(select 1 from email_deliveries e where e.order_id=${orders.id} and e.status='sent') and (select j.status from generation_jobs j where j.order_id=${orders.id} and j.type in ('deliver-notify','generate_audio') order by j.created_at desc,j.id desc limit 1)='failed')
    or (${orders.status} not in ('delivered','cancelled','refunded') and (select j.status from generation_jobs j where j.order_id=${orders.id} and j.type='generate_audio' order by j.created_at desc,j.id desc limit 1)='failed')
  )`;
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
        subjectName: sql<string | null>`${storySubmissions.data} ->> 'subjectName'`,
      })
      .from(orders)
      .leftJoin(storySubmissions, eq(storySubmissions.orderId, orders.id))
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
  /** Agregados operacionais do cockpit admin: totais via SQL, sem paginar tudo no cliente. */
  app.get('/api/v1/admin/overview', async (request) => {
    await requireAdmin(request);
    const [totals] = await db
      .select({
        orders: sql<number>`count(*)::int`,
        paid: sql<number>`count(*) filter (where ${orders.status} in ('paid','audio_queued','audio_generating','review_required','revision_requested','delivered'))::int`,
        revenueCents: sql<number>`coalesce(sum(${orders.priceCents}) filter (where ${orders.status} in ('paid','audio_queued','audio_generating','review_required','revision_requested','delivered')), 0)::int`,
      })
      .from(orders);
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
      totals: {
        orders: totals?.orders ?? 0,
        paid: totals?.paid ?? 0,
        revenueCents: totals?.revenueCents ?? 0,
      },
      attention: {
        failedOperationalOrders: attention?.failedOperationalOrders ?? 0,
        failed: attention?.failed ?? 0,
        reviewRequired: attention?.reviewRequired ?? 0,
        audioQueued: attention?.audioQueued ?? 0,
        lyricsGenerating: attention?.lyricsGenerating ?? 0,
      },
    };
  });
  type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const recoveryContext = async (
    order: typeof orders.$inferSelect,
    source: Transaction | typeof db = db,
  ): Promise<RecoveryContext> => {
    const [paymentRows, versions, submissions, jobs, covers, emails, links, audioRows] =
      await Promise.all([
        source.select().from(payments).where(eq(payments.orderId, order.id)),
        source.select().from(lyricsVersions).where(eq(lyricsVersions.orderId, order.id)),
        source
          .select({ id: storySubmissions.id })
          .from(storySubmissions)
          .where(eq(storySubmissions.orderId, order.id)),
        source
          .select()
          .from(generationJobs)
          .where(eq(generationJobs.orderId, order.id))
          .orderBy(generationJobs.createdAt),
        source
          .select({ ...getTableColumns(albumCovers), referenceCreatedAt: storedAssets.createdAt })
          .from(albumCovers)
          .leftJoin(storedAssets, eq(storedAssets.id, albumCovers.referenceAssetId))
          .where(eq(albumCovers.orderId, order.id)),
        source
          .select({ status: emailDeliveries.status })
          .from(emailDeliveries)
          .where(eq(emailDeliveries.orderId, order.id)),
        source.select().from(deliveries).where(eq(deliveries.orderId, order.id)),
        source
          .select({ variant: audioGenerations.variant })
          .from(audioGenerations)
          .where(
            and(
              eq(audioGenerations.orderId, order.id),
              eq(audioGenerations.status, 'completed'),
              sql`${audioGenerations.assetId} is not null`,
            ),
          ),
      ]);
    const link = links[0];
    return {
      status: order.status,
      audioReady: [1, 2].every((variant) => audioRows.some((row) => row.variant === variant)),
      paid: paymentRows.some((item) => item.status === 'approved'),
      approvedLyrics: versions.some((item) => item.approvedAt),
      hasStory: Boolean(submissions.length),
      generatedCount: versions.filter((item) => item.kind === 'generated').length,
      lyricsAvailable: Boolean(
        overrides.lyrics || publicConfiguration(env).generation.lyricsAvailable,
      ),
      jobs,
      covers,
      emailSent: emails.some((item) => item.status === 'sent'),
      deliveryBlocked: Boolean(
        order.accessRevokedAt ||
        (link &&
          (link.revokedAt ||
            (link.expiresAt && link.expiresAt <= new Date()) ||
            link.tokenHash !==
              hashToken(
                stableDeliveryToken(link.id, env.CUSTOMER_ACCESS_TOKEN_PEPPER),
                env.CUSTOMER_ACCESS_TOKEN_PEPPER,
              ))),
      ),
    };
  };
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
    const context = await recoveryContext(order);
    const notifications = await db
      .select({
        id: emailDeliveries.id,
        status: emailDeliveries.status,
        provider: emailDeliveries.provider,
        createdAt: emailDeliveries.createdAt,
        updatedAt: emailDeliveries.updatedAt,
      })
      .from(emailDeliveries)
      .where(eq(emailDeliveries.orderId, id));
    return {
      recovery: recoveryFor(context),
      covers: context.covers.map((cover) => ({
        id: cover.id,
        attempt: cover.attempt,
        status: cover.status,
        hasReference: cover.hadReference,
        referenceAvailable: Boolean(cover.referenceAssetId) && !referenceRequired(cover),
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
      story: story?.data,
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
  app.post(
    '/api/v1/admin/jobs/:id/retry',
    { bodyLimit: MAX_REFERENCE_IMAGE_BYTES + 64 * 1024 },
    async (request) => {
      const session = await requireAdmin(request);
      const id = (request.params as { id: string }).id;
      let reference: Buffer | undefined;
      if (request.isMultipart()) {
        const upload = await request.file();
        if (!upload || upload.fieldname !== 'reference')
          throw fail('Envie a foto e confirme o consentimento.');
        const bytes = await upload.toBuffer();
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
            let assetId = cover.referenceAssetId;
            if (reference) {
              referenceKey = `orders/${order.publicId}/references/${nanoid(24)}.jpg`;
              await storage.put(referenceKey, reference, 'image/jpeg');
              const [asset] = await tx
                .insert(storedAssets)
                .values({
                  orderId: order.id,
                  storageKey: referenceKey,
                  mimeType: 'image/jpeg',
                  sizeBytes: reference.length,
                })
                .returning({ id: storedAssets.id });
              assetId = asset!.id;
              if (cover.referenceAssetId) {
                const [old] = await tx
                  .select({ key: storedAssets.storageKey })
                  .from(storedAssets)
                  .where(eq(storedAssets.id, cover.referenceAssetId));
                oldReferenceKey = old?.key;
              }
            }
            await tx
              .update(albumCovers)
              .set({
                status: 'pending',
                referenceAssetId: assetId,
                hadReference: cover.hadReference || Boolean(reference),
                lastError: null,
                updatedAt: new Date(),
              })
              .where(eq(albumCovers.id, cover.id));
            if (reference && cover.referenceAssetId)
              await tx.delete(storedAssets).where(eq(storedAssets.id, cover.referenceAssetId));
          }
          const type =
            job.type === 'generate_audio' && order.status === 'delivered'
              ? 'deliver-notify'
              : job.type;
          await tx
            .update(generationJobs)
            .set({
              type,
              status: 'pending',
              maxAttempts: sql`greatest(${generationJobs.maxAttempts}, ${generationJobs.attempts} + 1)`,
              runAt: new Date(),
              lockedAt: null,
              lockedBy: null,
              lastError: null,
              updatedAt: new Date(),
            })
            .where(eq(generationJobs.id, id));
          await tx.insert(adminNotes).values({
            orderId: order.id,
            adminUserId: session.userId,
            message: `Retomada solicitada: ${type === 'generate_cover' ? 'capa' : type === 'deliver-notify' ? 'aviso de entrega' : 'áudios faltantes'}. Diagnóstico anterior: ${publicFailure(job.lastError) ?? 'Falha sem diagnóstico disponível.'}`,
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
        .where(and(eq(generationJobs.orderId, id), eq(generationJobs.type, 'deliver-notify')))
        .orderBy(desc(generationJobs.createdAt))
        .limit(1)
        .for('update');
      if (existing)
        await tx
          .update(generationJobs)
          .set({
            status: 'pending',
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
          type: 'deliver-notify',
          payload: {},
          idempotencyKey: `notification:${id}`,
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
  const revokeOrderAccess = async (id: string, rotate: boolean, adminUserId: string) => {
    const token = createAccessToken();
    await db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
      if (!order) throw fail('Pedido não encontrado', 404);
      await tx
        .update(orders)
        .set({
          accessTokenHash: hashToken(token, env.CUSTOMER_ACCESS_TOKEN_PEPPER),
          creationKeyHash: null,
          accessRevokedAt: rotate ? null : new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, id));
      await tx
        .update(deliveries)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(eq(deliveries.orderId, id));
      await tx.insert(adminNotes).values({
        orderId: id,
        adminUserId,
        message: rotate
          ? 'Link de acesso do cliente substituído; acessos anteriores revogados.'
          : 'Acessos privados do pedido revogados pela administração.',
      });
    });
    return token;
  };
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
  app.post('/api/v1/admin/orders/:id/audio/:audioId/approve', async (request) => {
    const session = await requireAdmin(request);
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
    let token: string;
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
      if (current?.status !== 'review_required') throw fail('Pedido não está em revisão.', 400);
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
          deliveredAt: new Date(),
        })
        .onConflictDoNothing();
      await tx.insert(adminNotes).values({
        orderId: id,
        adminUserId: session.userId,
        message: 'As duas versões de áudio foram aprovadas para entrega.',
      });
      // O worker conclui este job pelo caminho já entregue (par pronto + delivered)
      // e dispara o e-mail com o link privado; reexecutável via email_deliveries.
      await tx
        .insert(generationJobs)
        .values({
          type: 'deliver-notify',
          orderId: id,
          payload: {},
          idempotencyKey: `notification:${id}`,
          maxAttempts: 6,
        })
        .onConflictDoNothing();
    });
    await recordEvent('delivered', order);
    return { delivered: true, deliveryToken: token! };
  });
  const enqueueAudioReplacement = async (id: string, adminUserId: string, audioId?: string) =>
    db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
      if (!order) throw fail('Pedido não encontrado.', 404);
      let variant: number | undefined;
      let selection = currentAudioJobSelection(env);
      if (audioId) {
        const audioRows = await tx
          .select()
          .from(audioGenerations)
          .where(and(eq(audioGenerations.id, audioId), eq(audioGenerations.orderId, id)));
        const audio = audioRows[0];
        if (!audio) throw fail('Áudio não encontrado.', 404);
        variant = audio.variant;
        const allAudio = await tx
          .select({
            variant: audioGenerations.variant,
            provider: audioGenerations.provider,
            model: audioGenerations.model,
          })
          .from(audioGenerations)
          .where(eq(audioGenerations.orderId, id));
        const existingSelection =
          allAudio.find(
            (row) =>
              row.variant === variant &&
              (row.provider === 'openrouter' || row.provider === 'google') &&
              Boolean(row.model?.trim()),
          ) ??
          allAudio.find(
            (row) =>
              (row.provider === 'openrouter' || row.provider === 'google') &&
              Boolean(row.model?.trim()),
          );
        if (
          existingSelection &&
          (existingSelection.provider === 'openrouter' ||
            existingSelection.provider === 'google') &&
          existingSelection.model
        )
          selection = {
            provider: existingSelection.provider,
            model: existingSelection.model.trim(),
          };
      }
      const context = await recoveryContext(order, tx);
      const reason = audioRecoveryReason(context);
      if (reason) throw fail(reason, 409);
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
        .set({ status: 'audio_queued', updatedAt: new Date() })
        .where(eq(orders.id, id));
      await tx
        .delete(audioGenerations)
        .where(
          variant
            ? and(eq(audioGenerations.orderId, id), eq(audioGenerations.variant, variant))
            : eq(audioGenerations.orderId, id),
        );
      await tx.insert(generationJobs).values({
        type: 'generate_audio',
        orderId: id,
        payload: variant ? { variant, ...selection } : selection,
        idempotencyKey: `audio:${id}:replace:${randomUUID()}`,
        maxAttempts: 1,
      });
      await tx.insert(adminNotes).values({
        orderId: id,
        adminUserId,
        message: variant
          ? `Regeneração da versão de áudio ${variant} solicitada; a outra versão será preservada.`
          : 'Regeneração das duas versões de áudio solicitada.',
      });
      return { queued: true };
    });
  app.post('/api/v1/admin/orders/:id/audio/:audioId/regenerate', async (request) => {
    const session = await requireAdmin(request);
    const { id, audioId } = request.params as { id: string; audioId: string };
    return enqueueAudioReplacement(id, session.userId, audioId);
  });
  app.patch('/api/v1/admin/orders/:id/lyrics', async (request) => {
    const session = await requireAdmin(request);
    const id = (request.params as { id: string }).id;
    const content = generatedLyricsSchema.parse(request.body);
    const assessment = evaluateContent(
      JSON.stringify({
        title: content.title,
        fullLyrics: content.fullLyrics,
        musicalDirection: content.musicalDirection,
      }),
    );
    if (!assessment.allowed) throw fail(assessment.reason);
    return db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
      if (!order) throw fail('Pedido não encontrado.', 404);
      const context = await recoveryContext(order, tx);
      if (!recoveryFor(context).lyrics.canEdit)
        throw fail(
          recoveryFor(context).lyrics.reason ?? 'Esta etapa não permite editar a letra.',
          409,
        );
      const [submission] = await tx
        .select()
        .from(storySubmissions)
        .where(eq(storySubmissions.orderId, id));
      if (!submission) throw fail('Formulário ausente.');
      const errors = validateLyrics(content, storySchema.parse(submission.data));
      if (errors.length) throw fail(errors.join(' '));
      const [latest] = await tx
        .select({ number: lyricsVersions.number })
        .from(lyricsVersions)
        .where(eq(lyricsVersions.orderId, id))
        .orderBy(desc(lyricsVersions.number))
        .limit(1);
      const [version] = await tx
        .insert(lyricsVersions)
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
  return app;
};
