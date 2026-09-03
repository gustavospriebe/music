import { expect, test } from '@playwright/test';

const lyric = {
  id: 'lyric-1',
  content: {
    title: 'A Resenha da Bia',
    summary: 'Demo local',
    language: 'pt-BR',
    musicalDirection: {
      genre: 'Pagode',
      mood: 'Animado',
      tempo: 'medium',
      voice: 'female',
      instrumentation: ['violão'],
    },
    pronunciationNotes: [],
    sections: [
      { type: 'intro', label: 'Introdução', lyrics: 'Bia chegou' },
      { type: 'verse', label: 'Verso', lyrics: 'A turma canta junto' },
      { type: 'chorus', label: 'Refrão', lyrics: 'Bia, vem cantar!' },
    ],
    fullLyrics: 'Bia chegou\nA turma canta junto\nBia, vem cantar!',
    safetyNotes: [],
  },
};

test('fluxo completo local: história, letra, checkout e acompanhamento', async ({ page }) => {
  let lyricReady = false;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (method === 'POST' && url.pathname.endsWith('/orders'))
      return route.fulfill({
        json: { publicId: 'order-demo-123', accessToken: 'opaque-test-token' },
        status: 201,
      });
    if (method === 'PATCH' && url.pathname.endsWith('/story'))
      return route.fulfill({ json: { saved: true } });
    if (method === 'POST' && url.pathname.endsWith('/lyrics/generate')) {
      lyricReady = true;
      return route.fulfill({ json: lyric });
    }
    if (method === 'GET' && url.pathname.endsWith('/orders/order-demo-123'))
      return route.fulfill({
        json: {
          order: { publicId: 'order-demo-123' },
          lyrics: lyricReady ? [lyric] : [],
          audio: [],
        },
      });
    if (method === 'POST' && url.pathname.includes('/lyrics/lyric-1/approve'))
      return route.fulfill({ json: { approved: true } });
    if (method === 'POST' && url.pathname.endsWith('/checkout'))
      return route.fulfill({
        json: { paymentId: 'payment-demo-123', checkoutUrl: '/pedido/order-demo-123' },
      });
    return route.fulfill({ status: 404, json: { error: { message: 'Rota mock não prevista' } } });
  });

  await page.goto('/');
  await page
    .getByRole('main')
    .getByRole('link', { name: /criar minha música/i })
    .click();
  await expect(page).toHaveURL(/\/criar$/);
  await page.getByLabel(/para quem é a música/i).fill('Bia');
  await page.getByLabel(/qual é a ocasião/i).fill('Aniversário');
  await page.getByLabel(/^seu nome$/i).fill('Nina');
  await page.getByLabel(/^seu e-mail$/i).fill('nina@example.test');
  await page.getByLabel(/histórias, apelidos/i).fill('Sempre chega cantando');
  await page.getByLabel(/aceito os termos/i).check();
  await page.getByRole('button', { name: /gerar minha letra/i }).click();
  await expect(page).toHaveURL(/\/criar\/letra\?pedido=order-demo-123/);
  await page.getByRole('button', { name: /criar letra agora/i }).click();
  await page.getByRole('button', { name: /aprovar letra/i }).click();
  await expect(page).toHaveURL(/\/criar\/checkout\?pedido=order-demo-123/);
  await page.getByRole('button', { name: /pagar com mercado pago/i }).click();
  await expect(page).toHaveURL(/\/pedido\/order-demo-123/);
  await expect(page.getByRole('heading', { name: /sendo produzida/i })).toBeVisible();
});

test('checkout repete o redirecionamento ao Mercado Pago sem duplicar pagamento', async ({
  page,
}) => {
  let checkouts = 0;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/checkout')) {
      checkouts += 1;
      return route.fulfill({
        json: { paymentId: 'payment-repeat', checkoutUrl: '/pedido/order-repeat' },
      });
    }
    if (path.endsWith('/orders/order-repeat'))
      return route.fulfill({ json: { order: {}, lyrics: [], audio: [] } });
    return route.fulfill({ status: 404, json: { error: { message: 'Não encontrado' } } });
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto('/criar/checkout?pedido=order-repeat');
    await page.getByRole('button', { name: /pagar com mercado pago/i }).click();
    await expect(page).toHaveURL(/\/pedido\/order-repeat/);
  }
  expect(checkouts).toBe(2);
});

test('falha de carregamento de pedido oferece recuperação', async ({ page }) => {
  await page.route('**/api/v1/orders/order-failed', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'Serviço indisponível' } } }),
  );
  await page.goto('/pedido/order-failed');
  await expect(page.getByRole('alert')).toContainText(/pedido não encontrado ou acesso inválido/i);
  await page.getByRole('link', { name: /voltar ao início/i }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('rotas legais e link de entrega inválido não expõem dados pessoais', async ({ page }) => {
  await page.route('**/api/v1/deliveries/**', (route) =>
    route.fulfill({ status: 404, json: { error: { message: 'Link de entrega inválido.' } } }),
  );
  await page.goto('/privacidade');
  await expect(page.getByRole('heading', { name: /privacidade/i })).toBeVisible();
  await page.goto('/entrega/token-opaco-inválido');
  await expect(page.getByText(/link de entrega inválido ou expirado/i)).toBeVisible();
});
