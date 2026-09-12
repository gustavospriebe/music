import { describe, expect, it } from 'vitest';
import { buildApp, httpLogContext, requestLogController } from './app.js';
import type { Env } from './env.js';

const env: Env = {
  NODE_ENV: 'test',
  API_PORT: 3001,
  DATABASE_URL: 'postgresql://resenha:resenha@localhost:5433/resenha_test',
  WEB_URL: 'http://localhost:5173',
  COOKIE_SECRET: 'a-local-cookie-secret-with-more-than-32-chars',
  CUSTOMER_ACCESS_TOKEN_PEPPER: 'a-local-token-pepper-with-more-than-32-chars',
  ADMIN_EMAIL: 'admin@example.test',
  ADMIN_PASSWORD: 'a-simple-local-password',
  ADMIN_SESSION_TTL: 28_800,
  OPENROUTER_TEXT_MAX_TOKENS: 8192,
  LYRICS_PROVIDER: 'openrouter',
  MUSIC_PROVIDER: 'openrouter',
  GOOGLE_MUSIC_MODEL: 'lyria-3.5',
  PAYMENT_PROVIDER: 'abacatepay',
  EMAIL_PROVIDER: 'resend',
  AUDIO_REVIEW_MODE: 'manual',
  LOCAL_STORAGE_PATH: './var/test-storage',
};

describe('HTTP foundation', () => {
  it('never returns database parameters or unexpected exception messages', async () => {
    const app = await buildApp(env);
    app.get('/test-private-error', () => {
      throw new Error(
        'Failed query: insert into order_contacts(email) values ($1); params: private@example.test',
      );
    });
    try {
      const response = await app.inject('/test-private-error');
      expect(response.statusCode).toBe(500);
      expect(response.body).not.toMatch(/private@|Failed query|insert into|params/);
      expect(response.json().error.message).toBe(
        'Não foi possível concluir a solicitação. Tente novamente.',
      );
    } finally {
      await app.close();
    }
  });

  it('rejects malformed JSON without echoing its personal contents', async () => {
    const app = await buildApp(env);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: { 'content-type': 'application/json' },
        payload: '{"email":"private@example.test", BROKEN}',
      });
      expect(response.statusCode).toBe(400);
      expect(response.body).not.toContain('private@example.test');
    } finally {
      await app.close();
    }
  });
  it('limits the HTTP completion context to route, status and duration', () => {
    expect(httpLogContext('/api/v1/orders/:publicId', 200, 12.6)).toEqual({
      route: '/api/v1/orders/:publicId',
      statusCode: 200,
      latencyMs: 13,
    });
  });

  it('disables Fastify request logs through the Fastify 6-compatible controller', () => {
    expect(requestLogController.disableRequestLogging).toBe(true);
    expect(requestLogController.isLogDisabled({} as never)).toBe(true);
  });

  it('serves a live health probe through fastify.inject', async () => {
    const app = await buildApp(env);
    try {
      const response = await app.inject({ method: 'GET', url: '/api/v1/health/live' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    } finally {
      await app.close();
    }
  });

  it('returns a stable, request-correlated validation error', async () => {
    const app = await buildApp(env);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        payload: {
          productType: 'not-a-product',
          creationKey: '51cc3b09-2902-42cf-9071-70f078d36cd7',
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Revise os campos informados. (productType)',
        },
      });
      expect(response.json().error.requestId).toEqual(expect.any(String));
    } finally {
      await app.close();
    }
  });

  it('accepts POSTs with a JSON content-type and no body (parse, not reject)', async () => {
    const app = await buildApp(env);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: { 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).not.toMatch(/body cannot be empty/i);
    } finally {
      await app.close();
    }
  });
});
