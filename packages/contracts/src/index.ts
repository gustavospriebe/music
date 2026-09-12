import { z } from 'zod';

const conciseText = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum);
const optionalText = (maximum: number) => conciseText(1, maximum).optional();

export const productTypeSchema = z.literal('custom_song');
export type ProductType = z.infer<typeof productTypeSchema>;

export const orderStatusSchema = z.enum([
  'draft',
  'story_completed',
  'lyrics_generating',
  'lyrics_ready',
  'lyrics_approved',
  'payment_pending',
  'paid',
  'audio_queued',
  'audio_generating',
  'review_required',
  'delivered',
  'revision_requested',
  'failed',
  'refunded',
  'cancelled',
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const storySchemaVersion = 2;
export const voiceSchema = z.enum(['male', 'female', 'duet', 'either']);

export const creativeBriefSchema = z.object({
  productType: productTypeSchema,
  subjectName: conciseText(1, 120),
  pronunciation: optionalText(120),
  intention: z.enum(['amizade', 'amor', 'presente', 'homenagem', 'livre']).default('livre'),
  occasion: z.string().trim().max(240).default(''),
  genre: conciseText(2, 80),
  voice: voiceSchema,
  mood: conciseText(2, 80),
  brief: conciseText(10, 3_000),
  facts: z.array(conciseText(2, 500)).max(5).default([]),
  catchphrases: z.array(conciseText(1, 160)).max(10).default([]),
  prohibitedTopics: z.array(conciseText(1, 160)).max(10).default([]),
  finalMessage: optionalText(500),
});
export type CreativeBrief = z.infer<typeof creativeBriefSchema>;
export const orderContactSchema = z.object({
  email: z.string().trim().email().max(320),
  name: conciseText(1, 120).nullable(),
  marketingAccepted: z.boolean(),
});
export const storySchema = creativeBriefSchema.extend({
  buyerName: optionalText(120),
  buyerEmail: z.string().trim().email().max(320),
  termsAccepted: z.literal(true),
  marketingAccepted: z.boolean().default(false),
  safetyConfirmed: z.literal(true),
  policyVersion: conciseText(1, 120),
});
/** Read models preserve absent evidence; they are not accepted as a new submission. */
export const readStorySchema = creativeBriefSchema.extend({
  buyerName: optionalText(120),
  buyerEmail: z.string().trim().email().max(320),
  marketingAccepted: z.boolean(),
  termsAccepted: z.boolean().optional(),
  policyVersion: conciseText(1, 120).optional(),
  marketingKnown: z.boolean().optional(),
  safetyConfirmed: z.boolean().optional(),
});
export type ReadStory = z.infer<typeof readStorySchema>;
export type ConsentEvidence = Pick<
  ReadStory,
  'termsAccepted' | 'policyVersion' | 'marketingKnown' | 'safetyConfirmed'
>;

export const revisionRequestSchema = z.object({ message: conciseText(1, 1_000) }).strict();

export type Story = z.infer<typeof storySchema>;

export const lyricsSectionSchema = z.object({
  type: z.enum(['intro', 'verse', 'pre_chorus', 'chorus', 'bridge', 'outro']),
  label: conciseText(1, 80),
  lyrics: conciseText(1, 2_000),
});
export const lyricsContentSchema = z.object({
  title: conciseText(1, 160),
  summary: conciseText(1, 500),
  language: z.literal('pt-BR'),
  musicalDirection: z.object({
    genre: conciseText(1, 80),
    mood: conciseText(1, 80),
    tempo: z.enum(['slow', 'medium', 'fast']),
    voice: voiceSchema,
    instrumentation: z.array(conciseText(1, 80)).min(1).max(12),
  }),
  pronunciationNotes: z
    .array(z.object({ term: conciseText(1, 120), pronunciation: conciseText(1, 120) }))
    .max(20),
  sections: z.array(lyricsSectionSchema).max(16),
  fullLyrics: conciseText(1, 7_000),
  safetyNotes: z.array(conciseText(1, 240)).max(20),
});
export type LyricsContent = z.infer<typeof lyricsContentSchema>;
export const generatedLyricsSchema = lyricsContentSchema
  .extend({
    sections: z.array(lyricsSectionSchema).min(3).max(16),
  })
  .refine((lyrics) => lyrics.sections.some((section) => section.type === 'chorus'), {
    message: 'A letra gerada precisa de refrão.',
    path: ['sections'],
  });
export type GeneratedLyrics = z.infer<typeof generatedLyricsSchema>;

export const publicIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,32}$/);
export const uuidSchema = z.string().uuid();
export const createOrderSchema = z.object({
  productType: z.literal('custom_song'),
  /** Random UUID scoped to one submission attempt; persisted only as a hash. */
  creationKey: uuidSchema,
  /** Random per-browser UUID (no PII); links pre-order beacons to the order. */
  visitorId: uuidSchema.optional(),
});
export const createOrderResponseSchema = z.object({ publicId: publicIdSchema }).strict();
export const publicProductSchema = z
  .object({
    type: productTypeSchema,
    name: conciseText(1, 120),
    priceCents: z.number().int().nonnegative(),
    active: z.boolean(),
  })
  .strict();
