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

const rgb = (value: string): [number, number, number] => {
  const channels = value
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3) throw new Error(`Cor RGB inválida: ${value}`);
  return channels as [number, number, number];
};
const luminance = (color: [number, number, number]) => {
  const [red, green, blue] = color.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};
const contrast = (foreground: string, background: string) => {
  const lighter = Math.max(luminance(rgb(foreground)), luminance(rgb(background)));
  const darker = Math.min(luminance(rgb(foreground)), luminance(rgb(background)));
  return (lighter + 0.05) / (darker + 0.05);
};

test('menu móvel informa estado, trava o scroll e devolve foco no Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Abrir menu' });
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  const close = page.getByRole('button', { name: 'Fechar menu' });
  await expect(close).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveAttribute('aria-modal', 'true');
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
    .toBe('hidden');
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
    .toBe('visible');
});

test('menu móvel contém o foco e não alcança conteúdo coberto', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  const dialog = page.getByRole('dialog', { name: 'Menu' });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.querySelector('main')?.hasAttribute('inert')))
    .toBe(true);
  const cta = page
    .getByRole('main')
    .getByRole('link', { name: /criar minha música/i })
    .first();
  await expect(cta).toBeHidden();
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  await expect(focused).toBeVisible();
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.querySelector('main')?.hasAttribute('inert')))
    .toBe(false);
});

test('troca de rota rola ao topo e foca o main sem incluí-lo na ordem de Tab', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page
    .getByRole('main')
    .getByRole('link', { name: /criar minha música/i })
    .click();
  await expect(page).toHaveURL(/\/criar$/);
  const main = page.getByRole('main');
  await expect(main).toBeFocused();
  await expect(main).toHaveAttribute('tabindex', '-1');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('foco por teclado usa contorno calculado com contraste mínimo de 3:1', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('main')).toBeFocused();
  await page.keyboard.press('Tab');
  const focusStyle = await page.locator(':focus').evaluate((node) => {
    const style = getComputedStyle(node);
    const root = getComputedStyle(document.documentElement);
    return {
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      paperColor: root.backgroundColor,
    };
  });
  expect(focusStyle.outlineStyle).toBe('solid');
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(3);
  expect(contrast(focusStyle.outlineColor, focusStyle.paperColor)).toBeGreaterThanOrEqual(3);
});

test('todas as rotas públicas mantêm um h1 com line-height e tracking legíveis', async ({
  page,
}) => {
  const approvedLyric = {
    number: 1,
    kind: 'approved',
    approvedAt: '2026-09-04T12:00:00.000Z',
    content: {
      title: 'A Resenha da Bia',
      fullLyrics: 'Bia chegou para cantar',
    },
  };
  await page.route('**/api/v1/orders/order-a11y', (route) =>
    route.fulfill({
      json: {
        order: { publicId: 'order-a11y', status: 'delivered', priceCents: 4990 },
        lyrics: [approvedLyric],
        audio: [
          { variant: 1, status: 'completed' },
          { variant: 2, status: 'completed' },
        ],
        payment: {
          label: 'AbacatePay',
          checkoutAllowed: true,
          configured: false,
          devFallback: true,
        },
      },
    }),
  );
  await page.route('**/api/v1/deliveries/token-a11y', (route) =>
    route.fulfill({
      json: {
        publicOrderId: 'order-a11y',
        lyrics: [approvedLyric],
        audio: [{ variant: 1 }, { variant: 2 }],
      },
    }),
  );

  const routes = [
    '/',
    '/criar',
    '/criar/historia',
    '/criar/letra?pedido=order-a11y',
    '/criar/checkout?pedido=order-a11y',
    '/minhas-musicas',
    '/pedido/order-a11y',
    '/pedido/order-a11y/entrega',
    '/entrega/token-a11y',
    '/privacidade',
    '/termos',
    '/rota-inexistente',
  ];
  for (const route of routes) {
    await page.goto(route);
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading, route).toHaveCount(1);
    await expect(heading, route).toBeVisible();
    const metrics = await heading.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        fontSize: Number.parseFloat(style.fontSize),
        letterSpacing: Number.parseFloat(style.letterSpacing),
        lineHeight: Number.parseFloat(style.lineHeight),
        text: node.textContent?.trim() ?? '',
      };
    });
    expect(metrics.lineHeight / metrics.fontSize, `${route}: line-height`).toBeGreaterThanOrEqual(
      1.05,
    );
    expect(metrics.letterSpacing / metrics.fontSize, `${route}: tracking`).toBeGreaterThanOrEqual(
      -0.04,
    );
    expect(metrics.text, `${route}: título`).not.toMatch(/\S{45}/);
  }
});

