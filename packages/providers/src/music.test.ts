import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createGoogleMusicProvider,
  createOpenRouterMusicProvider,
  generateMusicOnce,
} from './music.js';
const config = { apiKey: 'synthetic', model: 'test-model', webUrl: 'http://localhost' };
const sse = (chunk: unknown) => new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`);
const header = Buffer.from([0x49, 0x44, 0x33, 0x04, 0, 0]).toString('base64');
afterEach(() => vi.unstubAllGlobals());
describe('single request audio transports', () => {
  it('keeps reported usage and audio metadata while leaving decoding to the production gate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sse({
          id: 'call-1',
          usage: { cost: 0.08, prompt_tokens: 3, completion_tokens: 4 },
          choices: [{ delta: { audio: { data: header } } }],
        }),
      ),
    );
    expect(await generateMusicOnce(config, 'fictitious lyrics')).toMatchObject({
      ok: true,
      mime: 'audio/mpeg',
      externalId: 'call-1',
      usage: { costUsd: '0.08', costSource: 'reported', inputTokens: 3, outputTokens: 4 },
    });
  });
  it('does not repeat a timeout or an uncertain server response', async () => {
    const fetch = vi.fn(async () => new Response('private upstream body', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await expect(
      createOpenRouterMusicProvider(config).generate('fictitious'),
    ).rejects.toMatchObject({ code: 'AI_RESULT_UNKNOWN', outcome: 'unknown', terminal: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockRejectedValueOnce(new Error('sensitive transport message'));
    const failure = await createOpenRouterMusicProvider(config)
      .generate('fictitious')
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'AI_RESULT_UNKNOWN' });
    expect(String(failure)).not.toContain('sensitive');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('classifies a definite rate refusal as retryable without performing an internal retry', async () => {
    const fetch = vi.fn(async () => new Response('private', { status: 429 }));
    vi.stubGlobal('fetch', fetch);
    await expect(
      createOpenRouterMusicProvider(config).generate('fictitious'),
    ).rejects.toMatchObject({ code: 'AI_RATE_LIMITED', outcome: 'rejected', terminal: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('never copies an SSE error message into diagnostics and preserves billed refusal usage', async () => {
    const fetch = vi.fn(async () =>
      sse({
        id: 'blocked-call',
        error: { message: 'PROHIBITED_CONTENT private-person@example.test' },
        usage: { cost: 0.03 },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const failure = await createOpenRouterMusicProvider(config)
      .generate('fictitious')
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({
      code: 'AI_CONTENT_BLOCKED',
      usage: { requestId: 'blocked-call', costUsd: '0.03', costSource: 'reported' },
    });
    expect(JSON.stringify(failure)).not.toContain('private-person');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('labels the documented Google price as an estimate instead of reported billing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 'google-call', output_audio: header }))),
    );
    const result = await createGoogleMusicProvider({
      apiKey: 'synthetic',
      model: 'lyria-3.5',
    }).generate('fictitious');
    expect(result.generation.usage).toMatchObject({ costUsd: '0.08', costSource: 'estimated' });
  });
});
