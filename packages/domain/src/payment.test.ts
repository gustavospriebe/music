import { describe, expect, it } from 'vitest';
import {
  assertPaymentMatches,
  nextPaymentStatus,
  parsePaymentDetails,
  type PaymentEnvironment,
} from './payment.js';

const charge = {
  provider: 'abacatepay',
  environment: 'live' as const,
  id: 'charge-a',
  externalReference: 'attempt-a',
  status: 'approved' as const,
  amountCents: 4990,
  currency: 'BRL' as const,
};
const expected = { ...charge, externalPaymentId: charge.id };
const environments: PaymentEnvironment[] = ['live', 'sandbox', 'local'];

describe('payment identity and financial history', () => {
  it('accepts only the persisted provider, charge, reference, cents and currency', () => {
    expect(() => assertPaymentMatches(expected, parsePaymentDetails(charge))).not.toThrow();
    for (const change of [
      { provider: 'another-provider' },
      { id: 'charge-b' },
      { externalReference: 'attempt-b' },
      { amountCents: 1 },
    ])
      expect(() => assertPaymentMatches(expected, { ...charge, ...change })).toThrow(
        'Payment does not match its persisted attempt.',
      );
    expect(() => assertPaymentMatches({ ...expected, currency: 'USD' }, charge)).toThrow();
  });

  it.each([
    { id: '' },
    { externalReference: null },
    { amountCents: 49.9 },
    { amountCents: -1 },
    { amountCents: Number.MAX_SAFE_INTEGER + 1 },
    { currency: 'USD' },
    { status: 'unrecognized' },
    { environment: undefined },
    { environment: null },
    { environment: 'production' },
  ])('rejects incomplete or invalid financial data: %j', (change) => {
    expect(() => parsePaymentDetails({ ...charge, ...change })).toThrow(
      'Invalid payment response.',
    );
  });

  it.each(environments)('accepts a matching %s environment', (environment) => {
    expect(() =>
      assertPaymentMatches(
        { ...expected, environment },
        parsePaymentDetails({ ...charge, environment }),
      ),
    ).not.toThrow();
  });

  it.each(
    environments.flatMap((persisted) =>
      environments
        .filter((observed) => observed !== persisted)
        .map((observed) => ({ persisted, observed })),
    ),
  )('refuses $observed observations for a $persisted attempt', ({ persisted, observed }) => {
    expect(() =>
      assertPaymentMatches(
        { ...expected, environment: persisted },
        { ...charge, environment: observed },
      ),
    ).toThrow('Payment does not match its persisted attempt.');
  });

  it.each(environments)(
    'never infers historical environment from a %s observation',
    (environment) => {
      expect(() =>
        assertPaymentMatches({ ...expected, environment: null }, { ...charge, environment }),
      ).toThrow('Payment does not match its persisted attempt.');
    },
  );

  it('preserves refund and approval when observations arrive out of order', () => {
    expect(nextPaymentStatus('refunded', 'approved')).toBe('refunded');
    expect(nextPaymentStatus('refunded', 'pending')).toBe('refunded');
    expect(nextPaymentStatus('approved', 'expired')).toBe('approved');
    expect(nextPaymentStatus('approved', 'cancelled')).toBe('approved');
    expect(nextPaymentStatus('approved', 'refunded')).toBe('refunded');
    expect(nextPaymentStatus('unknown', 'approved')).toBe('approved');
    expect(nextPaymentStatus('expired', 'approved')).toBe('approved');
    expect(nextPaymentStatus('expired', 'pending')).toBe('expired');
  });
});
