import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
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
  LYRICS_PROVIDER: 'openrouter',
  MUSIC_PROVIDER: 'openrouter',
  PAYMENT_PROVIDER: 'mercadopago',
  EMAIL_PROVIDER: 'resend',
  AUDIO_REVIEW_MODE: 'manual',
  LOCAL_STORAGE_PATH: './var/test-storage',
};

describe('HTTP foundation', () => {
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
        payload: { productType: 'not-a-product' },
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
