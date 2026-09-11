import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { GeneratedLyrics, OrderStatus, Story } from '@resenha/contracts';

const transitions: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  draft: ['story_completed', 'cancelled'],
  story_completed: ['lyrics_generating', 'lyrics_ready', 'cancelled'],
  lyrics_generating: ['lyrics_ready', 'failed'],
  lyrics_ready: ['lyrics_generating', 'lyrics_approved', 'cancelled'],
  lyrics_approved: ['lyrics_ready', 'payment_pending', 'cancelled'],
  payment_pending: ['paid', 'cancelled'],
  paid: ['audio_queued'],
  audio_queued: ['audio_generating'],
  audio_generating: ['review_required', 'delivered', 'failed'],
  review_required: ['delivered', 'failed'],
  delivered: ['revision_requested', 'refunded'],
  revision_requested: ['audio_queued', 'cancelled'],
  failed: ['lyrics_generating', 'lyrics_ready', 'audio_queued', 'cancelled'],
  refunded: [],
  cancelled: [],
};

export const orderTransitions = transitions;
export const canTransition = (from: OrderStatus, to: OrderStatus) => transitions[from].includes(to);
export class InvalidOrderTransitionError extends Error {
  public constructor(from: OrderStatus, to: OrderStatus) {
    super(`Invalid order transition: ${from} -> ${to}`);
    this.name = 'InvalidOrderTransitionError';
  }
}
export const assertTransition = (from: OrderStatus, to: OrderStatus): void => {
  if (!canTransition(from, to)) throw new InvalidOrderTransitionError(from, to);
};

export const basePriceCents = 4_990;
export const calculatePriceCents = (
  baseCents: number,
  additionsCents: readonly number[] = [],
): number => {
  if (
    !Number.isSafeInteger(baseCents) ||
    baseCents < 0 ||
    additionsCents.some((value) => !Number.isSafeInteger(value) || value < 0)
  ) {
    throw new Error('Price must use non-negative integer cents.');
  }
  return additionsCents.reduce((total, value) => total + value, baseCents);
};

export const hashToken = (token: string, pepper: string): string =>
  createHash('sha256').update(`${pepper}:${token}`).digest('hex');
export const stableDeliveryToken = (deliveryId: string, pepper: string): string =>
  createHmac('sha256', pepper).update(`delivery:v1:${deliveryId}`).digest('base64url');

