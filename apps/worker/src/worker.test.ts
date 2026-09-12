import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createGoogleMusicProvider,
  generateCoverOnce,
  generateGoogleMusicOnce,
  generateMusicOnce,
  jobLogContext,
  readWorkerConfig,
  sanitizeError,
} from './worker.js';

const fullEnv = {
  DATABASE_URL: 'postgresql://local/test',
  PAYMENT_PROVIDER: 'disabled',
  EMAIL_FROM: 'test@example.test',
  CUSTOMER_ACCESS_TOKEN_PEPPER: 'a-local-token-pepper-with-more-than-32-chars',
  OPENROUTER_API_KEY: 'openrouter-key',
  OPENROUTER_MUSIC_MODEL: 'google/lyria-3-pro-preview',
  OPENROUTER_TEXT_MODEL: 'test-text-model',
};

describe('worker config', () => {
  it('uses safe defaults and validates numeric settings', () => {
    expect(readWorkerConfig(fullEnv)).toMatchObject({
      concurrency: 1,
      reviewMode: 'manual',
      musicProvider: 'openrouter',
      musicModel: 'google/lyria-3-pro-preview',
    });
    expect(readWorkerConfig(fullEnv).email.kind).toBe('local-log');
    expect(() => readWorkerConfig({ ...fullEnv, WORKER_CONCURRENCY: '0' })).toThrow();
    expect(sanitizeError(new Error('first\nsecond'))).toBe('Falha interna da operação.');
  });

  it('allows unconfigured local AI but requires credentials at production startup', () => {
    expect(() => readWorkerConfig({ DATABASE_URL: 'postgresql://local/test' })).toThrow(
      'CUSTOMER_ACCESS_TOKEN_PEPPER is required',
    );
    expect(
      readWorkerConfig({ ...fullEnv, OPENROUTER_API_KEY: '', OPENROUTER_MUSIC_MODEL: '' }),
    ).toMatchObject({ openRouterApiKey: '', openRouterMusicModel: '' });
    expect(() =>
      readWorkerConfig({
        ...fullEnv,
        NODE_ENV: 'production',
        OPENROUTER_API_KEY: '',
        RESEND_API_KEY: 'key',
        OPENROUTER_COVER_TEXT_MODEL: 'cover',
        OPENROUTER_COVER_REFERENCE_MODEL: 'reference',
        STORAGE_PROVIDER: 's3',
        STORAGE_S3_BUCKET: 'bucket',
        STORAGE_S3_REGION: 'region',
      }),
    ).toThrow('OPENROUTER_API_KEY is required');
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
    expect(config.email).toMatchObject({ kind: 'resend', apiKey: 'resend-key' });
    expect(config.openRouterTextModel).toBe('test-text-model');
  });

  it('requires the OpenRouter text model in production', () => {
    expect(() =>
      readWorkerConfig({
        ...fullEnv,
        NODE_ENV: 'production',
        OPENROUTER_TEXT_MODEL: '',
        RESEND_API_KEY: 'resend-key',
        OPENROUTER_COVER_TEXT_MODEL: 'cover-text',
        OPENROUTER_COVER_REFERENCE_MODEL: 'cover-reference',
        STORAGE_PROVIDER: 's3',
        STORAGE_S3_BUCKET: 'private-bucket',
        STORAGE_S3_REGION: 'us-east-1',
      }),
    ).toThrow('OPENROUTER_TEXT_MODEL is required');
  });

  it('selects Google Lyria with its default model without requiring OpenRouter locally', () => {
    const config = readWorkerConfig({
      ...fullEnv,
      MUSIC_PROVIDER: 'google',
      OPENROUTER_API_KEY: '',
      OPENROUTER_MUSIC_MODEL: '',
      GOOGLE_API_KEY: 'google-key',
    });
    expect(config).toMatchObject({
      musicProvider: 'google',
      musicModel: 'lyria-3.5',
      googleApiKey: 'google-key',
      googleMusicModel: 'lyria-3.5',
      openRouterApiKey: '',
      openRouterMusicModel: '',
    });
  });

  it('requires the selected Google credential in production and rejects unknown providers', () => {
    expect(() =>
      readWorkerConfig({
        ...fullEnv,
        NODE_ENV: 'production',
        MUSIC_PROVIDER: 'google',
        GOOGLE_API_KEY: '',
        RESEND_API_KEY: 'resend-key',
        OPENROUTER_COVER_TEXT_MODEL: 'cover',
        OPENROUTER_COVER_REFERENCE_MODEL: 'reference',
        STORAGE_PROVIDER: 's3',
        STORAGE_S3_BUCKET: 'bucket',
        STORAGE_S3_REGION: 'region',
      }),
    ).toThrow('GOOGLE_API_KEY is required');
    expect(() => readWorkerConfig({ ...fullEnv, MUSIC_PROVIDER: 'mureka' })).toThrow(
      'MUSIC_PROVIDER must be openrouter or google',
    );
  });
});

