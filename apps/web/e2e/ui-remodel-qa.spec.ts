import { publicConfiguration } from './public-configuration';
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

const lyric = {
  number: 1,
  kind: 'approved',
  approvedAt: '2026-09-04T12:00:00.000Z',
  content: {
    title: 'A Resenha da Bia',
    summary: 'QA local',
    language: 'pt-BR',
    musicalDirection: {
      genre: 'Pagode',
      mood: 'Animado',
      tempo: 'medium',
      voice: 'female',
      instrumentation: ['violão'],
    },
    pronunciationNotes: [],
    sections: [{ type: 'chorus', label: 'Refrão', lyrics: 'Bia, vem cantar!' }],
    fullLyrics: 'Bia chegou\nA turma canta junto\nBia, vem cantar!',
    safetyNotes: [],
  },
};

const routes = async (page: import('@playwright/test').Page) => {
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith('/analytics/beacon')) return route.fulfill({ json: { accepted: true } });
    if (path.endsWith('/products'))
      return route.fulfill({
        json: [{ type: 'friend_roast', name: 'Música da Resenha', priceCents: 4990, active: true }],
      });
    if (path.endsWith('/orders/order-qa-story'))
      return route.fulfill({
        json: {
          order: {
            publicId: 'order-qa-story',
            status: 'story_completed',
            priceCents: 4990,
            createdAt: '2026-09-04T12:00:00.000Z',
          },
          story: { subjectName: 'Bia', occasion: 'Aniversário' },
          lyrics: [],
          audio: [],
          payment: {
            label: 'AbacatePay',
            checkoutAllowed: true,
            configured: false,
            devFallback: true,
          },
        },
      });
    if (path.endsWith('/orders/order-qa-approved'))
      return route.fulfill({
        json: {
          order: {
            publicId: 'order-qa-approved',
            status: 'lyrics_approved',
            priceCents: 4990,
            createdAt: '2026-09-04T12:00:00.000Z',
          },
          story: { subjectName: 'Bia', occasion: 'Aniversário' },
          lyrics: [lyric],
          audio: [],
          payment: {
            label: 'AbacatePay',
            checkoutAllowed: false,
            configured: false,
            devFallback: false,
          },
        },
      });
    if (path.endsWith('/admin/overview'))
      return route.fulfill({
        json: {
          totals: { orders: 42, paid: 10, revenueCents: 49900 },
          attention: { failed: 1, reviewRequired: 1, audioQueued: 2, lyricsGenerating: 1 },
        },
      });
    if (path.endsWith('/admin/ai-usage/summary'))
      return route.fulfill({
        json: {
          month: { totalUsd: '0.50', lyricsUsd: '0.30', audioUsd: '0.20', calls: 2, blocked: 0 },
          byDay: [],
        },
      });
    if (path.includes('/admin/analytics/funnel'))
      return route.fulfill({
        json: { days: 30, steps: [], preOrder: [], perSaleUsd: '0', salesWithCost: 0 },
      });
    if (path.includes('/admin/orders/') && !path.endsWith('/admin/orders'))
      return route.fulfill({
        json: {
          order: {
            id: 'qa-internal-1',
            productType: 'friend_roast',
            status: 'review_required',
            priceCents: 4990,
            createdAt: '2026-09-04T12:00:00.000Z',
          },
          story: { subjectName: 'Bia', occasion: 'Aniversário', buyerEmail: 'qa@example.test' },
          lyrics: [{ ...lyric, id: 'qa-lyric-1' }],
          payments: [{ id: 'qa-pay-1', status: 'approved', amountCents: 4990 }],
          jobs: [],
          audio: [],
          notes: [],
          aiUsage: [],
          aiCost: {
            totalUsd: '0',
            lyricsUsd: '0',
            audioUsd: '0',
            inputTokens: 0,
            outputTokens: 0,
            calls: 0,
          },
        },
      });
    if (path.endsWith('/admin/orders'))
      return route.fulfill({
        json: {
          items: [
            {
              id: 'qa-internal-1',
              publicId: 'QA-PUBLIC-1',
              productType: 'friend_roast',
              status: 'failed',
              priceCents: 4990,
              createdAt: new Date().toISOString(),
              subjectName: 'Bia',
            },
          ],
          page: 1,
          total: 1,
          pageSize: 30,
        },
      });
    if (path.endsWith('/admin/session'))
      return route.fulfill({ json: { authenticated: true, expiresAt: new Date().toISOString() } });
    if (new URL(route.request().url()).pathname.endsWith('/configuration'))
      return route.fulfill({ json: publicConfiguration });
    return route.fulfill({ status: 404, json: { error: { message: 'Rota QA ausente' } } });
  });
};

