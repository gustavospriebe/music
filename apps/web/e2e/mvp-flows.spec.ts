import { publicConfiguration } from './public-configuration';
import { expect, test } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/configuration', (route) =>
    route.fulfill({
      json: {
        generation: { lyricsAvailable: true },
        commercial: { ready: false, policyVersion: 'draft-v1', termsUrl: null, privacyUrl: null },
        payment: { label: 'AbacatePay' },
        supportEmail: null,
      },
    }),
  );
});
import { finishStoryPreparation } from './studio-helpers';

const lyric = {
  number: 1,
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
  let approved = false;
  let paid = false;
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
          order: {
            publicId: 'order-demo-123',
            status: paid
              ? 'paid'
              : approved
                ? 'lyrics_approved'
                : lyricReady
                  ? 'lyrics_ready'
                  : 'story_completed',
            priceCents: 4990,
          },
          lyrics: lyricReady
            ? [{ ...lyric, approvedAt: approved ? '2026-09-04T12:00:00.000Z' : null }]
            : [],
          audio: [],
          payment: {
            label: 'AbacatePay',
            checkoutAllowed: true,
            configured: true,
            devFallback: false,
          },
        },
      });
    if (method === 'POST' && url.pathname.includes('/lyrics/1/approve')) {
      approved = true;
      return route.fulfill({ json: { approved: true } });
    }
    if (method === 'POST' && url.pathname.endsWith('/checkout')) {
      paid = true;
      return route.fulfill({
        json: { paymentId: 'payment-demo-123', checkoutUrl: '/pedido/order-demo-123' },
      });
    }
    if (new URL(route.request().url()).pathname.endsWith('/configuration'))
      return route.fulfill({ json: publicConfiguration });
    return route.fulfill({ status: 404, json: { error: { message: 'Rota mock não prevista' } } });
  });

  await page.goto('/');
  await page
    .getByRole('main')
    .getByRole('link', { name: /criar minha música/i })
    .click();
  await expect(page).toHaveURL(/\/criar$/);
  await page.getByLabel(/quem ou o que inspira/i).fill('Bia');
  await page.getByLabel(/qual é a ocasião/i).fill('Aniversário');
  await finishStoryPreparation(page);
  await page.getByRole('button', { name: /salvar história e continuar/i }).click();
  await expect(page).toHaveURL(/\/criar\/letra\?pedido=order-demo-123/);
  await page.getByRole('button', { name: /criar letra agora/i }).click();
  await page.getByRole('button', { name: /aprovar letra/i }).click();
  await expect(page).toHaveURL(/\/criar\/checkout\?pedido=order-demo-123/);
  await expect(page.getByRole('heading', { name: /resumo do pedido/i })).toBeVisible();
  await expect(page.getByText(/R\$\s*49,90/)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Jornada da música' })).toBeVisible();
  await page.getByRole('button', { name: /pagar com abacatepay/i }).click();
  await expect(page.getByRole('heading', { name: /sendo produzida/i })).toBeVisible();
});

