import { timingSafeEqual } from 'node:crypto';
import { generatedLyricsSchema, type GeneratedLyrics, type Story } from '@resenha/contracts';
import type { Env } from './env.js';

import type { AiUsageSample } from '@resenha/domain';
import sharp from 'sharp';

export type LyricsResult = { lyrics: GeneratedLyrics; usage: AiUsageSample };
export type LyricsProvider = {
  generate: (story: Story, feedback?: string) => Promise<LyricsResult>;
};

export const createOpenRouterLyricsProvider = (env: Env): LyricsProvider => ({
  generate: async (story, feedback) => {
    if (!env.OPENROUTER_API_KEY || !env.OPENROUTER_TEXT_MODEL)
      throw new Error('Defina OPENROUTER_API_KEY e OPENROUTER_TEXT_MODEL para gerar letras.');
    const model = env.OPENROUTER_TEXT_MODEL;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const startedAt = Date.now();
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'content-type': 'application/json',
          'http-referer': env.WEB_URL,
          'x-title': 'Musica da Resenha',
        },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: [
                'Você escreve letras de música originais em português do Brasil a partir de histórias reais.',
                'Responda SOMENTE com um objeto JSON no formato exato:',
                '{"title":string,"summary":string,"language":"pt-BR","musicalDirection":{"genre":string,"mood":string,"tempo":"slow"|"medium"|"fast","voice":"male"|"female"|"duet"|"either","instrumentation":string[]},"pronunciationNotes":[{"term":string,"pronunciation":string}],"sections":[{"type":"intro"|"verse"|"pre_chorus"|"chorus"|"bridge"|"outro","label":string,"lyrics":string}],"fullLyrics":string,"safetyNotes":string[]}',
                'Regras obrigatórias: 3 a 16 seções incluindo pelo menos um "chorus"; o nome principal (subjectName) deve aparecer literalmente na letra; TODOS os itens de facts devem aparecer em fullLyrics com as MESMAS PALAVRAS (copie cada fato literalmente em um verso, você pode rimar ao redor, nunca parafraseie); use o genre, mood e voice informados na história; não imite artistas, não invente fatos, não inclua assuntos proibidos; fullLyrics é a letra completa com quebras de linha.',
              ].join('\n'),
            },
            { role: 'user', content: JSON.stringify(story) },
            ...(feedback
              ? [
                  {
                    role: 'user' as const,
                    content: `Sua resposta anterior falhou na verificação automática: ${feedback}. Gere outra resposta em JSON no formato exato corrigindo todos os problemas, copiando cada fato literalmente da lista facts.`,
                  },
                ]
              : []),
          ],
        }),
      });
      if (!response.ok) throw new Error(`OpenRouter lyrics failed (${response.status})`);
      const body = (await response.json()) as {
        id?: string;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          cost?: number | string;
        };
        choices?: Array<{ message?: { content?: string } }>;
      };
      const lyrics = generatedLyricsSchema.parse(
        JSON.parse(body.choices?.[0]?.message?.content ?? ''),
      );
      return {
        lyrics,
        usage: {
          requestId: typeof body.id === 'string' ? body.id : null,
          model,
          inputTokens: body.usage?.prompt_tokens ?? 0,
          outputTokens: body.usage?.completion_tokens ?? 0,
          costUsd: body.usage?.cost === undefined ? null : String(body.usage.cost),
          latencyMs: Date.now() - startedAt,
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  },
});
export const createLyricsProvider = (env: Env) => createOpenRouterLyricsProvider(env);

export { createLocalStorage } from '@resenha/providers';

/**
 * AbacatePay (https://docs.abacatepay.com, base `https://api.abacatepay.com/v2`).
 * Cobrança hospedada: o valor vem do produto cadastrado no dashboard, então o
 * adapter confere `data.amount` contra o total do pedido e recusa divergência.
 * Webhook: autenticado pelo `?webhookSecret=` (comparação em tempo constante);
 * a falsificação é contida pela consulta do billing na API antes de marcar pago.
 */
