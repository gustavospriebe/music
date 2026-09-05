import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
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

export type MercadoPagoPreferenceInput = {
  title: string;
  priceCents: number;
  externalReference: string;
  backUrl: string;
};
export type MercadoPagoPayment = {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  externalReference: string | null;
};
export type MercadoPagoProvider = {
  createPreference: (
    input: MercadoPagoPreferenceInput,
  ) => Promise<{ id: string; initPoint: string }>;
  getPayment: (paymentId: string) => Promise<MercadoPagoPayment>;
};

const requireMercadoPagoToken = (env: Env): string => {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN)
    throw new Error('Defina MERCADO_PAGO_ACCESS_TOKEN para usar o Mercado Pago.');
  return env.MERCADO_PAGO_ACCESS_TOKEN;
};

export const createMercadoPagoProvider = (env: Env): MercadoPagoProvider => ({
  createPreference: async (input) => {
    const token = requireMercadoPagoToken(env);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({
          items: [
            {
              id: input.externalReference,
              title: input.title,
              quantity: 1,
              currency_id: 'BRL',
              unit_price: input.priceCents / 100,
            },
          ],
          external_reference: input.externalReference,
          notification_url: env.MERCADO_PAGO_WEBHOOK_URL,
          back_urls: {
            success: input.backUrl,
            pending: input.backUrl,
            failure: input.backUrl,
          },
          auto_return: 'approved',
          statement_descriptor: 'MUSICARESENHA',
        }),
      });
      if (!response.ok) throw new Error(`Mercado Pago preference failed (${response.status})`);
      const body = (await response.json()) as { id?: string; init_point?: string };
      if (!body.id || !body.init_point)
        throw new Error('Mercado Pago preference response is missing init_point.');
      return { id: body.id, initPoint: body.init_point };
    } finally {
      clearTimeout(timeout);
    }
  },
  getPayment: async (paymentId) => {
    const token = requireMercadoPagoToken(env);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
        { method: 'GET', signal: controller.signal, headers: { authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error(`Mercado Pago payment lookup failed (${response.status})`);
      const body = (await response.json()) as {
        id?: number | string;
        status?: string;
        transaction_amount?: number;
        currency_id?: string;
        external_reference?: string;
      };
      return {
        id: String(body.id ?? paymentId),
        status: body.status ?? 'unknown',
        amountCents: Math.round((body.transaction_amount ?? 0) * 100),
        currency: body.currency_id ?? 'BRL',
        externalReference: body.external_reference ?? null,
      };
    } finally {
      clearTimeout(timeout);
    }
  },
});

/** Mercado Pago assina `id:<dataId>;request-id:<requestId>;ts:<ts>;` com HMAC-SHA256 do secret. */
export const verifyMercadoPagoSignature = (input: {
  signatureHeader: string | undefined;
  requestId: string | undefined;
  dataId: string;
  secret: string;
}): boolean => {
  const { signatureHeader, requestId, dataId, secret } = input;
  if (!signatureHeader || !requestId) return false;
  const parts = new Map(
    signatureHeader.split(',').map((chunk) => {
      const [key, ...rest] = chunk.trim().split('=');
      return [key ?? '', rest.join('=')];
    }),
  );
  const ts = parts.get('ts');
  const v1 = parts.get('v1');
  if (!ts || !v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId.toLowerCase()};ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  const actual = Buffer.from(expected, 'utf8');
  const received = Buffer.from(v1, 'utf8');
  return actual.length === received.length && timingSafeEqual(actual, received);
};

export type StorageProvider = {
  put: (
    key: string,
    data: Buffer,
    mime: string,
  ) => Promise<{ key: string; size: number; mime: string }>;
  get: (key: string) => Promise<Buffer>;
  delete: (key: string) => Promise<void>;
};
export const createLocalStorage = (basePath: string): StorageProvider => ({
  put: async (key, data, mime) => {
    const safe = key.replace(/[^a-zA-Z0-9._/-]/g, '_');
    const root = resolve(basePath);
    const target = resolve(root, safe);
    if (relative(root, target).startsWith('..')) throw new Error('Invalid storage key');
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, data);
    return { key: safe, size: data.length, mime };
  },
  get: async (key) => {
    const root = resolve(basePath);
    const target = resolve(root, key);
    if (relative(root, target).startsWith('..')) throw new Error('Invalid storage key');
    return readFile(target);
  },
  delete: async (key) => {
    const root = resolve(basePath);
    const target = resolve(root, key);
    if (relative(root, target).startsWith('..')) throw new Error('Invalid storage key');
    await rm(target, { force: true });
  },
});

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