test('checkout repete o redirecionamento ao AbacatePay sem duplicar pagamento', async ({
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
      return route.fulfill({
        json: {
          order: { publicId: 'order-repeat', status: 'lyrics_approved', priceCents: 4990 },
          lyrics: [],
          audio: [],
          payment: {
            label: 'AbacatePay',
            checkoutAllowed: true,
            configured: true,
            devFallback: false,
          },
        },
      });
    if (new URL(route.request().url()).pathname.endsWith('/configuration'))
      return route.fulfill({ json: publicConfiguration });
    return route.fulfill({ status: 404, json: { error: { message: 'Não encontrado' } } });
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto('/criar/checkout?pedido=order-repeat');
    await page.getByRole('button', { name: /pagar com abacatepay/i }).click();
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

test('minhas músicas lista pedidos do navegador com fallback de acesso', async ({ page }) => {
  await page.route('**/api/v1/orders/order-mine-123', (route) =>
    route.fulfill({
      json: {
        order: {
          publicId: 'order-mine-123',
          status: 'lyrics_ready',
          priceCents: 4990,
          createdAt: '2026-09-04T12:00:00.000Z',
        },
        story: { subjectName: 'Bia', occasion: 'Aniversário' },
        lyrics: [],
        audio: [],
      },
    }),
  );
  await page.route('**/api/v1/orders/order-gone-456', (route) =>
    route.fulfill({ status: 401, json: { error: { message: 'Acesso privado necessário' } } }),
  );
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'resenha:my-orders',
      JSON.stringify(['order-mine-123', 'order-gone-456']),
    );
  });
  await page.goto('/minhas-musicas');
  await expect(page.getByRole('heading', { name: /bia/i })).toBeVisible();
  await expect(page.getByText(/aniversário/i)).toBeVisible();
  await expect(page.getByText('Criada em', { exact: true })).toBeVisible();
  await expect(page.getByText('04/09/2026', { exact: true })).toBeVisible();
  await expect(page.getByText('Progresso', { exact: true })).toBeVisible();
  await expect(page.locator('.library-status-pill')).toHaveText('Em criação');
  await expect(page.getByRole('definition').filter({ hasText: 'Em criação' })).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('order-mine-123');
  await expect(page.getByRole('main')).not.toContainText('order-gone-456');
  await expect(page.getByText(/continuar criação/i).first()).toBeVisible();
  await expect(page.getByText(/disponível só neste navegador\/dispositivo/i)).toBeVisible();
});

test('link de entrega recupera o acesso ao pedido neste navegador', async ({ page }) => {
  await page.route('**/api/v1/deliveries/token-recovery-123**', async (route) => {
    if (route.request().method() === 'POST')
      return route.fulfill({ json: { publicId: 'order-recovered-1' } });
    return route.fulfill({
      json: { publicOrderId: 'order-recovered-1', lyrics: [], audio: [] },
    });
  });
  await page.route('**/api/v1/orders/order-recovered-1', (route) =>
    route.fulfill({
      json: {
        order: { publicId: 'order-recovered-1', status: 'delivered', priceCents: 4990 },
        lyrics: [],
        audio: [],
      },
    }),
  );
  await page.goto('/entrega/token-recovery-123');
  await page.getByRole('button', { name: /acompanhar pedido neste navegador/i }).click();
  await expect(page).toHaveURL(/\/pedido\/order-recovered-1/);
  expect(new URL(page.url()).pathname).toBe('/pedido/order-recovered-1');
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('resenha:my-orders')))
    .toBe(JSON.stringify(['order-recovered-1']));
});

test('pedido com falha explica e orienta sem prometer causa', async ({ page }) => {
  await page.route('**/api/v1/orders/order-failed-x', (route) =>
    route.fulfill({
      json: {
        order: { publicId: 'order-failed-x', status: 'failed', priceCents: 4990 },
        lyrics: [{ ...lyric, kind: 'approved', approvedAt: new Date().toISOString() }],
        audio: [],
      },
    }),
  );
  await page.goto('/pedido/order-failed-x');
  await expect(page.getByRole('heading', { name: /problema na produção/i })).toBeVisible();
  await expect(page.getByText(/produção do áudio não foi concluída/i)).toBeVisible();
  await expect(page.getByText(/pagamento permanece registrado/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /ver minhas músicas/i })).toBeVisible();
});

test('pedido aguardando letra convida a revisar', async ({ page }) => {
  await page.route('**/api/v1/orders/order-review-x', (route) =>
    route.fulfill({
      json: {
        order: { publicId: 'order-review-x', status: 'lyrics_ready', priceCents: 4990 },
        lyrics: [],
        audio: [],
      },
    }),
  );
  await page.goto('/pedido/order-review-x');
  await expect(page.getByRole('heading', { name: /revise sua letra/i })).toBeVisible();
  await page.getByRole('link', { name: /revisar letra/i }).click();
  await expect(page).toHaveURL(/\/criar\/letra\?pedido=order-review-x/);
});
