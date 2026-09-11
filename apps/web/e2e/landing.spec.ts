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

test('landing e criação pública estão acessíveis', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /tem coisa que/i })).toBeVisible();
  await page
    .getByRole('link', { name: /criar minha música/i })
    .first()
    .click();
  await expect(page).toHaveURL(/criar$/);
  await expect(page.getByRole('heading', { name: /toda música começa/i })).toBeVisible();
});
