import type { AiUsageSample } from '@resenha/domain';
import { AiProviderError, aiHttpError, reportedAiUsage, unknownAiUsage } from './ai-error.js';

export type CoverGeneration = {
  bytes: Buffer;
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  usage: AiUsageSample;
};
export type CoverInput = {
  model: string;
  prompt: string;
  reference?: Buffer;
  signal?: AbortSignal;
};
export type CoverProvider = { generate: (input: CoverInput) => Promise<CoverGeneration> };
const detectCoverMime = (bytes: Buffer): CoverGeneration['mime'] | null => {
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

export const generateCoverOnce = async (
  config: { apiKey: string; webUrl: string },
  input: CoverInput,
): Promise<CoverGeneration> => {
  const startedAt = Date.now();
  let usage = unknownAiUsage(input.model, startedAt);
  if (!config.apiKey || !input.model)
    throw new AiProviderError('AI_CONFIGURATION_MISSING', usage, 'failed');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/images', {
      method: 'POST',
      signal: input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
        'http-referer': config.webUrl,
        'x-title': 'Musica da Resenha',
      },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        resolution: '1K',
        aspect_ratio: '1:1',
        n: 1,
        ...(input.reference
          ? {
              input_references: [
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${input.reference.toString('base64')}`,
                  },
                },
              ],
            }
          : {}),
      }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw aiHttpError(response.status, unknownAiUsage(input.model, startedAt));
    }
    const body = (await response.json()) as {
      id?: unknown;
      data?: Array<{ b64_json?: unknown; media_type?: unknown }>;
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; cost?: unknown };
    };
    usage = reportedAiUsage(input.model, startedAt, body.id, body.usage);
    const encoded = body.data?.[0]?.b64_json;
    if (typeof encoded !== 'string' || !encoded || encoded.length > 28_000_000)
      throw new AiProviderError('AI_INVALID_RESPONSE', usage, 'rejected');
    const bytes = Buffer.from(encoded, 'base64');
    const mime = detectCoverMime(bytes);
    if (!mime || (body.data?.[0]?.media_type && body.data[0].media_type !== mime))
      throw new AiProviderError('AI_INVALID_RESPONSE', usage, 'rejected');
    return { bytes, mime, usage };
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    throw new AiProviderError(
      'AI_RESULT_UNKNOWN',
      { ...usage, latencyMs: Date.now() - startedAt },
      'unknown',
    );
  } finally {
    clearTimeout(timeout);
  }
};
export const createOpenRouterCoverProvider = (config: {
  apiKey: string;
  webUrl: string;
}): CoverProvider => ({ generate: (input) => generateCoverOnce(config, input) });
