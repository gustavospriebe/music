import type { AiUsageSample, AiUsageStatus } from '@resenha/domain';
import { AiProviderError, aiHttpError, reportedAiUsage, unknownAiUsage } from './ai-error.js';

export type MusicProviderName = 'openrouter' | 'google';
export type MusicGeneration = {
  bytes: Buffer;
  mime: string;
  externalId: string;
  usage: AiUsageSample;
};
export type MusicAttempt = { sample: AiUsageSample; status: AiUsageStatus; error: string | null };
export type MusicResult = { generation: MusicGeneration; attempts: MusicAttempt[] };
export type MusicProvider = {
  generate: (prompt: string, signal?: AbortSignal) => Promise<MusicResult>;
  provider?: MusicProviderName;
  model?: string;
};
export type SingOutcome =
  | { ok: true; bytes: Buffer; mime: string; externalId: string; usage: AiUsageSample }
  | { ok: false; error: AiProviderError; usage: AiUsageSample };

export const detectAudioMime = (bytes: Buffer): { mime: string; ext: string } => {
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WAVE'
  )
    return { mime: 'audio/wav', ext: 'wav' };
  if (
    bytes.subarray(0, 3).toString('latin1') === 'ID3' ||
    (bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)
  )
    return { mime: 'audio/mpeg', ext: 'mp3' };
  if (bytes.subarray(0, 4).toString() === 'OggS') return { mime: 'audio/ogg', ext: 'ogg' };
  return { mime: 'application/octet-stream', ext: 'bin' };
};
const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const MAX_AUDIO_BASE64 = 96_000_000;

export const generateMusicOnce = async (
  config: { apiKey: string; model: string; webUrl: string },
  prompt: string,
  signal?: AbortSignal,
): Promise<SingOutcome> => {
  const startedAt = Date.now();
  let usage = unknownAiUsage(config.model, startedAt);
  if (!config.apiKey || !config.model)
    throw new AiProviderError('AI_CONFIGURATION_MISSING', usage, 'failed');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);
  let externalId = '';
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
        'http-referer': config.webUrl,
        'x-title': 'Musica da Resenha',
      },
      body: JSON.stringify({
        model: config.model,
        modalities: ['text', 'audio'],
        audio: { format: 'wav' },
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw aiHttpError(response.status, unknownAiUsage(config.model, startedAt));
    }
    if (!response.body) throw new AiProviderError('AI_RESULT_UNKNOWN', usage, 'unknown');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let pending = '';
    let total = 0;
    let blocked = false;
    let upstreamFailed = false;
    const consume = (line: string) => {
      if (!line.startsWith('data:')) return;
      const text = line.slice(5).trim();
      if (!text || text === '[DONE]') return;
      let chunk: Record<string, unknown> | undefined;
      try {
        chunk = record(JSON.parse(text));
      } catch {
        return;
      }
      if (!chunk) return;
      if (typeof chunk.id === 'string' && chunk.id.length <= 160) externalId = chunk.id;
      const error = record(chunk.error);
      if (error) {
        upstreamFailed = true;
        blocked =
          blocked ||
          (typeof error.message === 'string' && /PROHIBITED_CONTENT/i.test(error.message));
      }
      const providerUsage = record(chunk.usage);
      if (providerUsage)
        usage = reportedAiUsage(config.model, startedAt, externalId, providerUsage);
      const choice = record(array(chunk.choices)[0]);
      const encoded =
        record(record(choice?.delta)?.audio)?.data ?? record(record(choice?.message)?.audio)?.data;
      if (typeof encoded === 'string') {
        total += encoded.length;
        if (total > MAX_AUDIO_BASE64)
          throw new AiProviderError('AI_INVALID_AUDIO', usage, 'rejected');
        chunks.push(encoded);
      }
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        if (pending.length > MAX_AUDIO_BASE64)
          throw new AiProviderError('AI_INVALID_RESPONSE', usage, 'unknown');
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) consume(line);
      }
      consume(pending);
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    usage = {
      ...usage,
      requestId: externalId || usage.requestId,
      latencyMs: Date.now() - startedAt,
    };
    if (blocked) throw new AiProviderError('AI_CONTENT_BLOCKED', usage, 'rejected');
    if (upstreamFailed || !chunks.length)
      throw new AiProviderError('AI_RESULT_UNKNOWN', usage, 'unknown');
    const bytes = Buffer.from(chunks.join(''), 'base64');
    const detected = detectAudioMime(bytes);
    if (detected.ext === 'bin') throw new AiProviderError('AI_INVALID_AUDIO', usage, 'rejected');
    return { ok: true, bytes, mime: detected.mime, externalId, usage };
  } catch (error) {
    const failure =
      error instanceof AiProviderError
        ? error
        : new AiProviderError(
            'AI_RESULT_UNKNOWN',
            {
              ...usage,
              requestId: externalId || usage.requestId,
              latencyMs: Date.now() - startedAt,
            },
            'unknown',
          );
    return { ok: false, error: failure, usage: failure.usage };
  } finally {
    clearTimeout(timeout);
  }
};