export type PublicProduct = z.infer<typeof publicProductSchema>;
export const publicOrderSchema = z
  .object({
    publicId: publicIdSchema,
    productType: productTypeSchema,
    status: orderStatusSchema,
    priceCents: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
  })
  .strict();
export const checkoutResponseSchema = z
  .object({
    checkoutUrl: z.string().trim().min(1),
    dev: z.literal(true).optional(),
  })
  .strict();
export const beaconEventSchema = z.object({
  event: z.enum(['landing_view', 'form_started', 'form_completed']),
  visitorId: uuidSchema,
  productType: productTypeSchema.optional(),
});
export const lyricsRefinementSchema = z
  .object({
    instructions: conciseText(3, 1_000),
    baseVersion: z.number().int().positive(),
  })
  .strict();
export const generateLyricsSchema = z
  .union([z.object({}).strict(), lyricsRefinementSchema])
  .default({});
export const lyricsGenerateAcceptedSchema = z
  .object({
    accepted: z.literal(true),
    status: z.literal('lyrics_generating'),
  })
  .strict();
export type LyricsGenerateAccepted = z.infer<typeof lyricsGenerateAcceptedSchema>;
export const lyricsJobPayloadSchema = z
  .object({
    targetVersion: z.number().int().positive().max(2_147_483_647),
    refinement: lyricsRefinementSchema.optional(),
  })
  .strict();
export type LyricsJobPayload = z.infer<typeof lyricsJobPayloadSchema>;
export const audioJobPayloadSchema = z
  .object({
    productionId: uuidSchema,
    variant: z.union([z.literal(1), z.literal(2)]).optional(),
    provider: z.enum(['openrouter', 'google']).optional(),
    model: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
export type AudioJobPayload = z.infer<typeof audioJobPayloadSchema>;
export const coverJobPayloadSchema = z
  .object({
    attempt: z.union([z.literal(1), z.literal(2)]),
  })
  .strict();
export type CoverJobPayload = z.infer<typeof coverJobPayloadSchema>;
export const notifyJobPayloadSchema = z.object({}).strict();
export type NotifyJobPayload = z.infer<typeof notifyJobPayloadSchema>;
export const generationJobTypeSchema = z.enum([
  'generate_lyrics',
  'generate_audio',
  'generate_cover',
  'deliver_notify',
]);
export type GenerationJobType = z.infer<typeof generationJobTypeSchema>;
export const approveLyricsSchema = z.object({ content: lyricsContentSchema.optional() }).strict();
export const deliveryAccessSchema = z.object({}).strict();
export const coverStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);
export type CoverStatus = z.infer<typeof coverStatusSchema>;
export const createAlbumCoverSchema = z.object({}).strict();
export const publicAlbumCoverSchema = z
  .object({
    status: coverStatusSchema,
    attempt: z.number().int().min(1).max(2),
    canRegenerate: z.boolean(),
    hasReference: z.boolean(),
    createdAt: z.string().datetime(),
    downloadUrl: z.string().startsWith('/api/v1/').optional(),
  })
  .strict();
export type PublicAlbumCover = z.infer<typeof publicAlbumCoverSchema>;
export const albumCoverResponseSchema = z
  .object({ available: z.boolean(), cover: publicAlbumCoverSchema.nullable() })
  .strict();
export const adminOrdersQuerySchema = z.object({
  attention: z.literal('failures').optional(),
  status: orderStatusSchema.optional(),
  productType: productTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().trim().min(1).max(32).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});
export const adminLoginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(1_024),
});
export const adminResolveAiCallSchema = z
  .object({
    acknowledgeDuplicateCost: z.literal(true),
    note: conciseText(3, 1_000),
  })
  .strict();
export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), requestId: z.string().optional() }),
});
