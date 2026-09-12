import {
  createPaymentProvider as configuredPaymentProvider,
  readPaymentConfig,
  type PaymentProvider,
} from '@resenha/providers';
import type { Env } from './env.js';
import type { PaymentEnvironment } from '@resenha/domain';

export type { PaymentProvider } from '@resenha/providers';

export const createPaymentProvider = (
  env: Env,
  providerName?: string,
  environment?: PaymentEnvironment,
): PaymentProvider => configuredPaymentProvider(readPaymentConfig(env), providerName, environment);

/** Existing attempts keep their provider when the checkout selection changes. */
export const paymentProviderResolver =
  (env: Env, current: PaymentProvider) =>
  (providerName: string, environment: PaymentEnvironment): PaymentProvider => {
    if (readPaymentConfig(env).environment !== environment)
      throw new Error('Payment environment credentials are unavailable.');
    return current.name === providerName
      ? current
      : createPaymentProvider(env, providerName, environment);
  };
