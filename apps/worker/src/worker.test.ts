import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  generateCoverOnce,
  generateMusicOnce,
  jobLogContext,
  readWorkerConfig,
  sanitizeError,
} from './worker.js';

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
    expect(() =>
      readWorkerConfig({ ...fullEnv, NODE_ENV: 'production', RESEND_API_KEY: 'resend-key' }),
    ).toThrow('OpenRouter cover production configuration is required');
  });

  it('requires managed private storage in production after cover models are configured', () => {
    expect(() =>
      readWorkerConfig({
        ...fullEnv,
        NODE_ENV: 'production',
        RESEND_API_KEY: 'resend-key',
        OPENROUTER_COVER_TEXT_MODEL: 'cover-text',
        OPENROUTER_COVER_REFERENCE_MODEL: 'cover-reference',
      }),
    ).toThrow('STORAGE_PROVIDER=s3 is required in production');
    const config = readWorkerConfig({
      ...fullEnv,
      NODE_ENV: 'production',
      RESEND_API_KEY: 'resend-key',
      OPENROUTER_COVER_TEXT_MODEL: 'cover-text',
      OPENROUTER_COVER_REFERENCE_MODEL: 'cover-reference',
      STORAGE_PROVIDER: 's3',
      STORAGE_S3_BUCKET: 'private-bucket',
      STORAGE_S3_REGION: 'us-east-1',
    });
    expect(config.storage).toMatchObject({ kind: 's3', bucket: 'private-bucket' });
    expect(config.resendApiKey).toBe('resend-key');
  });
});

describe('worker logging', () => {
  it('logs bounded execution context without internal identifiers', () => {
    const context = jobLogContext(
      {
        id: 'internal-job-id',
        orderId: 'internal-order-id',
        type: 'generate_audio',
        attempts: 2,
        maxAttempts: 6,
        payload: {},
      },
      'retry_scheduled',
      47,
      new Error('provider failed\nwith detail'),
    );

    expect(context).toEqual({
      jobType: 'generate_audio',
      status: 'retry_scheduled',
      attempt: 2,
      durationMs: 47,
      error: 'provider failed with detail',
    });
    expect(JSON.stringify(context)).not.toContain('internal-job-id');
    expect(JSON.stringify(context)).not.toContain('internal-order-id');
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

  it('encerra bloqueios do filtro após orçamento curto com erro terminal', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      sse([{ id: 'gen-blocked', error: { message: 'PROHIBITED_CONTENT' } }]),
    );
    vi.stubGlobal('fetch', fetch);
    const provider = (await import('./worker.js')).createOpenRouterMusicProvider({
      apiKey: 'key',
      model: 'm',
      webUrl: 'http://local',
    });
    const failure = await provider.generate('prompt').then(
      () => null,
      (error: unknown) => error,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(failure).toMatchObject({ terminal: true });
    expect((failure as { attempts?: unknown[] }).attempts).toHaveLength(2);
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

describe('cover image parsing', () => {
  afterEach(() => vi.unstubAllGlobals());
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );

  it('uses the official Images API shape and returns measured usage', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        data: [{ b64_json: png.toString('base64'), media_type: 'image/png' }],
        usage: { prompt_tokens: 40, completion_tokens: 1120, cost: 0.0336 },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const outcome = await generateCoverOnce(
      { apiKey: 'key', webUrl: 'http://local' },
      {
        model: 'google/gemini-3.1-flash-lite-image',
        prompt: 'album cover',
        reference: Buffer.from([0xff, 0xd8, 0xff]),
      },
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/images',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer key' }),
      }),
    );
    const request = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(request).toEqual({
      model: 'google/gemini-3.1-flash-lite-image',
      prompt: 'album cover',
      resolution: '1K',
      aspect_ratio: '1:1',
      n: 1,
      input_references: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/' } }],
    });
    expect(outcome).toMatchObject({
      bytes: png,
      mime: 'image/png',
      usage: {
        model: 'google/gemini-3.1-flash-lite-image',
        inputTokens: 40,
        outputTokens: 1120,
        costUsd: '0.0336',
      },
    });
  });

  it('rejects active or malformed output as terminal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          data: [
            { b64_json: Buffer.from('<svg/>').toString('base64'), media_type: 'image/svg+xml' },
          ],
        }),
      ),
    );
    await expect(
      generateCoverOnce(
        { apiKey: 'key', webUrl: 'http://local' },
        { model: 'model', prompt: 'cover' },
      ),
    ).rejects.toMatchObject({ terminal: true });
  });
});
