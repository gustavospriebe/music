import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  adminNotes,
  orderEvents,
  orders,
  payments,
  products,
  settlePayment,
} from '@resenha/database';
import { assertTransition } from '@resenha/domain';
import { orderPaymentConfiguration, publicConfiguration } from '../configuration.js';
import type { HttpContext } from './context.js';

export const registerPaymentRoutes = (app: FastifyInstance, ctx: HttpContext) => {
  const {
    env,
    db,
    pool,
    paymentProvider,
    fail,
    orderFor,
    recordEvent,
    hasAccess,
    requireAdmin,
    currentAudioJobSelection,
  } = ctx;
  app.post('/api/v1/orders/:publicId/checkout', async (request) => {
    const publicId = (request.params as { publicId: string }).publicId;
    if (!(await hasAccess(publicId, request))) throw fail('Acesso privado necessário', 401);
    const sandboxAdmin = publicConfiguration(env).payment.sandbox
      ? await requireAdmin(request)
      : null;
    // Persist one attempt before any network side effect. Its identity survives a process crash.
    const reservation = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.publicId, publicId))
        .for('update');
      if (!order) throw fail('Pedido não encontrado', 404);
      if (!['lyrics_approved', 'payment_pending'].includes(order.status)) {
        if (
          ['draft', 'story_completed', 'lyrics_generating', 'lyrics_ready'].includes(order.status)
        )
          throw fail('Aprove a letra antes do pagamento.', 409);
        if (
          [
            'paid',
            'audio_queued',
            'audio_generating',
            'review_required',
            'delivered',
            'revision_requested',
          ].includes(order.status)
        )
          throw fail('Este pedido já foi pago. Acompanhe a produção na página do pedido.', 409);
        throw fail('Este pedido não está disponível para iniciar um pagamento.', 409);
      }
      const config = orderPaymentConfiguration(env, order.priceCents, {
        administrativeSandbox: sandboxAdmin !== null,
      });
      if (!config.checkoutAllowed)
        throw fail(config.unavailableReason ?? 'Pagamento indisponível.', 409);
      const [existing] = await tx
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.orderId, order.id),
            inArray(payments.status, ['creating', 'unknown', 'pending']),
          ),
        );
      if (existing) {
        const expectedEnvironment = config.devFallback ? 'local' : config.environment;
        if (existing.environment !== expectedEnvironment)
          throw fail(
            'O ambiente desta tentativa de pagamento exige conferência administrativa.',
            409,
          );
        return { payment: existing, create: false, reserved: false };
      }
      const [previous] = await tx
        .select({ attempt: sql<number>`coalesce(max(${payments.attempt}),0)::int` })
        .from(payments)
        .where(eq(payments.orderId, order.id));
      const id = randomUUID();
      const externalReference = randomUUID();
      const [payment] = await tx
        .insert(payments)
        .values({
          id,
          orderId: order.id,
          provider: config.devFallback ? 'dev' : paymentProvider.name,
          environment: config.devFallback ? 'local' : config.environment,
          status: config.devFallback ? 'pending' : 'creating',
          amountCents: order.priceCents,
          attempt: (previous?.attempt ?? 0) + 1,
          idempotencyKey: `checkout:${externalReference}`,
          externalReference,
          externalPaymentId: config.devFallback ? `dev_${id}` : null,
          checkoutUrl: config.devFallback ? `${env.WEB_URL}/pedido/${publicId}` : null,
          reconcileAfter: new Date(Date.now() + 45_000),
        })
        .returning();
      if (!payment) throw new Error('Payment reservation failed.');
      if (sandboxAdmin) {
        await tx.insert(orderEvents).values({
          orderId: order.id,
          type: 'sandbox_checkout_requested',
          data: { adminUserId: sandboxAdmin.userId, paymentId: payment.id, environment: 'sandbox' },
        });
        await tx.insert(adminNotes).values({
          orderId: order.id,
          adminUserId: sandboxAdmin.userId,
          message: 'Checkout de homologação solicitado pela administração. Sem cobrança real.',
        });
      }
      if (order.status === 'lyrics_approved') {
        assertTransition(order.status, 'payment_pending');
        await tx
          .update(orders)
          .set({ status: 'payment_pending', updatedAt: new Date() })
          .where(eq(orders.id, order.id));
      }
      return { payment, create: !config.devFallback, reserved: true };
    });
    const payment = reservation.payment;
    if (!reservation.create) {
      if (reservation.reserved) await recordEvent('checkout_started', await orderFor(publicId));
      if (payment.status === 'pending' && payment.checkoutUrl)
        return payment.provider === 'dev'
          ? { checkoutUrl: payment.checkoutUrl, dev: true as const }
          : { checkoutUrl: payment.checkoutUrl };
      throw fail(
        'Estamos confirmando a criação do pagamento. Aguarde a atualização do pedido.',
        409,
      );
    }
    try {
      const [product] = await db.select().from(products).where(eq(products.type, 'custom_song'));
      const details = await paymentProvider.createCheckout({
        title: product?.name ?? 'Sua música',
        priceCents: payment.amountCents,
        externalReference: payment.externalReference,
        idempotencyKey: payment.idempotencyKey,
        backUrl: `${env.WEB_URL}/pedido/${publicId}`,
      });
      if (!details.checkoutUrl) throw new Error('Payment checkout URL missing.');
      await settlePayment(pool, payment.id, details, currentAudioJobSelection(env));
      await recordEvent('checkout_started', await orderFor(publicId));
      return { checkoutUrl: details.checkoutUrl };
    } catch {
      // A timeout or invalid response does not prove the provider failed to create the charge.
      await db
        .update(payments)
        .set({ status: 'unknown', lastError: 'PAYMENT_CREATION_UNKNOWN', updatedAt: new Date() })
        .where(and(eq(payments.id, payment.id), eq(payments.status, 'creating')));
      throw fail(
        'Não foi possível confirmar a criação do pagamento. Estamos verificando; não é necessário criar outro.',
        503,
      );
    }
  });

  app.post('/api/v1/orders/:publicId/dev-payment/approve', async (request) => {
    if (env.NODE_ENV === 'production') throw fail('Indisponível', 404);
    const publicId = (request.params as { publicId: string }).publicId;
    if (!(await hasAccess(publicId, request))) throw fail('Acesso privado necessário', 401);
    const order = await orderFor(publicId);
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, order.id), eq(payments.provider, 'dev')))
      .orderBy(desc(payments.attempt))
      .limit(1);
    if (!payment || !payment.externalPaymentId) throw fail('Pagamento não encontrado', 404);
    const result = await settlePayment(
      pool,
      payment.id,
      {
        provider: 'dev',
        environment: 'local',
        id: payment.externalPaymentId,
        externalReference: payment.externalReference,
        amountCents: payment.amountCents,
        currency: 'BRL',
        status: 'approved',
      },
      currentAudioJobSelection(env),
    );
    if (result.productionStarted) await recordEvent('paid', order);
    return { approved: true };
  });
};
