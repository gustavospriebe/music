import type { FastifyInstance } from 'fastify';
import { and, eq, or } from 'drizzle-orm';
import { orders, payments, settlePayment } from '@resenha/database';
import { authenticateAbacatePayWebhook, readPaymentConfig } from '@resenha/providers';
import { paymentProviderResolver } from '../payment.js';
import type { HttpContext } from './context.js';

const webhookFailureCodes = {
  provider_resolution: 'PAYMENT_WEBHOOK_PROVIDER_RESOLUTION_FAILED',
  provider_lookup: 'PAYMENT_WEBHOOK_PROVIDER_LOOKUP_FAILED',
  payment_lookup: 'PAYMENT_WEBHOOK_PAYMENT_LOOKUP_FAILED',
  settlement: 'PAYMENT_WEBHOOK_SETTLEMENT_FAILED',
  analytics: 'PAYMENT_WEBHOOK_ANALYTICS_FAILED',
} as const;

export const registerWebhookRoutes = (app: FastifyInstance, ctx: HttpContext) => {
  const { env, db, pool, paymentProvider, fail, recordEvent, currentAudioJobSelection } = ctx;
  app.post('/api/v1/webhooks/abacatepay', async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    let notification;
    try {
      notification = authenticateAbacatePayWebhook(readPaymentConfig(env), {
        secret:
          query.webhookSecret ??
          (request.headers['x-webhook-secret'] as string | undefined) ??
          (request.headers['x-secret'] as string | undefined),
        signature: request.headers['x-webhook-signature'] as string | undefined,
        rawBody: request.rawBody,
        body: request.body,
      });
    } catch {
      throw fail('Webhook inválido.', 401);
    }
    if (!notification) return reply.status(200).send({ ignored: true });
    let stage: keyof typeof webhookFailureCodes = 'provider_resolution';
    try {
      // The selected provider for NEW checkout cannot disable settlement of existing charges.
      const provider = paymentProviderResolver(env, paymentProvider)(
        notification.provider,
        notification.environment,
      );
      stage = 'provider_lookup';
      const details = await provider.getPayment(notification.externalPaymentId);
      stage = 'payment_lookup';
      const candidates = await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.provider, notification.provider),
            eq(payments.environment, notification.environment),
            or(
              eq(payments.externalPaymentId, notification.externalPaymentId),
              eq(payments.externalReference, details.externalReference),
            ),
          ),
        );
      if (candidates.length !== 1) throw new Error('Payment attempt not uniquely identified.');
      const payment = candidates[0]!;
      stage = 'settlement';
      const result = await settlePayment(
        pool,
        payment.id,
        details,
        currentAudioJobSelection(env),
        notification,
      );
      if (result.productionStarted) {
        stage = 'analytics';
        const [order] = await db.select().from(orders).where(eq(orders.id, payment.orderId));
        if (order) await recordEvent('paid', order);
      }
      return reply.status(200).send(result.duplicate ? { duplicate: true } : { processed: true });
    } catch {
      // Fixed diagnostics only: errors and notification/provider payloads can contain private data.
      app.log.warn(
        { stage, code: webhookFailureCodes[stage] },
        'payment webhook processing failed',
      );
      throw fail(
        'Não foi possível reconciliar o pagamento. A notificação deve ser reenviada.',
        503,
      );
    }
  });
};
