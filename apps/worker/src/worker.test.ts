import { describe, expect, it } from 'vitest';
import { readWorkerConfig, sanitizeError } from './worker.js';

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
