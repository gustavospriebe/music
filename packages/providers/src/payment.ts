import { createHmac, timingSafeEqual } from 'node:crypto';
import { parsePaymentDetails, type PaymentDetails } from '@resenha/domain';

export type PaymentCheckoutInput = {
  title: string;
  priceCents: number;
  externalReference: string;
  backUrl: string;
  /** Local attempt identity. An adapter must not claim provider idempotency without its contract. */
  idempotencyKey: string;
};
export type PaymentProvider = {
  name: string;
  createCheckout(input: PaymentCheckoutInput): Promise<PaymentDetails>;
  getPayment(id: string): Promise<PaymentDetails>;
  findPayment(externalReference: string): Promise<PaymentDetails | null>;
};
export type PaymentConfig = {
  provider: 'abacatepay' | 'disabled';
  production: boolean;
  environment: 'sandbox' | 'live';
  apiKey?: string;
  productId?: string;
  webhookSecret?: string;
  requireWebhookSignature: boolean;
};
type PaymentEnvironment = {
  NODE_ENV?: string;
  PAYMENT_PROVIDER?: string;
  PAYMENT_ENVIRONMENT?: string;
  ABACATEPAY_API_KEY?: string;
  ABACATEPAY_PRODUCT_ID?: string;
  ABACATEPAY_WEBHOOK_SECRET?: string;
  ABACATEPAY_REQUIRE_WEBHOOK_SIGNATURE?: string;
};

