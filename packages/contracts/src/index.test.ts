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
  creativeBriefSchema,
  readStorySchema,
  lyricsContentSchema,
  generatedLyricsSchema,
  lyricsJobPayloadSchema,
  audioJobPayloadSchema,
  adminResolveAiCallSchema,
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
  policyVersion: 'draft-v1',
};

describe('storySchema', () => {
  it('accepts a complete custom song and applies list defaults', () => {
    const story = storySchema.parse({
      ...common,
      productType: 'custom_song',
      brief: 'Uma canção de aniversário para a Bia, com a turma toda cantando junto.',
      safetyConfirmed: true,
    });
    expect(story.catchphrases).toEqual([]);
    expect(story.productType).toBe('custom_song');
    expect(story.intention).toBe('livre');
  });

  it('requires safety confirmation', () => {
    const result = storySchema.safeParse({
      ...common,
      productType: 'custom_song',
      brief: 'Uma canção de aniversário para a Bia, com a turma toda cantando junto.',
      safetyConfirmed: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects oversized and blank mandatory answers', () => {
    const result = storySchema.safeParse({
      ...common,
      subjectName: ' ',
      productType: 'custom_song',
      brief: 'Uma canção de aniversário para a Bia, com a turma toda cantando junto.',
      safetyConfirmed: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('public order contracts', () => {
  it('requires an idempotency UUID for order creation', () => {
    expect(
      createOrderSchema.safeParse({ productType: 'custom_song', creationKey: 'repeat-me' }).success,
    ).toBe(false);
    expect(
      createOrderSchema.safeParse({
        productType: 'friend_roast',
        creationKey: '51cc3b09-2902-42cf-9071-70f078d36cd7',
      }).success,
    ).toBe(false);
    expect(
      createOrderSchema.parse({
        productType: 'custom_song',
        creationKey: '51cc3b09-2902-42cf-9071-70f078d36cd7',
      }),
    ).toEqual({
      productType: 'custom_song',
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
        type: 'custom_song',
        name: 'Sua música',
        priceCents: 4990,
        active: true,
      }),
    ).toEqual({
      type: 'custom_song',
      name: 'Sua música',
      priceCents: 4990,
      active: true,
    });
    expect(
      publicProductSchema.safeParse({
        id: 'ae52d924-4dd6-4b8e-bd05-20da31a98f02',
        type: 'custom_song',
        name: 'Sua música',
        priceCents: 4990,
        active: true,
      }).success,
    ).toBe(false);
    expect(
      publicOrderSchema.safeParse({
        publicId: 'order-demo-123',
        productType: 'custom_song',
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
  policyVersion: 'draft-v1',
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
});

describe('audit remediation intake boundaries', () => {
  it('pins the generated lyric version before any provider call', () => {
    const refinement = { instructions: 'Mais emoção', baseVersion: 2 };
    expect(lyricsJobPayloadSchema.parse({ targetVersion: 3, refinement })).toEqual({
      targetVersion: 3,
      refinement,
    });
    for (const targetVersion of [undefined, 0, -1, 1.5, '3', 2_147_483_648])
      expect(lyricsJobPayloadSchema.safeParse({ targetVersion }).success).toBe(false);
  });
  it('requires explicit duplicate-cost acknowledgement and an audit note', () => {
    expect(
      adminResolveAiCallSchema.parse({
        acknowledgeDuplicateCost: true,
        note: '  Conferido no provedor  ',
      }),
    ).toEqual({ acknowledgeDuplicateCost: true, note: 'Conferido no provedor' });
    for (const input of [
      { note: 'Conferido no provedor' },
      { acknowledgeDuplicateCost: false, note: 'Conferido no provedor' },
      { acknowledgeDuplicateCost: true, note: '  ' },
      { acknowledgeDuplicateCost: true, note: 'Conferido', extra: true },
    ])
      expect(adminResolveAiCallSchema.safeParse(input).success).toBe(false);
  });
  it('requires an explicit policy version for a new acceptance', () => {
    expect(storySchema.safeParse({ ...freeIdea, policyVersion: undefined }).success).toBe(false);
    expect(storySchema.safeParse({ ...freeIdea, policyVersion: ' ' }).success).toBe(false);
    expect(storySchema.parse(freeIdea).policyVersion).toBe('draft-v1');
  });
  it('keeps contact and all consent fields outside the creative provider input', () => {
    const brief = creativeBriefSchema.parse({
      ...freeIdea,
      buyerName: 'Comprador',
      marketingAccepted: true,
    });
    expect(brief.brief).toBe(freeIdea.brief);
    for (const field of [
      'buyerEmail',
      'buyerName',
      'termsAccepted',
      'marketingAccepted',
      'safetyConfirmed',
      'policyVersion',
    ])
      expect(brief).not.toHaveProperty(field);
  });
  it('reads historical stories without manufacturing positive acceptance', () => {
    const read = readStorySchema.parse({
      ...creativeBriefSchema.parse(freeIdea),
      buyerEmail: freeIdea.buyerEmail,
      marketingAccepted: false,
    });
    expect(read).not.toHaveProperty('termsAccepted');
    expect(read).not.toHaveProperty('marketingKnown');
    expect(read).not.toHaveProperty('policyVersion');
    expect(storySchema.safeParse(read).success).toBe(false);
  });
  it('requires a production reference for an audio job', () => {
    expect(audioJobPayloadSchema.safeParse({ provider: 'google' }).success).toBe(false);
    expect(
      audioJobPayloadSchema.parse({
        productionId: '651aa69d-f879-4ac4-9044-6d4d4d63a4fa',
        variant: 2,
      }),
    ).toEqual({ productionId: '651aa69d-f879-4ac4-9044-6d4d4d63a4fa', variant: 2 });
  });
  it('permits free edited lyrics but requires structure from the generation provider', () => {
    const content = {
      title: 'Uma canção',
      summary: 'Uma viagem',
      language: 'pt-BR',
      musicalDirection: {
        genre: 'MPB',
        mood: 'Calmo',
        tempo: 'medium',
        voice: 'either',
        instrumentation: ['Violão'],
      },
      pronunciationNotes: [],
      sections: [],
      fullLyrics: 'Uma estrada aberta\nUm novo amanhecer',
      safetyNotes: [],
    };
    expect(lyricsContentSchema.parse(content).fullLyrics).toBe(content.fullLyrics);
    expect(generatedLyricsSchema.safeParse(content).success).toBe(false);
    expect(
      generatedLyricsSchema.safeParse({
        ...content,
        sections: [1, 2, 3].map((n) => ({
          type: 'verse',
          label: `Verso ${n}`,
          lyrics: 'Versos livres',
        })),
      }).success,
    ).toBe(false);
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
