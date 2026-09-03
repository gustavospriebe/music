import { expect, test } from '@playwright/test';

test('landing e criação pública estão acessíveis', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /sua história merece/i })).toBeVisible();
  await page
    .getByRole('link', { name: /criar minha música/i })
    .first()
    .click();
  await expect(page).toHaveURL(/criar$/);
  await expect(page.getByRole('heading', { name: /conte a resenha/i })).toBeVisible();
});
