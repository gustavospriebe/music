import { expect, test } from '@playwright/test';

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
  await page.goto('/');
  await expect
    .poll(() =>
      page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      })),
    )
    .toEqual({ clientWidth: 390, scrollWidth: 390 });
  const primary = page.getByRole('main').getByRole('link', { name: /criar minha música/i });
  const box = await primary.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toBeVisible();
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
  const current = page.locator('.production-rail [data-state="etapa-atual"]');
  await expect(current).toBeVisible();
  const marker = current.locator('.rail-marker');
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
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.screenshot({ path: '../../docs/audits/mvp-operavel/after/01-entrada-desktop.png' });

  await page.route('**/api/v1/orders/order-visual-1', (route) =>
    route.fulfill({
      json: {
        order: { publicId: 'order-visual-1', status: 'audio_generating', priceCents: 4990 },
        lyrics: [],
        audio: [],
      },
    }),
  );
  await page.goto('/pedido/order-visual-1');
  await expect(page.getByRole('heading', { name: /sendo produzida/i })).toBeVisible();
  await page.screenshot({
    path: '../../docs/audits/mvp-operavel/after/09-processamento-desktop.png',
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.screenshot({ path: '../../docs/audits/mvp-operavel/after/13-entrada-mobile.png' });
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.screenshot({ path: '../../docs/audits/mvp-operavel/after/14-menu-mobile.png' });
});