export type AbacatePayCheckoutInput = {
  priceCents: number;
  externalReference: string;
  backUrl: string;
};
export type AbacatePayBilling = {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  externalReference: string | null;
};
export type AbacatePayProvider = {
  createCheckout: (input: AbacatePayCheckoutInput) => Promise<{ id: string; initPoint: string }>;
  getBilling: (billingId: string) => Promise<AbacatePayBilling>;
};

type AbacatePayBillingPayload = {
  id?: string;
  status?: string;
  amount?: number;
  externalId?: string | null;
  url?: string;
};

const abacatePayEnvelope = (body: unknown): AbacatePayBillingPayload => {
  const data = (body as { data?: AbacatePayBillingPayload; error?: string | null }).data;
  if (!data || typeof data !== 'object') throw new Error('AbacatePay response has no data.');
  return data;
};

export const createAbacatePayProvider = (env: Env): AbacatePayProvider => {
  const requireKey = (): string => {
    if (!env.ABACATEPAY_API_KEY)
      throw new Error('Defina ABACATEPAY_API_KEY para usar o AbacatePay.');
    return env.ABACATEPAY_API_KEY;
  };
  const requireProduct = (): string => {
    if (!env.ABACATEPAY_PRODUCT_ID)
      throw new Error('Defina ABACATEPAY_PRODUCT_ID para usar o AbacatePay.');
    return env.ABACATEPAY_PRODUCT_ID;
  };
  return {
    createCheckout: async (input) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      try {
        const response = await fetch('https://api.abacatepay.com/v2/checkouts/create', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${requireKey()}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            items: [{ id: requireProduct(), quantity: 1 }],
            externalId: input.externalReference,
            returnUrl: input.backUrl,
            completionUrl: input.backUrl,
            metadata: { order: input.externalReference },
          }),
        });
        if (!response.ok) throw new Error(`AbacatePay checkout failed (${response.status})`);
        const data = abacatePayEnvelope(await response.json());
        if (!data.id || !data.url) throw new Error('AbacatePay checkout response is missing url.');
        if (typeof data.amount !== 'number' || data.amount !== input.priceCents)
          throw new Error('AbacatePay checkout amount does not match the order total.');
        return { id: data.id, initPoint: data.url };
      } finally {
        clearTimeout(timeout);
      }
    },
    getBilling: async (billingId) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      try {
        const response = await fetch(
          `https://api.abacatepay.com/v2/checkouts/one?id=${encodeURIComponent(billingId)}`,
          {
            method: 'GET',
            signal: controller.signal,
            headers: { authorization: `Bearer ${requireKey()}` },
          },
        );
        if (!response.ok) throw new Error(`AbacatePay billing lookup failed (${response.status})`);
        const data = abacatePayEnvelope(await response.json());
        return {
          id: data.id ?? billingId,
          status: data.status ?? 'unknown',
          amountCents: typeof data.amount === 'number' ? data.amount : 0,
          currency: 'BRL',
          externalReference: data.externalId ?? null,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
};

/** Compara o `?webhookSecret=` com o secret cadastrado no dashboard, em tempo constante. */
const hasSecretValue = (value: string | undefined): value is string =>
  typeof value === 'string' && value.length > 0;

export const verifyAbacatePaySecret = (input: {
  received: string | undefined;
  expected: string | undefined;
}): boolean => {
  if (!hasSecretValue(input.received) || !hasSecretValue(input.expected)) return false;
  const actual = Buffer.from(input.received, 'utf8');
  const expected = Buffer.from(input.expected, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export const MAX_REFERENCE_IMAGE_BYTES = 8 * 1024 * 1024;

export const detectRasterMime = (
  bytes: Buffer,
): 'image/jpeg' | 'image/png' | 'image/webp' | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP'
  )
    return 'image/webp';
  return null;
};

export const normalizeReferenceImage = async (bytes: Buffer, declaredMime: string) => {
  if (!bytes.length || bytes.length > MAX_REFERENCE_IMAGE_BYTES)
    throw new Error('A foto deve ter no máximo 8 MB.');
  const detected = detectRasterMime(bytes);
  if (!detected || detected !== declaredMime)
    throw new Error('Envie uma foto JPEG, PNG ou WebP válida.');
  try {
    return await sharp(bytes, { limitInputPixels: 16_777_216 })
      .rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    throw new Error('Não foi possível validar a foto enviada.');
  }
};
