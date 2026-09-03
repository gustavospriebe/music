import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ZodError } from 'zod';
import { createOrderSchema, generatedLyricsSchema, storySchema } from '@resenha/contracts';
import {
  adminNotes,
  adminSessions,
  adminUsers,
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
  validateLyrics,
  verifyToken,
} from '@resenha/domain';
import type { Env } from './env.js';
import {
  createLocalStorage,
  createLyricsProvider,
  createMercadoPagoProvider,
  verifyMercadoPagoSignature,
  type LyricsProvider,
} from './providers.js';

export const buildApp = (env: Env, overrides: { lyrics?: LyricsProvider } = {}) => {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    genReqId: () => nanoid(12),
    bodyLimit: 100_000,
  });
  const { db, pool } = createDb(env.DATABASE_URL);
  const lyrics = overrides.lyrics ?? createLyricsProvider(env);
  const storage = createLocalStorage(env.LOCAL_STORAGE_PATH);
  const mercadoPago = createMercadoPagoProvider(env);
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
  void app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
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
  const hasAccess = (publicId: string, request: { cookies: Record<string, string | undefined> }) =>
    request.cookies[`order_${publicId}`] === '1';
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
    db.select().from(products).where(eq(products.active, true)),
  );
  app.post('/api/v1/orders', async (request, reply) => {
    const input = createOrderSchema.parse(request.body);
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
      })
      .returning();
    reply.setCookie(`order_${order!.publicId}`, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
    });
    return reply.status(201).send({ ...order!, accessToken: token });
  });
  app.patch('/api/v1/orders/:publicId/story', async (request) => {
    const order = await orderFor((request.params as { publicId: string }).publicId);
    if (!['draft', 'story_completed'].includes(order.status))
      throw fail('O formulário não pode mais ser alterado.');
    const story = storySchema.parse(request.body);
    if (story.productType !== order.productType) throw fail('Tipo de produto inválido.');
    const content = evaluateContent(JSON.stringify(story));
    if (!content.allowed) throw fail(content.reason);
    await db.transaction(async (tx) => {
      await tx
        .insert(storySubmissions)
        .values({ orderId: order.id, data: story })
        .onConflictDoUpdate({
          target: storySubmissions.orderId,
          set: { data: story, updatedAt: new Date() },
        });
      if (order.status === 'draft') {
        assertTransition('draft', 'story_completed');
        await tx
          .update(orders)
          .set({ status: 'story_completed', updatedAt: new Date() })
          .where(eq(orders.id, order.id));
      }
    });
    return { saved: true };
  });
  app.post(
    '/api/v1/orders/:publicId/lyrics/generate',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request) => {
      const order = await orderFor((request.params as { publicId: string }).publicId);
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
      // 'lyrics_generating' aqui significa recuperação de uma tentativa interrompida.
      if (order.status !== 'lyrics_generating') {
        assertTransition(order.status, 'lyrics_generating');
        await db
          .update(orders)
          .set({ status: 'lyrics_generating', updatedAt: new Date() })
          .where(eq(orders.id, order.id));
      }
      try {
        let feedback: string | undefined;
        let content: Awaited<ReturnType<LyricsProvider['generate']>> | undefined;
        let errors: string[] = [];
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          content = await lyrics.generate(story, feedback);
          errors = validateLyrics(content, story);
          if (!errors.length) break;
          feedback = errors.join(' ');
          content = undefined;
        }
        if (!content) throw fail(`${errors.join(' ')} Tente novamente.`);
        const [countRow = { count: 0 }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(lyricsVersions)
          .where(eq(lyricsVersions.orderId, order.id));
        const [version] = await db
          .insert(lyricsVersions)
          .values({ orderId: order.id, number: countRow.count + 1, kind: 'generated', content })
          .returning();
        await db
          .update(orders)
          .set({ status: 'lyrics_ready', updatedAt: new Date() })
          .where(eq(orders.id, order.id));
        return version;
      } catch (error) {
        await db
          .update(orders)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(orders.id, order.id));
        throw error;
      }
    },
  );
  app.patch('/api/v1/orders/:publicId/lyrics/:versionId', async (request) => {
    const order = await orderFor((request.params as { publicId: string }).publicId);
    if (order.status !== 'lyrics_ready') throw fail('A letra está bloqueada.');
    const content = generatedLyricsSchema.parse(request.body);
    const [countRow = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lyricsVersions)
      .where(eq(lyricsVersions.orderId, order.id));
    const [version] = await db
      .insert(lyricsVersions)
      .values({ orderId: order.id, number: countRow.count + 1, kind: 'edited', content })
      .returning();
    return version;
  });
  app.post('/api/v1/orders/:publicId/lyrics/:versionId/approve', async (request) => {
    const order = await orderFor((request.params as { publicId: string }).publicId);
    if (order.status !== 'lyrics_ready') throw fail('A letra não está disponível.');
    const versionId = (request.params as { versionId: string }).versionId;
    await db.transaction(async (tx) => {
      await tx
        .update(lyricsVersions)
        .set({ approvedAt: new Date() })
        .where(and(eq(lyricsVersions.id, versionId), eq(lyricsVersions.orderId, order.id)));
      await tx
        .update(orders)
        .set({ status: 'lyrics_approved', updatedAt: new Date() })
        .where(eq(orders.id, order.id));
    });
    return { approved: true };
  });
  app.post('/api/v1/orders/:publicId/checkout', async (request) => {
    const order = await orderFor((request.params as { publicId: string }).publicId);
    if (!['lyrics_approved', 'payment_pending'].includes(order.status))
      throw fail('Aprove a letra antes do pagamento.');
    const [existing] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, order.id), eq(payments.status, 'pending')));
    if (existing?.checkoutUrl) return { paymentId: existing.id, checkoutUrl: existing.checkoutUrl };
    const [product] = await db.select().from(products).where(eq(products.type, order.productType));
    if (!env.MERCADO_PAGO_ACCESS_TOKEN) {
      if (env.NODE_ENV === 'production') throw fail('Provider de pagamento não configurado.', 501);
      const [devPayment] = await db.transaction(async (tx) => {
        if (order.status === 'lyrics_approved') {
          assertTransition('lyrics_approved', 'payment_pending');
          await tx
            .update(orders)
            .set({ status: 'payment_pending', updatedAt: new Date() })
            .where(eq(orders.id, order.id));
        }
        return tx
          .insert(payments)
          .values({
            orderId: order.id,
            provider: 'dev',
            status: 'pending',
            amountCents: order.priceCents,
          })
          .returning();
      });
      return {
        paymentId: devPayment!.id,
        checkoutUrl: `${env.WEB_URL}/pedido/${order.publicId}`,
        dev: true,
      };
    }
    const preference = await mercadoPago.createPreference({
      title: product?.name ?? 'Música da Resenha',
      priceCents: order.priceCents,
      externalReference: order.publicId,
      backUrl: `${env.WEB_URL}/pedido/${order.publicId}`,
    });
    const [payment] = await db.transaction(async (tx) => {
      if (order.status === 'lyrics_approved') {
        assertTransition('lyrics_approved', 'payment_pending');
        await tx
          .update(orders)
          .set({ status: 'payment_pending', updatedAt: new Date() })
          .where(eq(orders.id, order.id));
      }
      return tx
        .insert(payments)
        .values({
          orderId: order.id,
          provider: 'mercado-pago',
          status: 'pending',
          amountCents: order.priceCents,
          checkoutUrl: preference.initPoint,
        })
        .returning();
    });
    return { paymentId: payment!.id, checkoutUrl: preference.initPoint };
  });
  /** O webhook apenas notifica: valida assinatura, busca o pagamento e confere valor/referência. */
  app.post('/api/v1/webhooks/mercado-pago', async (request, reply) => {
    if (env.PAYMENT_PROVIDER !== 'mercadopago')
      throw fail('Webhook indisponível para provider atual.', 404);
    const secret = env.MERCADO_PAGO_WEBHOOK_SECRET;
    if (!secret) throw fail('MERCADO_PAGO_WEBHOOK_SECRET não configurado.', 500);
    const body = (request.body ?? {}) as {
      type?: string;
      topic?: string;
      action?: string;
      data?: { id?: string | number };
    };
    const query = request.query as Record<string, string | undefined>;
    const topic = body.type ?? body.topic ?? query.topic ?? query.type;
    const dataId = String(body.data?.id ?? query['data.id'] ?? query.data_id ?? query.id ?? '');
    if (!dataId || (topic && topic !== 'payment')) return reply.status(200).send({ ignored: true });
    const signatureHeader = request.headers['x-signature'];
    const requestId = request.headers['x-request-id'];
    if (
      !verifyMercadoPagoSignature({
        signatureHeader: typeof signatureHeader === 'string' ? signatureHeader : undefined,
        requestId: typeof requestId === 'string' ? requestId : undefined,
        dataId,
        secret,
      })
    )
      throw fail('Assinatura do webhook inválida.', 401);
    const mpPayment = await mercadoPago.getPayment(dataId);
    const externalEventId = `${requestId ?? dataId}:${mpPayment.status}`.slice(0, 160);
    const [event] = await db
      .insert(paymentWebhookEvents)
      .values({
        provider: 'mercado-pago',
        externalEventId,
        payload: { action: body.action ?? topic ?? 'payment', status: mpPayment.status },
      })
      .onConflictDoNothing()
      .returning();
    if (!event) return reply.status(200).send({ duplicate: true });
    try {
      if (!mpPayment.externalReference) throw new Error('Payment has no external_reference.');
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.publicId, mpPayment.externalReference));
      if (!order) throw new Error('Order not found for external_reference.');
      const [payment] = await db
        .select()
        .from(payments)
        .where(and(eq(payments.orderId, order.id), eq(payments.status, 'pending')));
      if (!payment) throw new Error('No pending payment for this order.');
      if (mpPayment.status === 'approved') {
        if (mpPayment.amountCents !== order.priceCents || mpPayment.currency !== 'BRL')
          throw new Error('Payment amount or currency does not match the order.');
        await db.transaction(async (tx) => {
          const [current] = await tx.select().from(payments).where(eq(payments.id, payment.id));
          if (current?.status === 'approved') return;
          await tx
            .update(payments)
            .set({
              status: 'approved',
              externalPaymentId: mpPayment.id,
              updatedAt: new Date(),
            })
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
          }
        });
      } else if (['rejected', 'cancelled'].includes(mpPayment.status)) {
        await db
          .update(payments)
          .set({ status: 'rejected', externalPaymentId: mpPayment.id, updatedAt: new Date() })
          .where(eq(payments.id, payment.id));
      }
      await db
        .update(paymentWebhookEvents)
        .set({ paymentId: payment.id, processedAt: new Date() })
        .where(eq(paymentWebhookEvents.id, event.id));
      return reply.status(200).send({ processed: true });
    } catch (error) {
      await db
        .update(paymentWebhookEvents)
        .set({ error: error instanceof Error ? error.message.slice(0, 500) : 'unknown' })
        .where(eq(paymentWebhookEvents.id, event.id));
      throw error;
    }
  });
  /** Somente fora de produção: confirma um pagamento criado em modo dev (sem credenciais MP). */
  app.post('/api/v1/dev/payments/:paymentId/approve', async (request) => {
    if (env.NODE_ENV === 'production') throw fail('Indisponível', 404);
    const paymentId = (request.params as { paymentId: string }).paymentId;
    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
    if (!payment || payment.provider !== 'dev') throw fail('Pagamento não encontrado', 404);
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(payments).where(eq(payments.id, paymentId));
      if (current?.status !== 'pending') return;
      await tx
        .update(payments)
        .set({ status: 'approved', externalPaymentId: `dev_${paymentId}`, updatedAt: new Date() })
        .where(eq(payments.id, paymentId));
      const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId));
      if (order?.status === 'payment_pending') {
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
      }
    });
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
    reply.setCookie(`order_${order.publicId}`, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
    });
    return { ok: true };
  });
  app.get('/api/v1/orders/:publicId', async (request) => {
    const publicId = (request.params as { publicId: string }).publicId;
    if (!hasAccess(publicId, request)) throw fail('Acesso privado necessário', 401);
    const order = await orderFor(publicId);
    const [story] = await db
      .select()
      .from(storySubmissions)
      .where(eq(storySubmissions.orderId, order.id));
    const versions = await db
      .select()
      .from(lyricsVersions)
      .where(eq(lyricsVersions.orderId, order.id))
      .orderBy(desc(lyricsVersions.number));
    const audio = await db
      .select({
        id: audioGenerations.id,
        assetId: audioGenerations.assetId,
        variant: audioGenerations.variant,
        status: audioGenerations.status,
      })
      .from(audioGenerations)
      .where(eq(audioGenerations.orderId, order.id));
    return { order, story: story?.data, lyrics: versions, audio, privateAccess: true };
  });
  app.get('/api/v1/orders/:publicId/assets/:assetId/download', async (request, reply) => {
    const { publicId, assetId } = request.params as { publicId: string; assetId: string };
    if (!hasAccess(publicId, request)) throw fail('Acesso privado necessário', 401);
    const order = await orderFor(publicId);
    const [asset] = await db
      .select()
      .from(storedAssets)
      .where(and(eq(storedAssets.id, assetId), eq(storedAssets.orderId, order.id)));
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
    const lyrics = await db
      .select()
      .from(lyricsVersions)
      .where(
        and(eq(lyricsVersions.orderId, order.id), sql`${lyricsVersions.approvedAt} is not null`),
      );
    const audio = await db
      .select({
        id: audioGenerations.id,
        assetId: audioGenerations.assetId,
        variant: audioGenerations.variant,
      })
      .from(audioGenerations)
      .where(and(eq(audioGenerations.orderId, order.id), eq(audioGenerations.status, 'completed')));
    return { publicOrderId: order.publicId, lyrics, audio };
  });
  app.get('/api/v1/deliveries/:token/files/:assetId/download', async (request, reply) => {
    const { token, assetId } = request.params as { token: string; assetId: string };
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
    const [asset] = await db
      .select()
      .from(storedAssets)
      .where(and(eq(storedAssets.id, assetId), eq(storedAssets.orderId, delivery.orderId)));
    if (!asset) throw fail('Arquivo não encontrado', 404);
    reply
      .type(asset.mimeType)
      .header(
        'content-disposition',
        `attachment; filename="musica-da-resenha${asset.storageKey.slice(asset.storageKey.lastIndexOf('.'))}"`,
      );
    return storage.get(asset.storageKey);
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
    const query = request.query as { status?: string; productType?: string; page?: string };
    const page = Math.max(1, Number(query.page ?? 1));
    const filters = [
      query.status
        ? eq(orders.status, query.status as typeof orders.$inferSelect.status)
        : undefined,
      query.productType
        ? eq(orders.productType, query.productType as typeof orders.$inferSelect.productType)
        : undefined,
    ].filter(Boolean);
    const rows = await db
      .select()
      .from(orders)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(orders.createdAt))
      .limit(30)
      .offset((page - 1) * 30);
    return { items: rows, page };
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
    return { order, story: story?.data, lyrics, payments: paymentRows, jobs, audio, notes };
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
    });
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
