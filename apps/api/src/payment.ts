import type { Env } from './env.js';
import { createAbacatePayProvider } from './providers.js';
import type { PaymentDetails, PaymentCheckoutInput } from './providers.js';

/** Gateway-neutral operations; add a documented adapter when a new provider is selected. */
export type PaymentProvider = {
  createCheckout(input: PaymentCheckoutInput): Promise<{ id?: string; checkoutUrl: string }>;
  getPayment(id: string): Promise<PaymentDetails>;
};

export const createPaymentProvider = (env: Env): PaymentProvider => {
  if (env.PAYMENT_PROVIDER === 'disabled') {
    const unavailable = async (): Promise<never> => {
      throw new Error('Payment provider is disabled.');
    };
    return { createCheckout: unavailable, getPayment: unavailable };
  }
  const adapter = createAbacatePayProvider(env);
  return {
    createCheckout: async (input) => {
      const checkout = await adapter.createCheckout(input);
      return { id: checkout.id, checkoutUrl: checkout.initPoint };
    },
    getPayment: adapter.getBilling,
  };
};
