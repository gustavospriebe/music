import type { AiUsageSample } from '@resenha/domain';

export type AiErrorCode =
  | 'AI_CONFIGURATION_MISSING'
  | 'AI_RATE_LIMITED'
  | 'AI_AUTHORIZATION_FAILED'
  | 'AI_PAYMENT_LIMIT'
  | 'AI_REQUEST_REJECTED'
  | 'AI_RESULT_UNKNOWN'
  | 'AI_INVALID_RESPONSE'
  | 'AI_INVALID_AUDIO'
  | 'AI_CONTENT_BLOCKED';

export class AiProviderError extends Error {
  readonly terminal: boolean;
  constructor(
    readonly code: AiErrorCode,
    readonly usage: AiUsageSample,
    readonly outcome: 'unknown' | 'rejected' | 'failed',
  ) {
    super(code);
    this.terminal = code !== 'AI_RATE_LIMITED';
  }
}

export const unknownAiUsage = (model: string, startedAt: number): AiUsageSample => ({
  requestId: null,
  model,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: null,
  costSource: 'unknown',
  latencyMs: Math.max(0, Date.now() - startedAt),
});

const tokenCount = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2147483647
    ? value
    : 0;

export const reportedAiUsage = (
  model: string,
  startedAt: number,
  requestId: unknown,
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; cost?: unknown },
): AiUsageSample => {
  const cost =
    typeof usage?.cost === 'number' || typeof usage?.cost === 'string' ? String(usage.cost) : null;
  const validCost =
    cost !== null &&
    /^\d+(?:\.\d+)?$/.test(cost) &&
    Number.isFinite(Number(cost)) &&
    Number(cost) < 999999.999999;
  return {
    ...unknownAiUsage(model, startedAt),
    requestId:
      typeof requestId === 'string' && requestId.trim().length > 0 && requestId.length <= 160
        ? requestId
        : null,
    inputTokens: tokenCount(usage?.prompt_tokens),
    outputTokens: tokenCount(usage?.completion_tokens),
    costUsd: validCost ? cost : null,
    costSource: validCost ? 'reported' : 'unknown',
  };
};

/** Only a definite refusal is safe to retry. Timeout/server failures may have been billed. */
export const aiHttpError = (status: number, usage: AiUsageSample): AiProviderError => {
  if (status === 429) return new AiProviderError('AI_RATE_LIMITED', usage, 'rejected');
  if (status === 408 || status >= 500)
    return new AiProviderError('AI_RESULT_UNKNOWN', usage, 'unknown');
  return new AiProviderError(
    status === 402
      ? 'AI_PAYMENT_LIMIT'
      : [401, 403].includes(status)
        ? 'AI_AUTHORIZATION_FAILED'
        : 'AI_REQUEST_REJECTED',
    usage,
    'rejected',
  );
};
