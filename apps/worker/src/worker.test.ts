import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateMusicOnce, readWorkerConfig, sanitizeError } from './worker.js';

const fullEnv = {
  DATABASE_URL: 'postgresql://local/test',
  CUSTOMER_ACCESS_TOKEN_PEPPER: 'a-local-token-pepper-with-more-than-32-chars',
  OPENROUTER_API_KEY: 'openrouter-key',
  OPENROUTER_MUSIC_MODEL: 'google/lyria-3-pro-preview',
};

describe('worker config', () => {
  it('uses safe defaults and validates numeric settings', () => {
    expect(readWorkerConfig(fullEnv).concurrency).toBe(1);
    expect(readWorkerConfig(fullEnv).reviewMode).toBe('manual');
    expect(readWorkerConfig(fullEnv).resendApiKey).toBeUndefined();
    expect(() => readWorkerConfig({ ...fullEnv, WORKER_CONCURRENCY: '0' })).toThrow();
    expect(sanitizeError(new Error('first\nsecond'))).toBe('first second');
  });

  it('requires the OpenRouter credentials to start', () => {
    expect(() => readWorkerConfig({ DATABASE_URL: 'postgresql://local/test' })).toThrow(
      'CUSTOMER_ACCESS_TOKEN_PEPPER is required',
    );
    expect(() => readWorkerConfig({ ...fullEnv, OPENROUTER_API_KEY: '' })).toThrow(
      'OPENROUTER_API_KEY is required',
    );
  });

  it('requires the Resend key only in production', () => {
    expect(() => readWorkerConfig({ ...fullEnv, NODE_ENV: 'production' })).toThrow(
      'RESEND_API_KEY is required',
    );
    expect(
      readWorkerConfig({ ...fullEnv, NODE_ENV: 'production', RESEND_API_KEY: 'resend-key' })
        .resendApiKey,
    ).toBe('resend-key');
  });
});
describe('music sing parsing', () => {
  afterEach(() => vi.unstubAllGlobals());
  const config = { apiKey: 'key', model: 'google/lyria-3-pro-preview', webUrl: 'http://local' };
  const sse = (payloads: unknown[]) =>
    new Response(
      new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          for (const payload of payloads)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    );
  const mp3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]).toString('base64');

  it('returns audio bytes with request id and usage cost', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sse([
          { id: 'gen-123', choices: [{ delta: { audio: { data: mp3 } } }] },
          {
            id: 'gen-123',
            usage: { prompt_tokens: 120, completion_tokens: 800, cost: 0.08 },
            choices: [{ delta: {} }],
          },
        ]),
      ),
    );
    const outcome = await generateMusicOnce(config, 'prompt');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.bytes.length).toBeGreaterThan(0);
    expect(outcome.mime).toBe('audio/mpeg');
    expect(outcome.externalId).toBe('gen-123');
    expect(outcome.usage).toMatchObject({
      requestId: 'gen-123',
      model: 'google/lyria-3-pro-preview',
      inputTokens: 120,
      outputTokens: 800,
      costUsd: '0.08',
    });
  });

  it('reports blocked sings as outcomes instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sse([{ id: 'gen-blocked', error: { message: 'PROHIBITED_CONTENT' } }])),
    );
    const outcome = await generateMusicOnce(config, 'prompt');
    expect(outcome.ok).toBe(false);
    expect(outcome.usage.requestId).toBe('gen-blocked');
  });

  it('converts transport failures into error outcomes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('fetch failed');
      }),
    );
    const outcome = await generateMusicOnce(config, 'prompt');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.message).toContain('fetch failed');
    expect(outcome.usage.requestId).toBeNull();
  });
});
