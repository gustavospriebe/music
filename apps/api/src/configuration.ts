import type { Env } from './env.js';

export const publicConfiguration = (env: Env) => {
  const commercial = {
    ready: Boolean(
      env.COMMERCIAL_READY === 'true' &&
      env.SUPPORT_EMAIL &&
      env.DELIVERY_ESTIMATE &&
      env.REVISION_POLICY &&
      env.REFUND_POLICY &&
      env.USAGE_LICENSE &&
      env.TERMS_URL &&
      env.PRIVACY_URL,
    ),
    deliveryEstimate: env.DELIVERY_ESTIMATE ?? null,
    revisionPolicy: env.REVISION_POLICY ?? null,
    refundPolicy: env.REFUND_POLICY ?? null,
    usageLicense: env.USAGE_LICENSE ?? null,
    termsUrl: env.TERMS_URL ?? null,
    privacyUrl: env.PRIVACY_URL ?? null,
  };
  const configured =
    env.PAYMENT_PROVIDER === 'abacatepay' &&
    Boolean(env.ABACATEPAY_API_KEY && env.ABACATEPAY_PRODUCT_ID && env.ABACATEPAY_WEBHOOK_SECRET);
  return {
    brandName: env.BRAND_NAME ?? 'Música da Resenha',
    generation: { lyricsAvailable: Boolean(env.OPENROUTER_API_KEY && env.OPENROUTER_TEXT_MODEL) },
    supportEmail: env.SUPPORT_EMAIL ?? null,
    commercial,
    payment: {
      provider: env.PAYMENT_PROVIDER,
      label: env.PAYMENT_PROVIDER === 'abacatepay' ? 'AbacatePay' : 'Pagamento',
      configured,
      devFallback: !configured && env.NODE_ENV !== 'production',
    },
  };
};

export const orderPaymentConfiguration = (env: Env, priceCents: number) => {
  const { commercial, payment } = publicConfiguration(env);
  const unavailableReason = payment.devFallback
    ? null
    : !payment.configured
      ? 'O pagamento ainda não está disponível.'
      : priceCents <= 0
        ? 'O preço desta música ainda não foi definido.'
        : !commercial.ready
          ? 'As condições de compra ainda não foram publicadas.'
          : null;
  return {
    ...payment,
    priceConfigured: priceCents > 0,
    checkoutAllowed: unavailableReason === null,
    unavailableReason,
  };
};
