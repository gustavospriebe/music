import { describe, expect, it } from 'vitest';
import {
  albumCoverResponseSchema,
  checkoutResponseSchema,
  createOrderResponseSchema,
  createOrderSchema,
  generateLyricsSchema,
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

describe('album cover contract', () => {
  it('accepts only the public cover fields and two product attempts', () => {
    const response = {
      available: true,
      cover: {
        status: 'completed',
        attempt: 1,
        canRegenerate: true,
        hasReference: false,
        createdAt: '2026-09-04T12:00:00.000Z',
        downloadUrl: '/api/v1/orders/order-demo-123/cover/download',
      },
    };
    expect(albumCoverResponseSchema.parse(response)).toEqual(response);
    expect(
      albumCoverResponseSchema.safeParse({
        ...response,
        cover: { ...response.cover, id: 'ae52d924-4dd6-4b8e-bd05-20da31a98f02' },
      }).success,
    ).toBe(false);
    expect(
      albumCoverResponseSchema.safeParse({
        ...response,
        cover: { ...response.cover, attempt: 3 },
      }).success,
    ).toBe(false);
  });
});

describe('custom song intake', () => {
  it('accepts a single creative anchor without invented roast fields', () => {
    const input = {
      ...common,
      productType: 'custom_song',
      brief: 'Uma canção sobre viajar pelo mundo',
      facts: ['Um trem cruza a serra'],
      safetyConfirmed: true,
    };
    const story = storySchema.parse(input);
    expect(story).toMatchObject({
      productType: 'custom_song',
      brief: input.brief,
      facts: input.facts,
    });
    expect(story).not.toHaveProperty('relationship');
    expect(storySchema.safeParse({ ...input, brief: 'curto' }).success).toBe(false);
    expect(storySchema.safeParse({ ...input, brief: 'a'.repeat(3001) }).success).toBe(false);
    expect(storySchema.parse({ ...input, facts: [] }).facts).toEqual([]);
    expect(storySchema.safeParse({ ...input, safetyConfirmed: false }).success).toBe(false);
  });
});

const freeIdea = {
  buyerEmail: 'cliente@example.test',
  subjectName: 'Uma viagem',
  genre: 'MPB',
  voice: 'either',
  mood: 'Calmo',
  productType: 'custom_song',
  brief: 'Uma canção sobre encontros pelo caminho',
  safetyConfirmed: true,
  termsAccepted: true,
};

describe('intention and optional occasion are independent', () => {
  it.each(['amizade', 'amor', 'presente', 'homenagem', 'livre'])(
    'keeps %s without manufacturing an occasion',
    (intention) => {
      const parsed = storySchema.parse({ ...freeIdea, intention });
      expect(parsed).toMatchObject({ intention, occasion: '', brief: freeIdea.brief });
    },
  );
  it('defaults legacy custom drafts to a free intention and permits a blank occasion', () => {
    expect(storySchema.parse({ ...freeIdea, occasion: '  ' })).toMatchObject({
      intention: 'livre',
      occasion: '',
    });
    expect(
      storySchema.parse({
        ...freeIdea,
        intention: 'amizade',
        occasion: '  Aniversário de 30 anos  ',
      }),
    ).toMatchObject({ intention: 'amizade', occasion: 'Aniversário de 30 anos' });
    expect(storySchema.safeParse({ ...freeIdea, occasion: 'x'.repeat(241) }).success).toBe(false);
    expect(storySchema.safeParse({ ...freeIdea, intention: 'unsupported' }).success).toBe(false);
  });
  it('keeps occasion required for the legacy friend-roast product', () => {
    const legacy = {
      ...common,
      productType: 'friend_roast',
      relationship: 'Amiga',
      traits: ['Engraçada'],
      biggestStory: 'A viagem para a praia',
      roastLevel: 'light',
      safetyConfirmed: true,
    };
    expect(storySchema.safeParse({ ...legacy, occasion: '' }).success).toBe(false);
    expect(storySchema.safeParse({ ...legacy, occasion: undefined }).success).toBe(false);
    expect(storySchema.parse(legacy).occasion).toBe('Aniversário');
  });
});

describe('generateLyricsSchema', () => {
  it('preserves bodyless generation and requires a complete explicit refinement', () => {
    expect(generateLyricsSchema.parse(undefined)).toEqual({});
    expect(generateLyricsSchema.parse({})).toEqual({});
    expect(generateLyricsSchema.parse({ instructions: '  Mais emoção  ', baseVersion: 2 })).toEqual(
      { instructions: 'Mais emoção', baseVersion: 2 },
    );
    for (const invalid of [
      { instructions: 'ab', baseVersion: 1 },
      { instructions: 'x'.repeat(1001), baseVersion: 1 },
      { instructions: 'Mais emoção' },
      { baseVersion: 1 },
      { instructions: 'Mais emoção', baseVersion: 1.5 },
      { unrelated: true },
    ])
      expect(generateLyricsSchema.safeParse(invalid).success).toBe(false);
  });
});
