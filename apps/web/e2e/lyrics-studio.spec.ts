import { expect, test } from '@playwright/test';
import { publicConfiguration } from './public-configuration';

const original = {
  number: 1,
  kind: 'generated',
  approvedAt: null,
  content: {
    title: 'Nossa viagem',
    summary: 'Uma história entre amigos',
    fullLyrics: '[Verso]\nA estrada nos levou\nAté o mar\n\n[Refrão]\nVamos cantar',
    sections: [],
    musicalDirection: {
      genre: 'MPB',
      mood: 'Feliz',
      tempo: 'medium',
      voice: 'either',
      instrumentation: [],
    },
  },
};

test('estúdio salva título e versos antes do refino explícito e conserva versões anteriores', async ({
  page,
}) => {
  const versions = [original];
  let refinements = 0;
  let edits = 0;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/configuration')) return route.fulfill({ json: publicConfiguration });
    if (path.endsWith('/analytics/beacon')) return route.fulfill({ status: 204 });
    if (request.method() === 'PATCH') {
      edits++;
      expect(request.postDataJSON()).toMatchObject({
        title: 'Uma viagem nossa',
        fullLyrics: 'Primeira estrofe\n\nNosso refrão',
      });
      versions.push({ ...original, number: 2, kind: 'edited', content: request.postDataJSON() });
      return route.fulfill({ json: { number: 2, kind: 'edited' } });
    }
    if (path.endsWith('/lyrics/generate')) {
      refinements++;
      expect(request.postDataJSON()).toEqual({
        instructions: 'Crie um refrão mais marcante e fácil de cantar, preservando a história.',
        baseVersion: 2,
      });
      versions.push({
        ...original,
        number: 3,
        content: {
          ...versions[1]!.content,
          title: 'A viagem virou canção',
          fullLyrics: '[Refrão]\nNosso novo refrão',
        },
      });
      return route.fulfill({ json: { number: 3, kind: 'generated' } });
    }
    return route.fulfill({
      json: {
        order: {
          publicId: 'lyric-studio',
          productType: 'custom_song',
          status: 'lyrics_ready',
          priceCents: 0,
        },
        lyrics: versions,
        remainingGenerations: refinements ? 2 : 3,
        audio: [],
        privateAccess: true,
      },
    });
  });
  await page.goto('/criar/letra?pedido=lyric-studio');
  await expect(page.getByRole('heading', { name: 'Verso', exact: true })).toBeVisible();
  expect(refinements).toBe(0);
  await page.getByRole('button', { name: 'Editar letra' }).click();
  await page.getByRole('textbox', { name: 'Título da música' }).fill('Uma viagem nossa');
  await page
    .getByRole('textbox', { name: 'Letra da música' })
    .fill('Primeira estrofe\n\nNosso refrão');
  await page.getByText('Quer outra direção para a letra?', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Aprovar letra' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Criar nova versão', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText('Nova versão salva.', { exact: true })).toBeVisible();
  expect(edits).toBe(1);
  await page.getByRole('button', { name: 'Refrão marcante', exact: true }).click();
  expect(refinements).toBe(0);
  await page.getByRole('button', { name: 'Criar nova versão', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A viagem virou canção' })).toBeVisible();
  expect(refinements).toBe(1);
  await page.getByText('Versões anteriores da letra', { exact: true }).click();
  await page.getByRole('button', { name: 'Versão 2', exact: true }).click();
  await expect(page.getByText('Primeira estrofe', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aprovar letra' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Criar nova versão', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Voltar à versão atual' }).click();
  await expect(page.getByText('Nosso novo refrão', { exact: true })).toBeVisible();
});

test('produção distingue fila, criação e revisão com contagem única e sem movimento reduzido', async ({
  page,
}) => {
  let reads = 0;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/v1/orders/production-live', (route) => {
    reads++;
    return route.fulfill({
      json: {
        order: {
          publicId: 'production-live',
          status:
            reads === 1 ? 'audio_queued' : reads === 2 ? 'audio_generating' : 'review_required',
          priceCents: 0,
        },
        lyrics: [{ ...original, approvedAt: '2026-09-07T10:00:00Z' }],
        audio:
          reads === 1
            ? []
            : reads === 2
              ? [
                  { variant: 1, status: 'completed' },
                  { variant: 1, status: 'completed' },
                ]
              : [
                  { variant: 1, status: 'completed' },
                  { variant: 2, status: 'completed' },
                ],
      },
    });
  });
  await page.goto('/pedido/production-live');
  await expect(
    page.getByRole('heading', { name: 'Sua música está na fila de criação' }),
  ).toBeVisible();
  await expect(page.getByText('0 de 2 versões prontas')).toBeVisible();
  await expect(page.locator('.production-symbol')).toHaveCSS('animation-name', 'none');
  await expect(page.getByText(/última verificação/i)).toBeVisible();
  await expect(page.locator('.approved-lyrics-disclosure')).not.toHaveAttribute('open');
  await expect(page.getByText('1 de 2 versões prontas')).toBeVisible({ timeout: 4000 });
  await expect(page.getByRole('heading', { name: 'Sua criação está em andamento' })).toBeVisible();
  await expect(page.getByText('2 de 2 versões prontas')).toBeVisible({ timeout: 4000 });
  await expect(
    page.getByRole('heading', { name: 'Sua música está em revisão', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Versões prontas para revisão' })).toBeVisible();
  await expect(page.locator('.production-symbol')).not.toHaveClass(/is-active/);
  await expect(page.locator('.production-status')).not.toContainText(/\d+%/);
});