test('QA remodel: jornada cliente desktop + mobile sem overflow', async ({ page }) => {
  await routes(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/criar');
  await expect(page.getByRole('list', { name: 'Jornada da música' })).toBeVisible();
  await page.goto('/criar/letra?pedido=order-qa-story');
  await expect(page.getByRole('list', { name: 'Jornada da música' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /vamos dar palavras à sua ideia/i }),
  ).toBeVisible();
  await page.getByText('O que acontece ao criar a letra?', { exact: true }).click();
  await expect(page.getByText(/alguns minutos e consome uma tentativa de geração/i)).toBeVisible();
  await expect(page.getByText(/história continua salva/i)).toBeVisible();
  await expect(page.getByText(/mesmo navegador ou pela página do pedido/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /criar letra agora/i })).toBeVisible();
  await page.goto('/criar/checkout?pedido=order-qa-approved');
  await expect(page.getByRole('list', { name: 'Jornada da música' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /resumo do pedido/i })).toBeVisible();
  await expect(page.getByText('Música da Resenha', { exact: true })).toBeVisible();
  await expect(page.getByText('A Resenha da Bia')).toBeVisible();
  await expect(page.getByText(/R\$\s*49,90/)).toBeVisible();
  await expect(page.getByText(/duas versões de áudio e página privada/i)).toBeVisible();
  await expect(page.getByText(/pagamento e depois produção do áudio/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /pagar com abacatepay/i })).toBeDisabled();
  await expect(page.getByText(/condições da sua música/i)).toHaveCount(0);
  await expect(page.getByText(/preparando a abertura das compras/i)).toHaveCount(0);
  await page.screenshot({
    path: 'test-results/visual-evidence/10-qa-checkout.png',
  });

  await page.setViewportSize({ width: 390, height: 844 });
  for (const target of ['/', '/criar', '/criar/checkout?pedido=order-qa-approved']) {
    await page.goto(target);
    await expect
      .poll(() =>
        page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        })),
      )
      .toEqual({ clientWidth: 390, scrollWidth: 390 });
  }
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
  await page.screenshot({
    path: 'test-results/visual-evidence/11-qa-mobile-menu.png',
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeFocused();
});

test('QA remodel: jornada completa só por teclado, sem armadilha de foco', async ({ page }) => {
  await routes(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/criar');
  await expect(page.getByRole('heading', { name: /toda música começa/i })).toBeVisible();
  await page.keyboard.press('Tab');
  const seen: string[] = [];
  let guard = 0;
  let reachedCta = false;
  while (guard < 60) {
    const name = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      return active ? (active.getAttribute('aria-label') ?? active.textContent ?? '') : '';
    });
    seen.push(name.trim().slice(0, 60));
    if (/^continuar$/i.test(name)) {
      reachedCta = true;
      break;
    }
    await page.keyboard.press('Tab');
    guard += 1;
  }
  expect(reachedCta).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.getByLabel(/quem ou o que inspira/i)).toBeFocused();
});

test('QA remodel: landing honesta sem áudio demo', async ({ page }) => {
  await routes(page);
  await page.goto('/');
  await expect(page.getByText(/imagem ilustrativa criada com IA/i)).toBeVisible();
  await expect(page.locator('main audio')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /ouvir|reproduzir|play demo/i })).toHaveCount(0);
});

test('QA remodel: admin shell, lista e detalhe sem PII exposta', async ({ page }) => {
  await routes(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/admin');
  const shellNav = page.getByRole('navigation', { name: 'Administração' });
  await expect(shellNav.getByRole('link', { name: 'Visão geral' })).toBeVisible();
  await expect(shellNav.getByRole('link', { name: 'Pedidos' })).toBeVisible();
  const alertsHeading = page.getByRole('heading', { name: /precisam de decisão/i });
  const cards = page.locator('.cards');
  await expect(alertsHeading).toBeVisible();
  expect(
    await alertsHeading.evaluate(
      (node, cardsNode) => {
        if (!cardsNode) return false;
        return Boolean(node.compareDocumentPosition(cardsNode) & Node.DOCUMENT_POSITION_FOLLOWING);
      },
      await cards.elementHandle(),
    ),
  ).toBe(true);
  await expect(page.getByText(/42/)).toBeVisible();
  await page.screenshot({
    path: 'test-results/visual-evidence/12-qa-admin.png',
  });
  await page.goto('/admin/pedidos');
  await expect(
    page.getByRole('navigation', { name: 'Administração' }).getByRole('link', {
      name: 'Pedidos',
    }),
  ).toBeVisible();
  await expect(page.getByText(/investigar erro/i)).toBeVisible();
  await expect(page.getByText(/página 1 de 1/i)).toBeVisible();
  await page.screenshot({
    path: 'test-results/visual-evidence/13-qa-admin-orders.png',
  });
  await page.goto('/admin/pedidos/qa-internal-1');
  await expect(
    page.getByRole('navigation', { name: 'Administração' }).getByRole('link', {
      name: 'Visão geral',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /história \(resumo operacional\)/i }),
  ).toBeVisible();
  await expect(page.getByText('q•••@example.test')).toBeVisible();
  expect(await page.content()).not.toMatch(/qa@example\.test/);
  expect(await page.content()).not.toMatch(/qa-internal-1/);
  expect(await page.content()).not.toMatch(/externalId/);
  expect(await page.content()).not.toMatch(/JSON\.stringify/);
  await page.screenshot({
    path: 'test-results/visual-evidence/14-qa-admin-detail.png',
  });
});

test('QA remodel: admin sem overflow em 390×844', async ({ page }) => {
  await routes(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const target of ['/admin', '/admin/pedidos', '/admin/pedidos/qa-internal-1']) {
    await page.goto(target);
    await expect(
      page.getByRole('navigation', { name: 'Administração' }).getByRole('link', {
        name: 'Pedidos',
      }),
    ).toBeVisible();
    await expect
      .poll(
        () =>
          page.evaluate(() => ({
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
          })),
        target,
      )
      .toEqual({ clientWidth: 390, scrollWidth: 390 });
  }
});
