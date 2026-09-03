import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { generatedLyricsSchema, type GeneratedLyrics, type Story } from '@resenha/contracts';
import type { Env } from './env.js';

export type LyricsProvider = {
  generate: (story: Story, feedback?: string) => Promise<GeneratedLyrics>;
};

export const createOpenRouterLyricsProvider = (env: Env): LyricsProvider => ({
  generate: async (story, feedback) => {
    if (!env.OPENROUTER_API_KEY || !env.OPENROUTER_TEXT_MODEL)
      throw new Error('Defina OPENROUTER_API_KEY e OPENROUTER_TEXT_MODEL para gerar letras.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
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
          model: env.OPENROUTER_TEXT_MODEL,
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
        choices?: Array<{ message?: { content?: string } }>;
      };
      return generatedLyricsSchema.parse(JSON.parse(body.choices?.[0]?.message?.content ?? ''));
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
});
