import { expect, test, type Locator, type Page } from '@playwright/test';
import { publicConfiguration } from './public-configuration';
async function keyboardTo(page: Page, locator: Locator) {
  for (let count = 0; count < 80; count += 1) {
    if (await locator.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Controle não alcançável pelo teclado');
}
const lyrics = {
  number: 1,
  kind: 'generated',
  content: {
    title: 'Nossa viagem',
    summary: 'Uma viagem especial',
    fullLyrics: 'A estrada nos levou\nAté o mar',
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
test('teclado completa preparação, geração, revisão e pagamento com foco previsível', async ({
  page,
}) => {
  let state = 'story_completed';
  let approved = false;
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/configuration')) return route.fulfill({ json: publicConfiguration });
    if (path.endsWith('/analytics/beacon')) return route.fulfill({ json: { accepted: true } });
    if (path.endsWith('/orders'))
      return route.fulfill({ status: 201, json: { publicId: 'keyboard-order' } });
    if (path.endsWith('/story')) {
      expect(route.request().postDataJSON()).toMatchObject({
        productType: 'custom_song',
        brief: 'Uma viagem em que encontramos o mar.',
        facts: [],
      });
      return route.fulfill({ json: { saved: true } });
    }
    if (path.endsWith('/lyrics/generate')) {
      state = 'lyrics_ready';
      return route.fulfill({ json: lyrics });
    }
    if (path.endsWith('/lyrics/1/approve')) {
      state = 'lyrics_approved';
      approved = true;
      return route.fulfill({ json: { approved: true } });
    }
    if (path.endsWith('/checkout')) {
      state = 'paid';
      return route.fulfill({ json: { checkoutUrl: '/pedido/keyboard-order' } });
    }
    if (path.endsWith('/orders/keyboard-order'))
      return route.fulfill({
        json: {
          order: { publicId: 'keyboard-order', status: state, priceCents: 5900 },
          story: {
            subjectName: 'Nossa viagem',
            occasion: 'Celebrar uma aventura',
            genre: 'MPB',
            mood: 'Feliz',
          },
          lyrics:
            state === 'story_completed'
              ? []
              : [{ ...lyrics, approvedAt: approved ? '2026-09-07T10:00:00Z' : null }],
          audio: [],
          payment: {
            configured: true,
            devFallback: false,
            label: 'AbacatePay',
            checkoutAllowed: true,
          },
        },
      });
    return route.fulfill({ status: 404, json: { error: { message: 'Fixture ausente' } } });
  });
  await page.goto('/criar');
  await keyboardTo(page, page.getByLabel(/quem ou o que inspira/i));
  await page.keyboard.type('Nossa viagem');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Celebrar uma aventura');
  await keyboardTo(page, page.getByRole('button', { name: /^continuar$/i }));
  await page.keyboard.press('Enter');
  await keyboardTo(page, page.getByLabel(/conte sua história/i));
  await page.keyboard.type('Uma viagem em que encontramos o mar.');
  await keyboardTo(page, page.getByRole('button', { name: /^continuar$/i }));
  await page.keyboard.press('Enter');
  await keyboardTo(page, page.getByRole('button', { name: /^continuar$/i }));
  await page.keyboard.press('Enter');
  await keyboardTo(page, page.getByLabel(/^seu nome$/i));
  await page.keyboard.type('Nina');
  await page.keyboard.press('Tab');
  await page.keyboard.type('nina@example.test');
  await keyboardTo(page, page.getByRole('checkbox', { name: /aceito os termos/i }));
  await page.keyboard.press('Space');
  await keyboardTo(page, page.getByRole('checkbox', { name: /posso usar os detalhes/i }));
  await page.keyboard.press('Space');
  await keyboardTo(page, page.getByRole('button', { name: /salvar história e continuar/i }));
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: /vamos dar palavras à sua ideia/i }),
  ).toBeVisible();
  await page.getByText('O que acontece ao criar a letra?', { exact: true }).click();
  await expect(page.getByText(/letra revisável em português/i)).toBeVisible();
  await expect(page.getByText('Nossa viagem', { exact: true })).toBeVisible();
  await keyboardTo(page, page.getByRole('button', { name: /criar letra agora/i }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Editar letra' })).toBeVisible();
  await keyboardTo(page, page.getByRole('button', { name: /aprovar letra/i }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /resumo do pedido/i })).toBeVisible();
  await keyboardTo(page, page.getByRole('button', { name: /pagar com abacatepay/i }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /sendo produzida/i })).toBeVisible();
});
test('sem geração disponível preserva história e não oferece chamada', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/configuration'))
      return route.fulfill({
        json: { ...publicConfiguration, generation: { lyricsAvailable: false } },
      });
    if (path.endsWith('/lyrics/generate')) {
      calls++;
      return route.abort();
    }
    return route.fulfill({
      json: {
        order: { publicId: 'unavailable', status: 'story_completed', priceCents: 0 },
        story: { subjectName: 'Uma ideia' },
        lyrics: [],
        audio: [],
      },
    });
  });
  await page.goto('/criar/letra?pedido=unavailable');
  await expect(page.getByRole('button', { name: /criar letra agora/i })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText(/sua história está salva/i);
  expect(calls).toBe(0);
});
test('ajuste recebido aparece no acompanhamento e no admin, que pode revogar acesso', async ({
  page,
}) => {
  let revised = false;
  let revoked = false;
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/configuration')) return route.fulfill({ json: publicConfiguration });
    if (path.endsWith('/access/revoke')) {
      revoked = true;
      return route.fulfill({ json: { revoked: true } });
    }
    if (path.includes('/admin/orders/'))
      return route.fulfill({
        json: {
          order: {
            id: 'adjust-internal',
            publicId: 'adjust',
            productType: 'custom_song',
            status: 'revision_requested',
            priceCents: 5900,
            createdAt: '2026-09-07T10:00:00Z',
          },
          story: { subjectName: 'Nossa viagem' },
          lyrics: [],
          payments: [],
          jobs: [],
          audio: [],
          notes: [],
          aiUsage: [],
          aiCost: {
            totalUsd: '0',
            lyricsUsd: '0',
            audioUsd: '0',
            calls: 0,
            inputTokens: 0,
            outputTokens: 0,
          },
          revisionRequests: revised
            ? [
                {
                  message: 'A pronúncia do nome precisa de ajuste.',
                  createdAt: '2026-09-07T11:00:00Z',
                  status: 'pending',
                },
              ]
            : [],
        },
      });
    if (path.endsWith('/revision-requests')) {
      expect(route.request().postDataJSON()).toEqual({
        message: 'A pronúncia do nome precisa de ajuste.',
      });
      revised = true;
      return route.fulfill({ json: { received: true } });
    }
    if (path.endsWith('/cover')) return route.fulfill({ json: { available: false, cover: null } });
    return route.fulfill({
      json: {
        order: {
          publicId: 'adjust',
          status: revised ? 'revision_requested' : 'delivered',
          priceCents: 5900,
        },
        story: { subjectName: 'Nossa viagem' },
        lyrics: [{ ...lyrics, approvedAt: '2026-09-07T10:00:00Z' }],
        audio: [
          { variant: 1, status: 'completed' },
          { variant: 2, status: 'completed' },
        ],
        privateAccess: true,
      },
    });
  });
  await page.goto('/pedido/adjust/entrega');
  await page.getByText('Solicitar ajuste', { exact: true }).click();
  await page
    .getByLabel(/o que você gostaria de ajustar/i)
    .fill('A pronúncia do nome precisa de ajuste.');
  await page.getByRole('button', { name: /enviar solicitação de ajuste/i }).click();
  await expect(page).toHaveURL(/\/pedido\/adjust$/);
  expect(revised).toBe(true);
  await page.goto('/admin/pedidos/adjust-internal');
  await expect(page.getByRole('heading', { name: 'Solicitações de ajuste' })).toBeVisible();
  await expect(page.getByText('A pronúncia do nome precisa de ajuste.')).toBeVisible();
  await expect(page.getByText(/aguardando avaliação/i)).toBeVisible();
  await page.getByRole('button', { name: 'Revogar acessos anteriores' }).click();
  await expect(page.getByText(/invalida sessões e links privados anteriores/i)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('status')).toContainText('Acessos anteriores revogados.');
  expect(revoked).toBe(true);
});
test('cinco intenções da landing abrem o estúdio com a escolha preservada', async ({ page }) => {
  await page.route('**/api/v1/analytics/beacon', (route) =>
    route.fulfill({ json: { accepted: true } }),
  );
  await page.goto('/');
  for (const intention of ['amizade', 'amor', 'presente', 'homenagem', 'livre']) {
    await expect(page.locator(`.idea-grid a[href="/criar?ideia=${intention}"]`)).toBeVisible();
  }
  await page.getByRole('link', { name: /o amor de vocês/i }).click();
  await expect(page).toHaveURL(/\/criar\?ideia=amor$/);
  await expect(page.getByRole('radio', { name: /uma história de amor/i })).toBeChecked();
  await expect(page.getByLabel(/qual é a ocasião/i)).toHaveValue('');
});
test('menu móvel usa painel inteiro abaixo do cabeçalho sem comprimir a marca', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const header = page.locator('.site-header');
  const before = await header.boundingBox();
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  const dialog = await page.getByRole('dialog', { name: 'Menu' }).boundingBox();
  const after = await header.boundingBox();
  expect(dialog?.width).toBeGreaterThanOrEqual(380);
  expect(after?.height).toBeLessThan(110);
  expect(after?.height).toBe(before?.height);
  expect(dialog?.y).toBeGreaterThanOrEqual((before?.y ?? 0) + (before?.height ?? 0) - 1);
});
test('acesso de leitura permite ouvir sem oferecer solicitação de ajuste', async ({ page }) => {
  await page.route('**/api/v1/orders/view-only', (route) =>
    route.fulfill({
      json: {
        order: { publicId: 'view-only', status: 'delivered', priceCents: 5900 },
        lyrics: [{ ...lyrics, approvedAt: '2026-09-07T10:00:00Z' }],
        audio: [
          { variant: 1, status: 'completed' },
          { variant: 2, status: 'completed' },
        ],
        privateAccess: false,
      },
    }),
  );
  await page.goto('/pedido/view-only/entrega');
  await expect(page.getByRole('heading', { name: 'Ouvir e baixar' })).toBeVisible();
  await expect(page.getByRole('button', { name: /enviar solicitação de ajuste/i })).toHaveCount(0);
  await expect(page.getByLabel(/o que você gostaria de ajustar/i)).toHaveCount(0);
});