test('viewport 390 mantém conteúdo e ações dentro da tela com alvos de 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const viewports = ['/', '/criar', '/criar/checkout?pedido=order-a11y', '/minhas-musicas'];
  for (const viewport of viewports) {
    await page.goto(viewport);
    await expect
      .poll(
        () =>
          page.evaluate(() => ({
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
          })),
        viewport,
      )
      .toEqual({ clientWidth: 390, scrollWidth: 390 });
  }
  await page.goto('/');
  const primary = page.getByRole('main').getByRole('link', { name: /criar minha música/i });
  const box = await primary.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toBeVisible();
  const smallTargets = page.getByRole('main').getByRole('link', { name: /criar minha música/i });
  for (let index = 0; index < (await smallTargets.count()); index += 1) {
    const target = smallTargets.nth(index);
    if (!(await target.isVisible())) continue;
    const size = await target.boundingBox();
    expect(size?.height, `link ${index}`).toBeGreaterThanOrEqual(44);
    expect(size?.width, `link ${index}`).toBeGreaterThanOrEqual(44);
  }
  expect(
    await heading.evaluate((node) => Number.parseFloat(getComputedStyle(node).lineHeight)),
  ).toBeGreaterThanOrEqual(
    1.05 * (await heading.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))),
  );
});

test('reduced motion remove a animação decorativa da etapa atual', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/api/v1/orders/order-motion-1', (route) =>
    route.fulfill({
      json: {
        order: { publicId: 'order-motion-1', status: 'audio_generating', priceCents: 4990 },
        lyrics: [],
        audio: [],
      },
    }),
  );
  await page.goto('/pedido/order-motion-1');
  const current = page.locator('.journey-names [data-state="current"]');
  await expect(current).toBeVisible();
  const marker = current.locator('.journey-dot');
  await expect
    .poll(() => marker.evaluate((node) => getComputedStyle(node).animationName))
    .not.toBe('none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() => marker.evaluate((node) => getComputedStyle(node).animationName))
    .toBe('none');
});

test('estado de erro mantém um único conteúdo principal e um único título', async ({ page }) => {
  await page.route('**/api/v1/deliveries/token-invalid', (route) =>
    route.fulfill({ status: 404, json: { error: { message: 'Link inválido' } } }),
  );
  await page.goto('/entrega/token-invalid');
  await expect(page.getByRole('alert')).toContainText(/link de entrega inválido/i);
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
});

