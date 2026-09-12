import type { Env } from './env.js';
import { readPaymentConfig } from '@resenha/providers';

const publishedPolicyUrl = (value: string | undefined, env: Env): boolean => {
  if (!value) return false;
  const url = new URL(value);
  return (
    url.protocol === 'https:' &&
    url.pathname !== '/' &&
    url.href !== new URL(env.WEB_URL).href &&
    !/(?:example\.(?:com|org|net)|localhost)$/.test(url.hostname)
  );
};

export const publicConfiguration = (env: Env) => {
  const { environment } = readPaymentConfig(env);
  const configured =
    env.PAYMENT_PROVIDER === 'abacatepay' &&
    Boolean(env.ABACATEPAY_API_KEY && env.ABACATEPAY_PRODUCT_ID && env.ABACATEPAY_WEBHOOK_SECRET);
  const sandbox = configured && environment === 'sandbox';
  const commercial = {
    ready: Boolean(
      !sandbox &&
      env.COMMERCIAL_READY === 'true' &&
      env.SUPPORT_EMAIL &&
      env.DELIVERY_ESTIMATE &&
      env.REVISION_POLICY &&
      env.REFUND_POLICY &&
      env.USAGE_LICENSE &&
      publishedPolicyUrl(env.TERMS_URL, env) &&
      publishedPolicyUrl(env.PRIVACY_URL, env) &&
      env.TERMS_URL !== env.PRIVACY_URL &&
      env.POLICY_VERSION &&
      !env.POLICY_VERSION.startsWith('draft'),
    ),
    deliveryEstimate: env.DELIVERY_ESTIMATE ?? null,
    revisionPolicy: env.REVISION_POLICY ?? null,
    refundPolicy: env.REFUND_POLICY ?? null,
    usageLicense: env.USAGE_LICENSE ?? null,
    termsUrl: env.TERMS_URL ?? null,
    privacyUrl: env.PRIVACY_URL ?? null,
    policyVersion: env.POLICY_VERSION ?? (env.NODE_ENV === 'production' ? null : 'draft-v1'),
  };
  return {
    brandName: env.BRAND_NAME ?? 'Música da Resenha',
    generation: { lyricsAvailable: Boolean(env.OPENROUTER_API_KEY && env.OPENROUTER_TEXT_MODEL) },
    supportEmail: env.SUPPORT_EMAIL ?? null,
    commercial,
    payment: {
      provider: env.PAYMENT_PROVIDER,
      label: sandbox
        ? 'AbacatePay — homologação sem cobrança'
        : env.PAYMENT_PROVIDER === 'abacatepay'
          ? 'AbacatePay'
          : 'Pagamento',
      environment,
      sandbox,
      configured,
      devFallback: !configured && env.NODE_ENV !== 'production',
    },
  };
};

export const orderPaymentConfiguration = (
  env: Env,
  priceCents: number,
  authorization: { administrativeSandbox?: boolean } = {},
) => {
  const { commercial, payment } = publicConfiguration(env);
  const unavailableReason = payment.devFallback
    ? null
    : !payment.configured
      ? 'O pagamento ainda não está disponível.'
      : !Number.isSafeInteger(priceCents) || priceCents <= 0
        ? 'O preço desta música ainda não foi definido.'
        : payment.sandbox && !authorization.administrativeSandbox
          ? 'O pagamento está em homologação restrita à administração.'
          : !commercial.ready && !(payment.sandbox && authorization.administrativeSandbox)
            ? 'As condições de compra ainda não foram publicadas.'
            : null;
  return {
    ...payment,
    priceConfigured: priceCents > 0,
    checkoutAllowed: unavailableReason === null,
    unavailableReason,
  };
};
