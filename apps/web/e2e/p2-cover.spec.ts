import { expect, test } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/configuration', (route) =>
    route.fulfill({
      json: {
        generation: { lyricsAvailable: true },
        commercial: { ready: false },
        payment: { label: 'AbacatePay' },
        supportEmail: null,
      },
    }),
  );
});

const completedLyrics = [
  {
    number: 1,
    kind: 'approved',
    approvedAt: '2026-09-04T12:00:00.000Z',
    content: {
      title: 'A Resenha da Bia',
      summary: 'Demo',
      fullLyrics: 'Bia chegou\nA turma cantou',
      sections: [],
      musicalDirection: {
        genre: 'pagode',
        mood: 'animado',
        tempo: 'medium',
        voice: 'female',
        instrumentation: [],
      },
    },
  },
];

test('dono envia referência com consentimento e acompanha a criação da capa', async ({ page }) => {
  let coverQueued = false;
  await page.route('**/api/v1/orders/order-cover-1/cover', async (route) => {
    if (route.request().method() === 'POST') {
      coverQueued = true;
      expect(route.request().headers()['content-type']).toContain('multipart/form-data; boundary=');
      return route.fulfill({
        status: 202,
        json: {
          status: 'pending',
          attempt: 1,
          canRegenerate: false,
          hasReference: true,
          createdAt: '2026-09-04T12:00:00.000Z',
        },
      });
    }
    return route.fulfill({
      json: {
        available: true,
        cover: coverQueued
          ? {
              status: 'pending',
              attempt: 1,
              canRegenerate: false,
              hasReference: true,
              createdAt: '2026-09-04T12:00:00.000Z',
            }
          : null,
      },
    });
  });
  await page.route('**/api/v1/orders/order-cover-1', (route) =>
    route.fulfill({
      json: {
        order: { publicId: 'order-cover-1', status: 'delivered', priceCents: 4990 },
        lyrics: completedLyrics,
        audio: [
          { variant: 1, status: 'completed' },
          { variant: 2, status: 'completed' },
        ],
        privateAccess: true,
      },
    }),
  );

  await page.goto('/pedido/order-cover-1');
  const reference = page.getByLabel(/foto de referência/i);
  await reference.setInputFiles({
    name: 'turma.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0x01]),
  });
  const generate = page.getByRole('button', { name: /gerar minha capa/i });
  await expect(generate).toBeDisabled();
  await page.getByRole('checkbox', { name: /tenho permissão/i }).check();
  await generate.click();
  await expect(page.getByRole('status')).toContainText(/criando sua capa/i);
});

test('link de entrega mostra a capa sem controles de criação', async ({ page }) => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  await page.route('**/api/v1/deliveries/token-cover-1/cover/download', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: png }),
  );
  await page.route('**/api/v1/deliveries/token-cover-1/cover', (route) =>
    route.fulfill({
      json: {
        available: true,
        cover: {
          status: 'completed',
          attempt: 2,
          canRegenerate: false,
          hasReference: true,
          createdAt: '2026-09-04T12:00:00.000Z',
          downloadUrl: '/api/v1/deliveries/token-cover-1/cover/download',
        },
      },
    }),
  );
  await page.route('**/api/v1/deliveries/token-cover-1', (route) =>
    route.fulfill({
      json: {
        publicOrderId: 'order-cover-1',
        lyrics: completedLyrics,
        audio: [
          { variant: 1, status: 'completed' },
          { variant: 2, status: 'completed' },
        ],
      },
    }),
  );

  await page.goto('/entrega/token-cover-1');
  await expect(page.getByRole('img', { name: /capa gerada por ia/i })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Baixar capa HD' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Baixar capa', exact: true })).toBeVisible();
  await expect(page.getByLabel(/foto de referência/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /gerar/i })).toHaveCount(0);
});
