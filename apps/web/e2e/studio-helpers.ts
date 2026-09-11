import { type Page } from '@playwright/test';
export async function finishStoryPreparation(page: Page) {
  await page.getByRole('button', { name: /^continuar$/i }).click();
  await page
    .getByLabel(/conte sua história/i)
    .fill('Sempre chega cantando\nTodo churrasco vira show');
  await page.getByRole('button', { name: /^continuar$/i }).click();
  await page.getByRole('button', { name: /^continuar$/i }).click();
  await page.getByLabel(/^seu nome$/i).fill('Nina');
  await page.getByLabel(/^seu e-mail$/i).fill('nina@example.test');
  await page.getByLabel(/aceito os termos/i).check();
  await page.getByLabel(/posso usar os detalhes/i).check();
}