export const createAccessToken = (): string => randomBytes(32).toString('base64url');
export const verifyToken = (token: string, expectedHash: string, pepper: string): boolean => {
  const actual = Buffer.from(hashToken(token, pepper), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export type ContentAssessment =
  { allowed: true } | { allowed: false; reason: string; category: ContentCategory };
export type ContentCategory =
  | 'threat'
  | 'severe_humiliation'
  | 'hate'
  | 'criminal_accusation'
  | 'intimate_data'
  | 'sexual_content'
  | 'minors'
  | 'voice_imitation'
  | 'copyright'
  | 'impersonation';
const unsafePatterns: ReadonlyArray<{ category: ContentCategory; pattern: RegExp }> = [
  {
    category: 'threat',
    pattern: /\b(vou|vamos|quero|precisa)\s+(te\s+)?(matar|bater|agredir|machucar)|amea[cç]/i,
  },
  {
    category: 'severe_humiliation',
    pattern: /\b(humilh[ae]|destruir a vida|acabar com a vida|linch)/i,
  },
  {
    category: 'hate',
    pattern: /\b(racista|racismo|nazista|ódio contra|homof[oó]bic|transf[oó]bic|xenof[oó]bic)/i,
  },
  {
    category: 'criminal_accusation',
    pattern: /\b(ladr[aã]o|estuprador|ped[oó]fil|criminoso|assassin[oa])\b/i,
  },
  {
    category: 'intimate_data',
    pattern: /\b(cpf|rg|senha|endereço|endereco|telefone|nude|foto íntima|foto intima)\b/i,
  },
  { category: 'sexual_content', pattern: /\b(sexo|sexualiz|porn[oô]|transar|pelad[oa])\b/i },
  {
    category: 'minors',
    pattern: /\b(menor de idade|crian[cç]a|adolescente)\b.*\b(sexo|sexual|nude|pelad)/i,
  },
  {
    category: 'voice_imitation',
    pattern: /\b(imite|imitar|clone|clonar)\b.{0,80}\b(voz|cantor|cantora|artista)\b/i,
  },
  {
    category: 'copyright',
    pattern:
      /\b(copie|copiar|igualzinha?|igual)\b.{0,80}\b(m[uú]sica|letra|can[cç][aã]o)\b|\b(letra da m[uú]sica|m[uú]sica conhecida|can[cç][aã]o conhecida)\b/i,
  },
  {
    category: 'impersonation',
    pattern: /\b(se passar por|passar como|oficial do|oficial da|clube oficial|empresa oficial)\b/i,
  },
];
const contentReasons: Readonly<Record<ContentCategory, string>> = {
  threat: 'Não podemos criar conteúdo com ameaça ou violência direcionada.',
  severe_humiliation: 'Não podemos criar conteúdo de humilhação direcionada severa.',
  hate: 'Não podemos criar conteúdo de ódio ou discriminação.',
  criminal_accusation: 'Não podemos criar acusações criminais sobre uma pessoa.',
  intimate_data: 'Remova dados íntimos ou pessoais sensíveis antes de continuar.',
  sexual_content: 'Não podemos criar conteúdo sexual direcionado.',
  minors: 'Não podemos criar conteúdo sexual envolvendo menores.',
  voice_imitation: 'Não oferecemos imitação ou clonagem de voz.',
  copyright: 'Não podemos copiar ou imitar letras e músicas conhecidas.',
  impersonation: 'Não podemos ajudar a se passar por uma entidade ou pessoa.',
};
export const evaluateContent = (input: string): ContentAssessment => {
  const match = unsafePatterns.find(({ pattern }) => pattern.test(input));
  return match
    ? { allowed: false, category: match.category, reason: contentReasons[match.category] }
    : { allowed: true };
};

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
const isRepresented = (text: string, value: string): boolean => {
  const normalizedValue = normalize(value);
  if (normalizedValue.length < 3) return true;
  return text.includes(normalizedValue);
};
export const validateLyrics = (lyrics: GeneratedLyrics, story: Story): string[] => {
  const errors: string[] = [];
  const fullLyrics = normalize(lyrics.fullLyrics);
  if (!fullLyrics) errors.push('A letra não pode estar vazia.');
  if (story.productType !== 'custom_song' && !isRepresented(fullLyrics, story.subjectName))
    errors.push('O nome principal não aparece na letra.');
  if (!lyrics.sections.some((section) => section.type === 'chorus'))
    errors.push('A letra precisa de refrão.');
  if (lyrics.sections.length < 3) errors.push('A letra precisa ter pelo menos três seções.');
  if (lyrics.fullLyrics.length > 7_000)
    errors.push('A letra ultrapassa o tamanho máximo permitido.');
  if (
    story.facts.some((fact) =>
      story.productType === 'custom_song'
        ? !fullLyrics.includes(normalize(fact))
        : !isRepresented(fullLyrics, fact),
    )
  )
    errors.push('A letra não representa todos os fatos obrigatórios.');
  if (story.prohibitedTopics.some((term) => isRepresented(fullLyrics, term)))
    errors.push('A letra contém um assunto proibido.');
  return errors;
};

export const makeMusicPrompt = (lyrics: GeneratedLyrics): string => {
  // Sem linhas extras de contexto: o classificador de segurança de áudio do provedor é
  // probabilístico e instruções como notas de pronúncia disparam falsos positivos
  // de PROHIBITED_CONTENT. A pronúncia fica apenas na letra (que o modelo lê em pt-BR).
  return [
    'Crie uma música original em português brasileiro com duração aproximada de dois minutos.',
    `Gênero: ${lyrics.musicalDirection.genre}. Clima: ${lyrics.musicalDirection.mood}. Andamento: ${lyrics.musicalDirection.tempo}.`,
    `Voz: ${lyrics.musicalDirection.voice}. Instrumentação: ${lyrics.musicalDirection.instrumentation.join(', ')}.`,
    'Música 100% original; interprete exatamente a letra fornecida, sem alterar palavras.',
    `Letra aprovada:\n${lyrics.fullLyrics}`,
  ].join('\n');
};
/** Append-only AI cost ledger: one row per provider call. `rejected` passed the provider but failed local validation (still billed). */
export const aiUsageKinds = ['lyrics', 'audio', 'album_cover'] as const;
export type AiUsageKind = (typeof aiUsageKinds)[number];
export const aiUsageStatuses = ['ok', 'blocked', 'error', 'rejected'] as const;
export type AiUsageStatus = (typeof aiUsageStatuses)[number];
export type AiUsageSample = {
  requestId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Decimal USD string as reported by the provider (`usage.cost`); never converted. */
  costUsd: string | null;
  latencyMs: number;
};
export const sanitizeAiError = (error: unknown): string =>
  (error instanceof Error ? error.message : 'unknown provider error')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 500);

export const retryDelayMs = (
  attempt: number,
  baseDelayMs = 1_000,
  maxDelayMs = 60_000,
  random: () => number = Math.random,
): number => {
  if (!Number.isInteger(attempt) || attempt < 1)
    throw new Error('Attempt must be a positive integer.');
  const capped = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return Math.round(capped * (0.75 + random() * 0.5));
};