test('captura os estados finais nos viewports da auditoria', async ({ page }) => {
  const visualLyric = {
    number: 1,
    kind: 'approved',
    approvedAt: '2026-09-04T12:00:00.000Z',
    content: {
      title: 'A Resenha da Bia',
      fullLyrics: 'Bia chegou\nA turma canta junto\nBia, vem cantar!',
    },
  };
  const visualOrders = {
    'order-story-visual': { status: 'story_completed', lyrics: [], audio: [] },
    'order-generating-visual': { status: 'lyrics_generating', lyrics: [], audio: [] },
    'order-ready-visual': {
      status: 'lyrics_ready',
      lyrics: [{ ...visualLyric, kind: 'generated', approvedAt: null }],
      audio: [],
    },
    'order-approved-visual': { status: 'lyrics_approved', lyrics: [visualLyric], audio: [] },
    'order-production-visual': { status: 'audio_generating', lyrics: [visualLyric], audio: [] },
    'order-delivered-visual': {
      status: 'delivered',
      lyrics: [visualLyric],
      audio: [
        { variant: 1, status: 'completed' },
        { variant: 2, status: 'completed' },
      ],
    },
    'order-failed-visual': { status: 'failed', lyrics: [visualLyric], audio: [] },
  } as const;
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/analytics/beacon')) return route.fulfill({ json: { accepted: true } });
    if (path.endsWith('/products'))
      return route.fulfill({
        json: [{ type: 'custom_song', name: 'Sua música', priceCents: 4990, active: true }],
      });
    const publicId = path.match(/\/orders\/([^/]+)$/)?.[1];
    const order = publicId ? visualOrders[publicId as keyof typeof visualOrders] : undefined;
    if (order)
      return route.fulfill({
        json: {
          order: { publicId, status: order.status, priceCents: 4990 },
          lyrics: order.lyrics,
          audio: order.audio,
          payment: {
            label: 'AbacatePay',
            checkoutAllowed: true,
            configured: false,
            devFallback: true,
          },
        },
      });
    if (new URL(route.request().url()).pathname.endsWith('/configuration'))
      return route.fulfill({ json: publicConfiguration });
    return route.fulfill({ status: 404, json: { error: { message: 'Rota visual ausente' } } });
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /tem coisa que/i })).toBeVisible();
  await page.screenshot({ path: 'test-results/visual-evidence/01-entrada-desktop.png' });

  await page.goto('/criar');
  await expect(page.getByRole('heading', { name: /toda música começa/i })).toBeVisible();
  await page.screenshot({
    path: 'test-results/visual-evidence/02-formulario-vazio-desktop.png',
  });

  await page.getByRole('button', { name: /^continuar$/i }).click();
  await expect(page.getByLabel(/quem ou o que inspira/i)).toHaveAttribute('aria-invalid', 'true');
  await page.screenshot({ path: 'test-results/visual-evidence/03-validacao-desktop.png' });

  await page.getByLabel(/quem ou o que inspira/i).fill('Bia');
  await page.getByLabel(/qual é a ocasião/i).fill('Aniversário');
  await finishStoryPreparation(page);
  await expect(page.getByRole('status')).toContainText('Rascunho salvo');
  await page.screenshot({
    path: 'test-results/visual-evidence/04-formulario-preenchido-desktop.png',
  });

  await page.goto('/criar/letra?pedido=order-story-visual');
  await expect(page.getByRole('button', { name: /criar letra agora/i })).toBeVisible();
  await page.screenshot({
    path: 'test-results/visual-evidence/05-geracao-pronta-para-iniciar-desktop.png',
  });

  await page.goto('/criar/letra?pedido=order-generating-visual');
  await expect(page.getByRole('status')).toContainText('Criando sua letra');
  await page.screenshot({
    path: 'test-results/visual-evidence/06-geracao-loading-desktop.png',
  });

  await page.goto('/criar/letra?pedido=order-ready-visual');
  await page.getByRole('button', { name: 'Editar letra' }).click();
  await expect(page.getByRole('textbox', { name: /letra da música/i })).toBeVisible();
  await page.getByRole('button', { name: /salvar alterações/i }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: /salvar alterações/i })).toBeInViewport();
  await expect(page.getByRole('button', { name: /aprovar letra/i })).toBeInViewport();
  await page.screenshot({
    path: 'test-results/visual-evidence/07-revisao-letra-desktop.png',
  });

  await page.goto('/criar/checkout?pedido=order-approved-visual');
  await expect(
    page.getByRole('button', { name: /confirmar pagamento \(ambiente local\)/i }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/visual-evidence/08-checkout-desktop.png' });

  await page.goto('/pedido/order-production-visual');
  await expect(page.getByRole('heading', { name: /sendo produzida/i })).toBeVisible();
  await page.screenshot({
    path: 'test-results/visual-evidence/09-processamento-desktop.png',
  });

  await page.goto('/pedido/order-delivered-visual');
  await expect(page.getByRole('heading', { name: /música está pronta/i })).toBeVisible();
  await page.screenshot({ path: 'test-results/visual-evidence/10-sucesso-desktop.png' });

  await page.goto('/pedido/order-failed-visual');
  await expect(page.getByRole('heading', { name: /problema na produção/i })).toBeVisible();
  await page.screenshot({ path: 'test-results/visual-evidence/11-erro-desktop.png' });

  await page.evaluate(() => window.localStorage.removeItem('resenha:my-orders'));
  await page.goto('/minhas-musicas');
  await expect(page.getByRole('heading', { name: /ainda não criou/i })).toBeVisible();
  await page.screenshot({ path: 'test-results/visual-evidence/12-vazio-desktop.png' });

  await page.evaluate(() => window.localStorage.removeItem('resenha:story-draft'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /tem coisa que/i })).toBeVisible();
  await page.screenshot({ path: 'test-results/visual-evidence/13-entrada-mobile.png' });
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(page.getByRole('button', { name: 'Fechar menu' })).toBeVisible();
  await page.screenshot({ path: 'test-results/visual-evidence/14-menu-mobile.png' });

  await page.goto('/criar');
  await expect(page.getByRole('heading', { name: /toda música começa/i })).toBeVisible();
  await page.screenshot({ path: 'test-results/visual-evidence/15-formulario-mobile.png' });
});
