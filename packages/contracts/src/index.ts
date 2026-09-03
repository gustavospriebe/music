import { z } from 'zod';

const conciseText = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum);
const optionalText = (maximum: number) => conciseText(1, maximum).optional();

export const productTypeSchema = z.enum(['friend_roast', 'team_anthem', 'emotional_tribute']);
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

export const storySchemaVersion = 1;
export const voiceSchema = z.enum(['male', 'female', 'duet', 'either']);
export const roastLevelSchema = z.enum(['light', 'medium', 'strong']);

export const commonStorySchema = z.object({
  buyerName: optionalText(120),
  buyerEmail: z.string().trim().email().max(320),
  subjectName: conciseText(1, 120),
  pronunciation: optionalText(120),
  occasion: conciseText(2, 240),
  genre: conciseText(2, 80),
  voice: voiceSchema,
  mood: conciseText(2, 80),
  facts: z.array(conciseText(2, 500)).min(2).max(5),
  catchphrases: z.array(conciseText(1, 160)).max(10).default([]),
  prohibitedTopics: z.array(conciseText(1, 160)).max(10).default([]),
  finalMessage: optionalText(500),
  termsAccepted: z.literal(true),
  marketingAccepted: z.boolean().default(false),
});

export const friendRoastStorySchema = commonStorySchema.extend({
  productType: z.literal('friend_roast'),
  relationship: conciseText(2, 120),
  groupName: optionalText(120),
  traits: z.array(conciseText(1, 200)).min(1).max(5),
  biggestStory: conciseText(2, 500),
  insideJokes: z.array(conciseText(1, 200)).max(5).default([]),
  mentions: z.array(conciseText(1, 120)).max(10).default([]),
  roastLevel: roastLevelSchema,
  safetyConfirmed: z.literal(true),
});

export const teamAnthemStorySchema = commonStorySchema.extend({
  productType: z.literal('team_anthem'),
  location: conciseText(2, 120),
  colors: conciseText(2, 80),
  players: z.array(conciseText(1, 120)).min(1).max(20),
  greatestWin: conciseText(2, 300),
  biggestLoss: conciseText(2, 300),
  rival: optionalText(120),
  chant: optionalText(240),
  anthemStyle: z.enum(['epic', 'pagode', 'funk', 'rock', 'samba']),
  amateurConfirmed: z.literal(true),
});

export const emotionalTributeStorySchema = commonStorySchema.extend({
  productType: z.literal('emotional_tribute'),
  relationship: conciseText(2, 120),
  howMet: conciseText(2, 500),
  mostImportantMemory: conciseText(2, 500),
  gratitudeReason: conciseText(2, 500),
  milestone: conciseText(2, 500),
  desiredFeeling: conciseText(2, 120),
});

export const storySchema = z.discriminatedUnion('productType', [
  friendRoastStorySchema,
  teamAnthemStorySchema,
  emotionalTributeStorySchema,
]);
export type Story = z.infer<typeof storySchema>;

export const lyricsSectionSchema = z.object({
  type: z.enum(['intro', 'verse', 'pre_chorus', 'chorus', 'bridge', 'outro']),
  label: conciseText(1, 80),
  lyrics: conciseText(1, 2_000),
});
export const generatedLyricsSchema = z.object({
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
  sections: z.array(lyricsSectionSchema).min(3).max(16),
  fullLyrics: conciseText(1, 7_000),
  safetyNotes: z.array(conciseText(1, 240)).max(20),
});
export type GeneratedLyrics = z.infer<typeof generatedLyricsSchema>;

export const publicIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,32}$/);
export const uuidSchema = z.string().uuid();
export const createOrderSchema = z.object({
  productType: productTypeSchema,
  /** Random per-browser UUID (no PII); links pre-order beacons to the order. */
  visitorId: uuidSchema.optional(),
});
export const beaconEventSchema = z.object({
  event: z.enum(['landing_view', 'form_started', 'form_completed']),
  visitorId: uuidSchema,
  productType: productTypeSchema.optional(),
});
export const updateStorySchema = storySchema;
export const editLyricsSchema = generatedLyricsSchema;
export const approveLyricsSchema = z.object({ content: generatedLyricsSchema.optional() }).strict();
export const checkoutSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(180).optional(),
});
export const accessExchangeSchema = z.object({ token: z.string().min(32).max(256) });
export const deliveryAccessSchema = z.object({}).strict();
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export const adminOrdersQuerySchema = z.object({
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
export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), requestId: z.string().optional() }),
});
