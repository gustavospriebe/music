import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { api } from './api';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.unstubAllGlobals();
});
afterAll(() => server.close());

describe('API client', () => {
  it('posts the selected product and returns the public order reference', async () => {
    const creationKey = '11111111-1111-4111-8111-111111111111';
    server.use(
      http.post('http://localhost:3001/api/v1/orders', async ({ request }) => {
        await expect(request.json()).resolves.toEqual({ productType: 'friend_roast', creationKey });
        return HttpResponse.json({ publicId: 'public-order-123' }, { status: 201 });
      }),
    );

    await expect(api.createOrder('friend_roast', creationKey)).resolves.toEqual({
      publicId: 'public-order-123',
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

    await expect(
      api.createOrder('friend_roast', '11111111-1111-4111-8111-111111111111'),
    ).rejects.toMatchObject({
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

  it('envia referência de capa como multipart sem sobrescrever o boundary', async () => {
    const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json(
        {
          status: 'pending',
          attempt: 1,
          canRegenerate: false,
          hasReference: true,
          createdAt: '2026-09-04T12:00:00.000Z',
        },
        { status: 202 },
      ),
    );
    vi.stubGlobal('fetch', fetch);

    const reference = new File(['jpeg'], 'lembranca.jpg', { type: 'image/jpeg' });
    await api.createCover('public-order-1', reference, true);
    const init = fetch.mock.calls[0]?.[1];
    expect(init?.headers).not.toHaveProperty('content-type');
    const form = init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('consent')).toBe('true');
    expect((form.get('reference') as File).name).toBe('lembranca.jpg');
  });

  it('envia o texto atual ao aprovar e troca link de entrega por acesso', async () => {
    let approveBody: unknown;
    server.use(
      http.post(
        'http://localhost:3001/api/v1/orders/public-order-1/lyrics/2/approve',
        async ({ request }) => {
          approveBody = await request.json();
          return HttpResponse.json({ approved: true });
        },
      ),
      http.post('http://localhost:3001/api/v1/deliveries/token-abc/access', () =>
        HttpResponse.json({ publicId: 'public-order-1' }),
      ),
    );

    await api.approveLyrics('public-order-1', 2, {
      title: 'Título',
      summary: 'resumo',
      fullLyrics: 'letra atual',
      sections: [],
      musicalDirection: {
        genre: 'pagode',
        mood: 'animado',
        tempo: 'medium',
        voice: 'female',
        instrumentation: [],
      },
    });
    expect(approveBody).toMatchObject({ content: { fullLyrics: 'letra atual' } });
    await expect(api.recoverViaDelivery('token-abc')).resolves.toEqual({
      publicId: 'public-order-1',
    });
  });

  it('troca token de acesso via POST com corpo', async () => {
    let method = '';
    let tokenBody: unknown;
    server.use(
      http.all(
        'http://localhost:3001/api/v1/orders/public-order-1/access/exchange',
        async ({ request }) => {
          method = request.method;
          tokenBody = await request.json();
          return HttpResponse.json({ ok: true });
        },
      ),
    );

    await expect(api.exchangeAccess('public-order-1', 'token-secreto-123')).resolves.toEqual({
      ok: true,
    });
    expect(method).toBe('POST');
    expect(tokenBody).toEqual({ token: 'token-secreto-123' });
  });

  it('gera visitorId em formato UUID mesmo sem crypto.randomUUID (HTTP não-seguro)', async () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const { visitorId } = await import('./api');
    window.localStorage.clear();
    const randomUUID = (globalThis.crypto as Crypto | undefined)?.randomUUID;
    if (randomUUID) {
      (globalThis.crypto as { randomUUID?: unknown }).randomUUID = undefined;
    }
    try {
      const first = visitorId();
      expect(first).toMatch(uuid);
      expect(visitorId()).toBe(first);
      window.localStorage.setItem('resenha:visitor', 'anon-123');
      expect(visitorId()).toMatch(uuid);
    } finally {
      if (randomUUID) {
        (globalThis.crypto as { randomUUID?: unknown }).randomUUID = randomUUID;
      }
      window.localStorage.clear();
    }
  });

  it('omite visitorId inválido em vez de enviar texto que o servidor rejeita', async () => {
    let orderBody: unknown;
    server.use(
      http.post('http://localhost:3001/api/v1/orders', async ({ request }) => {
        orderBody = await request.json();
        return HttpResponse.json({ publicId: 'public-order-9' }, { status: 201 });
      }),
    );

    await api.createOrder('friend_roast', '11111111-1111-4111-8111-111111111111', 'anon-123');
    expect(orderBody).toEqual({
      productType: 'friend_roast',
      creationKey: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('usa somente contratos públicos no catálogo e na confirmação local', async () => {
    let approvedPath = '';
    server.use(
      http.get('http://localhost:3001/api/v1/products', () =>
        HttpResponse.json([
          { type: 'friend_roast', name: 'Música da Resenha', priceCents: 6789, active: true },
        ]),
      ),
      http.post('http://localhost:3001/api/v1/orders/public-order-1/checkout', () =>
        HttpResponse.json({ checkoutUrl: '/pedido/public-order-1', dev: true }),
      ),
      http.post(
        'http://localhost:3001/api/v1/orders/public-order-1/dev-payment/approve',
        ({ request }) => {
          approvedPath = new URL(request.url).pathname;
          return HttpResponse.json({ approved: true });
        },
      ),
    );

    await expect(api.products()).resolves.toEqual([
      { type: 'friend_roast', name: 'Música da Resenha', priceCents: 6789, active: true },
    ]);
    await expect(api.checkout('public-order-1')).resolves.toEqual({
      checkoutUrl: '/pedido/public-order-1',
      dev: true,
    });
    await expect(api.approveDevPayment('public-order-1')).resolves.toEqual({ approved: true });
    expect(approvedPath).toBe('/api/v1/orders/public-order-1/dev-payment/approve');
  });

  it('gera UUID válido mesmo com crypto e localStorage indisponíveis', async () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const { visitorId } = await import('./api');
    const getRandomValues = (
      globalThis.crypto as { getRandomValues?: typeof crypto.getRandomValues } | undefined
    )?.getRandomValues;
    const getItem = window.localStorage.getItem;
    const setItem = window.localStorage.setItem;
    (globalThis.crypto as { getRandomValues?: unknown }).getRandomValues = () => {
      throw new DOMException('indisponível', 'NotSupportedError');
    };
    window.localStorage.getItem = () => {
      throw new DOMException('bloqueado', 'SecurityError');
    };
    window.localStorage.setItem = () => {
      throw new DOMException('bloqueado', 'SecurityError');
    };
    try {
      expect(visitorId()).toMatch(uuid);
    } finally {
      (globalThis.crypto as { getRandomValues?: unknown }).getRandomValues = getRandomValues;
      window.localStorage.getItem = getItem;
      window.localStorage.setItem = setItem;
      window.localStorage.clear();
    }
  });
});