export const readPaymentConfig = (env: PaymentEnvironment = process.env): PaymentConfig => {
  const provider = env.PAYMENT_PROVIDER ?? 'abacatepay';
  if (provider !== 'abacatepay' && provider !== 'disabled')
    throw new Error('Unsupported payment provider.');
  const environment =
    env.PAYMENT_ENVIRONMENT ?? (env.NODE_ENV === 'production' ? 'live' : 'sandbox');
  if (environment !== 'sandbox' && environment !== 'live')
    throw new Error('Unsupported payment environment.');
  const requireSignature = env.ABACATEPAY_REQUIRE_WEBHOOK_SIGNATURE;
  if (requireSignature !== undefined && !['true', 'false'].includes(requireSignature))
    throw new Error('Invalid payment webhook signature configuration.');
  return {
    provider,
    production: env.NODE_ENV === 'production',
    environment,
    apiKey: env.ABACATEPAY_API_KEY?.trim() || undefined,
    productId: env.ABACATEPAY_PRODUCT_ID?.trim() || undefined,
    webhookSecret: env.ABACATEPAY_WEBHOOK_SECRET?.trim() || undefined,
    requireWebhookSignature:
      requireSignature === undefined ? env.NODE_ENV === 'production' : requireSignature === 'true',
  };
};

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid payment provider response.');
  return value as Record<string, unknown>;
};
const statuses = {
  PENDING: 'pending',
  PAID: 'approved',
  REFUNDED: 'refunded',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;

const checkoutDetails = (
  value: unknown,
  environment: PaymentConfig['environment'],
): PaymentDetails => {
  const data = record(value);
  const status =
    typeof data.status === 'string' ? statuses[data.status as keyof typeof statuses] : undefined;
  if (
    !Number.isSafeInteger(data.amount) ||
    (data.amount as number) <= 0 ||
    ((status === 'approved' || status === 'refunded') && data.paidAmount !== data.amount) ||
    data.devMode !== (environment === 'sandbox')
  )
    throw new Error('Invalid payment provider amount or environment.');
  if (data.url !== undefined && (typeof data.url !== 'string' || !data.url.startsWith('https://')))
    throw new Error('Invalid payment checkout URL.');
  return parsePaymentDetails({
    provider: 'abacatepay',
    environment,
    id: data.id,
    externalReference: data.externalId,
    status,
    amountCents: data.amount,
    // AbacatePay checkout amounts are BRL; it does not return a currency field.
    currency: 'BRL',
    checkoutUrl: data.url,
  });
};

/** Official v2 contract: /pages/payment/create and /pages/payment/list. */
export const createAbacatePayProvider = (config: PaymentConfig): PaymentProvider => {
  const request = async (path: string, body?: unknown): Promise<Record<string, unknown>> => {
    if (!config.apiKey) throw new Error('Payment provider credentials are unavailable.');
    const response = await fetch(`https://api.abacatepay.com/v2/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`Payment provider request failed (${response.status}).`);
    const envelope = record(await response.json());
    if (envelope.success !== true || envelope.error != null)
      throw new Error('Payment provider rejected the request.');
    return envelope;
  };
  const lookup = async (
    field: 'id' | 'externalId',
    value: string,
  ): Promise<PaymentDetails | null> => {
    if (!value.trim() || value.length > 160) throw new Error('Invalid payment lookup identity.');
    const query = new URLSearchParams({ [field]: value, limit: '2' });
    const envelope = await request(`checkouts/list?${query}`);
    if (!Array.isArray(envelope.data)) throw new Error('Invalid payment provider list.');
    const pagination = envelope.pagination === undefined ? undefined : record(envelope.pagination);
    if (pagination?.hasMore === true || envelope.data.length > 1)
      throw new Error('Payment lookup is ambiguous.');
    if (!envelope.data.length) return null;
    const details = checkoutDetails(envelope.data[0], config.environment);
    if ((field === 'id' ? details.id : details.externalReference) !== value)
      throw new Error('Payment lookup returned a different identity.');
    return details;
  };
  return {
    name: 'abacatepay',
    createCheckout: async (input) => {
      if (!config.productId) throw new Error('Payment provider product is unavailable.');
      if (!Number.isSafeInteger(input.priceCents) || input.priceCents <= 0)
        throw new Error('Payment amount must be positive integer cents.');
      const envelope = await request('checkouts/create', {
        items: [{ id: config.productId, quantity: 1 }],
        methods: ['PIX'],
        externalId: input.externalReference,
        returnUrl: input.backUrl,
        completionUrl: input.backUrl,
      });
      // AbacatePay documents externalId as a lookup reference, not an idempotency guarantee.
      // The application persists its attempt and never repeats this POST after an uncertain result.
      const details = checkoutDetails(envelope.data, config.environment);
      if (
        !details.checkoutUrl ||
        details.externalReference !== input.externalReference ||
        details.amountCents !== input.priceCents
      )
        throw new Error('Payment checkout does not match the requested attempt.');
      return details;
    },
    getPayment: async (id) => {
      const found = await lookup('id', id);
      if (!found) throw new Error('Payment was not found by its exact identity.');
      return found;
    },
    findPayment: (externalReference) => lookup('externalId', externalReference),
  };
};

export const createPaymentProvider = (
  config: PaymentConfig,
  providerName: string = config.provider,
  environment: 'sandbox' | 'live' | 'local' = config.environment,
): PaymentProvider => {
  if (environment !== config.environment)
    throw new Error('Payment environment credentials are unavailable.');
  if (providerName === 'abacatepay') return createAbacatePayProvider(config);
  const unavailable = async (): Promise<never> => {
    throw new Error('Payment provider is unavailable.');
  };
  return {
    name: providerName,
    createCheckout: unavailable,
    getPayment: unavailable,
    findPayment: unavailable,
  };
};

export const verifyAbacatePaySecret = (input: {
  received: string | undefined;
  expected: string | undefined;
}): boolean => {
  if (!input.received || !input.expected) return false;
  const actual = Buffer.from(input.received);
  const expected = Buffer.from(input.expected);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

// Published verification material, not a secret and never sufficient without the configured secret.
const abacatePublicKey =
  't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9';

export type PaymentNotification = {
  provider: 'abacatepay';
  environment: 'sandbox' | 'live';
  eventId: string;
  externalPaymentId: string;
  kind: 'approved' | 'refunded';
};
export const authenticateAbacatePayWebhook = (
  config: PaymentConfig,
  input: { secret?: string; signature?: string; rawBody?: Buffer; body: unknown },
): PaymentNotification | null => {
  if (!verifyAbacatePaySecret({ received: input.secret, expected: config.webhookSecret }))
    throw new Error('Invalid payment webhook authentication.');
  if (config.requireWebhookSignature || input.signature !== undefined) {
    if (!input.signature || !input.rawBody)
      throw new Error('Payment webhook signature is required.');
    const expected = createHmac('sha256', abacatePublicKey).update(input.rawBody).digest('base64');
    if (!verifyAbacatePaySecret({ received: input.signature, expected }))
      throw new Error('Invalid payment webhook signature.');
  }
  const body = record(input.body);
  if (!['checkout.completed', 'checkout.refunded'].includes(String(body.event))) return null;
  if (
    body.apiVersion !== 2 ||
    typeof body.devMode !== 'boolean' ||
    body.devMode !== (config.environment === 'sandbox')
  )
    throw new Error('Invalid payment webhook version or environment.');
  const checkout = record(record(body.data).checkout);
  if (
    typeof body.id !== 'string' ||
    !body.id.trim() ||
    body.id.length > 160 ||
    typeof checkout.id !== 'string' ||
    !checkout.id.trim() ||
    checkout.id.length > 160
  )
    throw new Error('Invalid payment webhook identity.');
  return {
    provider: 'abacatepay',
    environment: body.devMode ? 'sandbox' : 'live',
    eventId: body.id,
    externalPaymentId: checkout.id,
    kind: body.event === 'checkout.refunded' ? 'refunded' : 'approved',
  };
};