test('UAT: intenção não inventa ocasião e Outro permanece exclusivo após reload nos dois grupos', async ({
  page,
}) => {
  await page.route('**/api/v1/configuration', (route) =>
    route.fulfill({ json: { ...publicConfiguration, generation: { lyricsAvailable: false } } }),
  );
  await page.goto('/criar?ideia=amor');
  await expect(page.getByText(/criação da letra temporariamente indisponível/i)).toBeVisible();
  await expect(page.getByLabel(/qual é a ocasião/i)).toHaveValue('');
  await page.getByLabel(/quem ou o que inspira/i).fill('Uma viagem');
  await page.getByRole('radio', { name: /uma homenagem/i }).check();
  await expect(page.getByLabel(/qual é a ocasião/i)).toHaveValue('');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByLabel(/conte sua história/i).fill('Uma viagem que virou amizade para a vida.');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  for (const [legend, label, preset, custom] of [
    ['Estilo musical', 'Seu estilo', 'Pop', 'Indie folk brasileiro'],
    ['Clima da música', 'Seu clima', 'Animado', 'Esperançoso e contemplativo'],
  ] as const) {
    const group = page.getByRole('group', { name: legend });
    await expect(group.getByRole('radio', { name: preset, exact: true })).toBeChecked();
    await expect(page.getByRole('textbox', { name: label, exact: true })).toHaveCount(0);
    await group.getByRole('radio', { name: 'Outro', exact: true }).check();
    await page.getByRole('textbox', { name: label, exact: true }).fill(custom);
    await group.getByRole('radio', { name: preset, exact: true }).check();
    await expect(page.getByRole('textbox', { name: label, exact: true })).toHaveCount(0);
    await group.getByRole('radio', { name: 'Outro', exact: true }).check();
    await expect(page.getByRole('textbox', { name: label, exact: true })).toHaveValue(custom);
    await expect(group.locator('input[type="radio"]:checked')).toHaveCount(1);
  }
  await expect(page.getByRole('status')).toContainText('Rascunho salvo');
  await page.reload();
  await expect(page.getByLabel(/qual é a ocasião/i)).toHaveValue('');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Seu estilo', exact: true })).toHaveValue(
    'Indie folk brasileiro',
  );
  await expect(page.getByRole('textbox', { name: 'Seu clima', exact: true })).toHaveValue(
    'Esperançoso e contemplativo',
  );
  for (const legend of ['Estilo musical', 'Clima da música'])
    await expect(
      page.getByRole('group', { name: legend }).getByRole('radio', { name: 'Outro', exact: true }),
    ).toBeChecked();
});