describe('worker logging', () => {
  it('logs bounded execution context without internal identifiers', () => {
    const context = jobLogContext(
      {
        id: 'internal-job-id',
        leaseToken: 'internal-lease-id',
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
      error: 'Falha interna da operação.',
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

  it('encerra bloqueio de conteúdo após uma chamada sem gasto repetido automático', async () => {
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
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(failure).toMatchObject({ terminal: true });
    expect((failure as { attempts?: unknown[] }).attempts).toHaveLength(1);
  });

  it.each([400, 401, 402, 403, 404, 422])(
    'marks HTTP %i as terminal after one call and hides provider metadata',
    async (status) => {
      const fetch = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                message: 'private-provider-detail',
                metadata: { limit_source: 'openrouter_key_limit' },
              },
            }),
            { status },
          ),
      );
      vi.stubGlobal('fetch', fetch);
      const provider = (await import('./worker.js')).createOpenRouterMusicProvider(config);
      const failure = await provider.generate('prompt').then(
        () => null,
        (error: unknown) => error,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(failure).toMatchObject({ terminal: true });
      expect((failure as { attempts: unknown[] }).attempts).toHaveLength(1);
      expect(sanitizeError(failure)).not.toContain('private-provider-detail');
      expect(sanitizeError(failure)).not.toContain('openrouter_key_limit');
      if (status === 402) expect(sanitizeError(failure)).toContain('AI_PAYMENT_LIMIT');
    },
  );

  it('does not retry HTTP 402 when its body also contains a content-filter marker', async () => {
    const fetch = vi.fn(
      async () => new Response('PROHIBITED_CONTENT private-limit-detail', { status: 402 }),
    );
    vi.stubGlobal('fetch', fetch);
    const provider = (await import('./worker.js')).createOpenRouterMusicProvider(config);
    const failure = await provider.generate('prompt').then(
      () => null,
      (error: unknown) => error,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(failure).toMatchObject({ terminal: true });
    expect(sanitizeError(failure)).toContain('AI_PAYMENT_LIMIT');
    expect(sanitizeError(failure)).not.toContain('PROHIBITED_CONTENT');
  });

  it.each([408, 429, 500, 503])(
    'returns a single HTTP %i outcome; only 429 permits durable retry',
    async (status) => {
      vi.useFakeTimers();
      const fetch = vi.fn(async () => new Response('private-transient-detail', { status }));
      vi.stubGlobal('fetch', fetch);
      try {
        const provider = (await import('./worker.js')).createOpenRouterMusicProvider(config);
        const result = provider.generate('prompt').then(
          () => null,
          (error: unknown) => error,
        );
        await vi.runAllTimersAsync();
        const failure = await result;
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(failure).toHaveProperty('terminal', status !== 429);
        expect((failure as { attempts: unknown[] }).attempts).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    },
  );

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
    expect(outcome.error.message).toBe('AI_RESULT_UNKNOWN');
    expect(outcome.usage.requestId).toBeNull();
  });
});

