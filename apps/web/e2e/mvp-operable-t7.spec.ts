import { expect, test } from '@playwright/test';

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