const googleAudioData = (body: unknown): string | null => {
  const object = record(body);
  const output = object?.output_audio;
  if (typeof output === 'string' && output) return output;
  const outputObject = record(output);
  for (const candidate of [outputObject?.data, outputObject?.audio_data])
    if (typeof candidate === 'string' && candidate) return candidate;
  for (const step of array(object?.steps))
    for (const block of array(record(step)?.content)) {
      const value = record(block);
      if (!value || (value.type !== undefined && value.type !== 'audio')) continue;
      for (const candidate of [value.data, value.audio_data, record(value.audio)?.data])
        if (typeof candidate === 'string' && candidate) return candidate;
    }
  return null;
};

export const generateGoogleMusicOnce = async (
  config: { apiKey: string; model: string },
  prompt: string,
  signal?: AbortSignal,
): Promise<SingOutcome> => {
  const startedAt = Date.now();
  let usage = unknownAiUsage(config.model, startedAt);
  if (!config.apiKey || !config.model)
    throw new AiProviderError('AI_CONFIGURATION_MISSING', usage, 'failed');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      headers: { 'x-goog-api-key': config.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ model: config.model, input: prompt, store: false }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw aiHttpError(response.status, unknownAiUsage(config.model, startedAt));
    }
    const body: unknown = await response.json();
    const object = record(body);
    usage = reportedAiUsage(config.model, startedAt, object?.id);
    const encoded = googleAudioData(body);
    if (!encoded) {
      const message = record(object?.error)?.message;
      if (typeof message === 'string' && /safety|content|prohibited|blocked|refus/i.test(message))
        throw new AiProviderError('AI_CONTENT_BLOCKED', usage, 'rejected');
      throw new AiProviderError('AI_INVALID_RESPONSE', usage, 'rejected');
    }
    if (encoded.length > MAX_AUDIO_BASE64)
      throw new AiProviderError('AI_INVALID_AUDIO', usage, 'rejected');
    const bytes = Buffer.from(encoded, 'base64');
    const detected = detectAudioMime(bytes);
    if (detected.ext === 'bin') throw new AiProviderError('AI_INVALID_AUDIO', usage, 'rejected');
    if (config.model === 'lyria-3.5')
      usage = { ...usage, costUsd: '0.08', costSource: 'estimated' };
    return { ok: true, bytes, mime: detected.mime, externalId: usage.requestId ?? '', usage };
  } catch (error) {
    const failure =
      error instanceof AiProviderError
        ? error
        : new AiProviderError(
            'AI_RESULT_UNKNOWN',
            { ...usage, latencyMs: Date.now() - startedAt },
            'unknown',
          );
    return { ok: false, error: failure, usage: failure.usage };
  } finally {
    clearTimeout(timeout);
  }
};

/** Exactly one network request per invocation; the durable job owns retry policy. */
const toResult = (outcome: SingOutcome): MusicResult => {
  if (outcome.ok)
    return {
      generation: outcome,
      attempts: [{ sample: outcome.usage, status: 'ok', error: null }],
    };
  const status: AiUsageStatus =
    outcome.error.code === 'AI_CONTENT_BLOCKED'
      ? 'blocked'
      : outcome.error.outcome === 'rejected'
        ? 'rejected'
        : 'error';
  throw Object.assign(outcome.error, {
    attempts: [{ sample: outcome.usage, status, error: outcome.error.code }],
  });
};
export const createOpenRouterMusicProvider = (config: {
  apiKey: string;
  model: string;
  webUrl: string;
}): MusicProvider => ({
  provider: 'openrouter',
  model: config.model,
  generate: async (prompt, signal) => toResult(await generateMusicOnce(config, prompt, signal)),
});
export const createGoogleMusicProvider = (config: {
  apiKey: string;
  model: string;
}): MusicProvider => ({
  provider: 'google',
  model: config.model,
  generate: async (prompt, signal) =>
    toResult(await generateGoogleMusicOnce(config, prompt, signal)),
});
