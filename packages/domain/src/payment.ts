import { z } from 'zod';

const paymentEnvironmentSchema = z.enum(['live', 'sandbox', 'local']);
export type PaymentEnvironment = z.infer<typeof paymentEnvironmentSchema>;

export type PaymentStatus =
  | 'creating'
  | 'unknown'
  | 'pending'
  | 'approved'
  | 'refunded'
  | 'rejected'
  | 'cancelled'
  | 'expired';

const paymentDetailsSchema = z.object({
  provider: z.string().trim().min(1).max(30),
  environment: paymentEnvironmentSchema,
  id: z.string().trim().min(1).max(160),
  externalReference: z.string().trim().min(1).max(160),
  status: z.enum(['pending', 'approved', 'refunded', 'rejected', 'cancelled', 'expired']),
  amountCents: z.number().int().nonnegative().safe(),
  currency: z.literal('BRL'),
  checkoutUrl: z.string().url().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export type PaymentDetails = z.infer<typeof paymentDetailsSchema>;
export type PaymentIdentity = {
  provider: string;
  environment: PaymentEnvironment | null;
  externalPaymentId: string | null;
  externalReference: string;
  amountCents: number;
  currency: string;
};

export const parsePaymentDetails = (value: unknown): PaymentDetails => {
  const parsed = paymentDetailsSchema.safeParse(value);
  if (!parsed.success) throw new Error('Invalid payment response.');
  return parsed.data;
};

export const assertPaymentMatches = (expected: PaymentIdentity, value: PaymentDetails): void => {
  if (
    value.provider !== expected.provider ||
    expected.environment === null ||
    value.environment !== expected.environment ||
    (expected.externalPaymentId !== null && value.id !== expected.externalPaymentId) ||
    value.externalReference !== expected.externalReference ||
    value.amountCents !== expected.amountCents ||
    value.currency !== expected.currency ||
    value.currency !== 'BRL'
  )
    throw new Error('Payment does not match its persisted attempt.');
};

/** An authenticated later observation can reveal money, but cannot erase money already observed. */
export const nextPaymentStatus = (
  current: PaymentStatus,
  observed: PaymentDetails['status'],
): PaymentStatus => {
  if (current === 'refunded') return current;
  if (observed === 'refunded') return observed;
  if (current === 'approved') return current;
  if (observed === 'approved') return observed;
  if (['rejected', 'cancelled', 'expired'].includes(current)) return current;
  return observed;
};