describe('Google Lyria music adapter', () => {
  afterEach(() => vi.unstubAllGlobals());
  const config = { apiKey: 'google-secret', model: 'lyria-3.5' };
  const mp3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]).toString('base64');
  const wav = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
  ]).toString('base64');

  it('sends the Interactions contract and parses output_audio as MP3', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ id: 'google-interaction-1', output_audio: { data: mp3 } }),
    );
    vi.stubGlobal('fetch', fetch);
    const outcome = await generateGoogleMusicOnce(config, 'common music prompt');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'x-goog-api-key': 'google-secret', 'content-type': 'application/json' },
      }),
    );
    const request = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(request).toEqual({ model: 'lyria-3.5', input: 'common music prompt', store: false });
    expect(JSON.stringify(request)).not.toContain('google-secret');
    expect(outcome).toMatchObject({
      ok: true,
      bytes: Buffer.from(mp3, 'base64'),
      mime: 'audio/mpeg',
      externalId: 'google-interaction-1',
      usage: { requestId: 'google-interaction-1', model: 'lyria-3.5', costUsd: '0.08' },
    });
  });

  it('parses audio in steps content and detects WAV', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({
          id: 'google-interaction-wav',
          steps: [{ content: [{ type: 'audio', data: wav }] }],
        }),
      ),
    );
    const outcome = await generateGoogleMusicOnce(config, 'prompt');
    expect(outcome).toMatchObject({
      ok: true,
      bytes: Buffer.from(wav, 'base64'),
      mime: 'audio/wav',
      externalId: 'google-interaction-wav',
    });
  });

  it.each([408, 429, 500, 503])(
    'classifies Google HTTP %i without internal retry',
    async (status) => {
      const fetch = vi.fn<typeof globalThis.fetch>(
        async () => new Response('private-google-detail', { status }),
      );
      vi.stubGlobal('fetch', fetch);
      const failure = await createGoogleMusicProvider(config)
        .generate('prompt')
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(failure).toHaveProperty('terminal', status !== 429);
      expect(
        (failure as { attempts: Array<{ sample: { costUsd: string | null } }> }).attempts[0]?.sample
          .costUsd,
      ).toBeNull();
      expect(sanitizeError(failure)).not.toContain('private-google-detail');
    },
  );

  it.each([400, 401, 403, 404, 422])(
    'marks Google HTTP %i terminal and sanitizes the result',
    async (status) => {
      const fetch = vi.fn<typeof globalThis.fetch>(
        async () =>
          new Response(JSON.stringify({ error: { message: 'private-google-payload' } }), {
            status,
          }),
      );
      vi.stubGlobal('fetch', fetch);
      const failure = await createGoogleMusicProvider(config)
        .generate('prompt')
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(failure).toMatchObject({ terminal: true });
      expect(sanitizeError(failure)).not.toContain('private-google-payload');
      expect(sanitizeError(failure)).not.toContain('google-secret');
    },
  );

  it('treats safety refusal, no audio, and unsupported containers as terminal with unknown cost', async () => {
    const cases = [
      {
        body: { id: 'safety-1', error: { message: 'SAFETY_REFUSAL' } },
        error: 'AI_CONTENT_BLOCKED',
      },
      {
        body: { id: 'no-audio-1', steps: [{ content: [{ type: 'text', data: 'not audio' }] }] },
        error: 'AI_INVALID_RESPONSE',
      },
      {
        body: {
          id: 'bad-container-1',
          output_audio: { data: Buffer.from('not audio').toString('base64') },
        },
        error: 'AI_INVALID_AUDIO',
      },
    ];
    for (const testCase of cases) {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(testCase.body));
      vi.stubGlobal('fetch', fetch);
      const failure = await createGoogleMusicProvider(config)
        .generate('prompt')
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(failure).toMatchObject({ terminal: true });
      expect(sanitizeError(failure)).toContain(testCase.error);
      expect(
        (failure as { attempts: Array<{ sample: { costUsd: string | null } }> }).attempts[0]?.sample
          .costUsd,
      ).toBeNull();
    }
  });

  it('fails before fetch when Google configuration is incomplete', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      createGoogleMusicProvider({ apiKey: '', model: 'lyria-3.5' }).generate('prompt'),
    ).rejects.toMatchObject({
      terminal: true,
      code: 'AI_CONFIGURATION_MISSING',
    });
    expect(fetch).not.toHaveBeenCalled();
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

describe('unconfigured AI transport', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('refuses music and cover jobs before any network request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const config of [
      { apiKey: '', model: 'model' },
      { apiKey: 'key', model: '' },
    ]) {
      await expect(
        generateMusicOnce({ ...config, webUrl: 'http://local' }, 'prompt'),
      ).rejects.toMatchObject({
        terminal: true,
        code: 'AI_CONFIGURATION_MISSING',
      });
      await expect(
        generateCoverOnce(
          { apiKey: config.apiKey, webUrl: 'http://local' },
          { model: config.model, prompt: 'prompt' },
        ),
      ).rejects.toMatchObject({
        terminal: true,
        code: 'AI_CONFIGURATION_MISSING',
      });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
