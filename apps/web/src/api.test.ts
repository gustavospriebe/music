import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { api } from './api';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('API client', () => {
  it('posts the selected product and returns private access data', async () => {
    server.use(
      http.post('http://localhost:3001/api/v1/orders', async ({ request }) => {
        await expect(request.json()).resolves.toEqual({ productType: 'friend_roast' });
        return HttpResponse.json(
          { publicId: 'public-order-123', accessToken: 'opaque-token' },
          { status: 201 },
        );
      }),
    );

    await expect(api.createOrder('friend_roast')).resolves.toEqual({
      publicId: 'public-order-123',
      accessToken: 'opaque-token',
    });
  });

  it('turns the standard API error envelope into a typed error', async () => {
    server.use(
      http.post('http://localhost:3001/api/v1/orders', () =>
        HttpResponse.json(
          { error: { code: 'VALIDATION_FAILED', message: 'Revise os campos informados.' } },
          { status: 400 },
        ),
      ),
    );

    await expect(api.createOrder('friend_roast')).rejects.toMatchObject({
      name: 'Error',
      message: 'Revise os campos informados.',
      status: 400,
    });
  });

  it('does not send a content-type on bodyless POSTs', async () => {
    let sawContentType: string | null = 'inicializado';
    server.use(
      http.post(
        'http://localhost:3001/api/v1/orders/public-order-1/lyrics/generate',
        ({ request }) => {
          sawContentType = request.headers.get('content-type');
          return HttpResponse.json({ id: 'lyric-1' });
        },
      ),
    );

    await api.generateLyrics('public-order-1');
    expect(sawContentType).toBeNull();
  });
});
