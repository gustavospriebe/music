import { describe, expect, it } from 'vitest';
import {
  checkoutResponseSchema,
  createOrderResponseSchema,
  createOrderSchema,
  orderStatusSchema,
  publicOrderSchema,
  publicProductSchema,
  storySchema,
} from './index.js';

const common = {
  buyerEmail: 'cliente@example.com',
  subjectName: 'Bia',
  occasion: 'Aniversário',
  genre: 'Pagode',
  voice: 'female' as const,
  mood: 'Animado',
  facts: ['Sempre chega cantando', 'Junta toda a turma'],
  termsAccepted: true as const,
};

describe('storySchema', () => {
  it('accepts a complete friend-roast story and applies list defaults', () => {
    const story = storySchema.parse({
      ...common,
      productType: 'friend_roast',
      relationship: 'Amiga',
      traits: ['Engraçada'],
      biggestStory: 'A viagem para a praia',
      roastLevel: 'light',
      safetyConfirmed: true,
    });
    expect(story.catchphrases).toEqual([]);
    expect(story.productType).toBe('friend_roast');
  });

  it('requires the product-specific safety confirmation', () => {
    const result = storySchema.safeParse({
      ...common,
      productType: 'team_anthem',
      location: 'Vila Madalena',
      colors: 'Azul e branco',
      players: ['Nando'],
      greatestWin: 'Final do bairro',
      biggestLoss: 'Chuva no campo',
      anthemStyle: 'samba',
      amateurConfirmed: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects oversized and blank mandatory answers', () => {
    const result = storySchema.safeParse({
      ...common,
      subjectName: ' ',
      productType: 'emotional_tribute',
      relationship: 'Irmã',
      howMet: 'Na escola',
      mostImportantMemory: 'A formatura',
      gratitudeReason: 'Pelo apoio',
      milestone: 'A mudança',
      desiredFeeling: 'Alegria',
    });
    expect(result.success).toBe(false);
  });
});

describe('public order contracts', () => {
  it('requires an idempotency UUID for order creation', () => {
    expect(
      createOrderSchema.safeParse({ productType: 'friend_roast', creationKey: 'repeat-me' })
        .success,
    ).toBe(false);
    expect(
      createOrderSchema.parse({
        productType: 'friend_roast',
        creationKey: '51cc3b09-2902-42cf-9071-70f078d36cd7',
      }),
    ).toEqual({
      productType: 'friend_roast',
      creationKey: '51cc3b09-2902-42cf-9071-70f078d36cd7',
    });
  });

  it('accepts only known order statuses', () => {
    expect(orderStatusSchema.parse('audio_generating')).toBe('audio_generating');
    expect(orderStatusSchema.safeParse('production').success).toBe(false);
    expect(orderStatusSchema.safeParse(undefined).success).toBe(false);
  });

  it('rejects internal fields in public product and order payloads', () => {
    expect(
      publicProductSchema.parse({
        type: 'friend_roast',
        name: 'Música da Resenha',
        priceCents: 4990,
        active: true,
      }),
    ).toEqual({
      type: 'friend_roast',
      name: 'Música da Resenha',
      priceCents: 4990,
      active: true,
    });
    expect(
      publicProductSchema.safeParse({
        id: 'ae52d924-4dd6-4b8e-bd05-20da31a98f02',
        type: 'friend_roast',
        name: 'Música da Resenha',
        priceCents: 4990,
        active: true,
      }).success,
    ).toBe(false);
    expect(
      publicOrderSchema.safeParse({
        publicId: 'order-demo-123',
        productType: 'friend_roast',
        status: 'draft',
        priceCents: 4990,
        createdAt: '2026-09-04T12:00:00.000Z',
        accessTokenHash: 'secret',
      }).success,
    ).toBe(false);
  });

  it('keeps creation and checkout responses free of internal identifiers', () => {
    expect(createOrderResponseSchema.parse({ publicId: 'order-demo-123' })).toEqual({
      publicId: 'order-demo-123',
    });
    expect(
      checkoutResponseSchema.parse({ checkoutUrl: '/pedido/order-demo-123', dev: true }),
    ).toEqual({ checkoutUrl: '/pedido/order-demo-123', dev: true });
    expect(
      checkoutResponseSchema.safeParse({
        paymentId: 'ae52d924-4dd6-4b8e-bd05-20da31a98f02',
        checkoutUrl: '/pedido/order-demo-123',
      }).success,
    ).toBe(false);
  });
});
