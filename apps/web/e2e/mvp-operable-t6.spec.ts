import { expect, test } from '@playwright/test';

const lyric = {
  number: 3,
  kind: 'generated',
  approvedAt: null,
  content: {
    title: 'A Resenha da Bia',
    summary: 'Demo local',
    musicalDirection: {
      genre: 'Pagode',
      mood: 'Animado',
      tempo: 'medium',
      voice: 'female',
      instrumentation: ['violão'],
    },
    sections: [{ type: 'chorus', label: 'Refrão', lyrics: 'Bia, vem cantar!' }],
    fullLyrics: 'Bia chegou\nA turma canta junto\nBia, vem cantar!',
  },
};

test('reload acompanha lyrics_generating por polling sem repetir POST', async ({ page }) => {
  let reads = 0;
  let generates = 0;
  await page.route('**/api/v1/orders/order-generating-1**', (route) => {
    if (route.request().method() === 'POST') {
      generates += 1;
      return route.fulfill({ json: { number: 3, kind: 'generated' } });
    }
    reads += 1;
    return route.fulfill({
      json: {
        order: {
          publicId: 'order-generating-1',
          status: reads >= 3 ? 'lyrics_ready' : 'lyrics_generating',
          priceCents: 4990,
        },
        lyrics: reads >= 3 ? [lyric] : [],
        audio: [],
      },
    });
  });
  await page.goto('/criar/letra?pedido=order-generating-1');
  await expect(page.getByRole('status')).toContainText('Criando sua letra');
  await page.reload();
  await expect(page.getByRole('textbox', { name: /letra da música/i })).toBeVisible({
    timeout: 8_000,
  });
  expect(generates).toBe(0);
});

test('falha de letra oferece retry e erro de edição mantém o texto visível', async ({ page }) => {
  let ready = false;
  await page.route('**/api/v1/orders/order-lyrics-failed**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path.endsWith('/lyrics/generate')) {
      ready = true;
      return route.fulfill({ json: { number: 3, kind: 'generated' } });
    }
    if (request.method() === 'PATCH' && path.includes('/lyrics/3'))
      return route.fulfill({
        status: 503,
        json: { error: { message: 'Não foi possível salvar' } },
      });
    return route.fulfill({
      json: {
        order: {
          publicId: 'order-lyrics-failed',
          status: ready ? 'lyrics_ready' : 'failed',
          priceCents: 4990,
        },
        lyrics: ready ? [lyric] : [],
        audio: [],
      },
    });
  });
  await page.goto('/criar/letra?pedido=order-lyrics-failed');
  await page.getByRole('button', { name: 'Tentar gerar novamente' }).click();
  const editor = page.getByRole('textbox', { name: /letra da música/i });
  await expect(editor).toBeVisible();
  await editor.fill('Texto que não pode sumir');
  await page.getByRole('button', { name: /salvar nova versão/i }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível salvar');
  await expect(editor).toHaveValue('Texto que não pode sumir');
});

test('salvar letra confirma a nova versão no status acessível', async ({ page }) => {
  await page.route('**/api/v1/orders/order-lyrics-saved**', (route) => {
    const request = route.request();
    if (request.method() === 'PATCH') return route.fulfill({ json: { number: 4, kind: 'edited' } });
    return route.fulfill({
      json: {
        order: { publicId: 'order-lyrics-saved', status: 'lyrics_ready', priceCents: 4990 },
        lyrics: [lyric],
        audio: [],
      },
    });
  });
  await page.goto('/criar/letra?pedido=order-lyrics-saved');
  await page.getByRole('textbox', { name: /letra da música/i }).fill('Versão quatro');
  await page.getByRole('button', { name: /salvar nova versão/i }).click();
  await expect(page.getByRole('status')).toHaveText('Nova versão salva.');
});

test('produção consulta estados ativos e para o polling na entrega', async ({ page }) => {
  const states = [
    'paid',
    'audio_queued',
    'audio_generating',
    'review_required',
    'revision_requested',
    'delivered',
  ] as const;
  let reads = 0;
  await page.route('**/api/v1/orders/order-polling-1', (route) => {
    const status = states[Math.min(reads, states.length - 1)];
    reads += 1;
    return route.fulfill({
      json: {
        order: { publicId: 'order-polling-1', status, priceCents: 4990 },
        lyrics: [{ ...lyric, kind: 'approved', approvedAt: new Date().toISOString() }],
        audio:
          status === 'delivered'
            ? [
                { variant: 1, status: 'completed' },
                { variant: 2, status: 'completed' },
              ]
            : [],
      },
    });
  });
  await page.goto('/pedido/order-polling-1');
  await expect(page.getByRole('link', { name: /ouvir versões/i })).toBeVisible({ timeout: 15_000 });
  expect(reads).toBe(states.length);
  await page.waitForTimeout(2_200);
  expect(reads).toBe(states.length);
});

test('status inconsistente não oferece mutação e falha paga não promete regeneração', async ({
  page,
}) => {
  let status: string | undefined = 'future_status';
  let approved = false;
  await page.route('**/api/v1/orders/order-state-1', (route) =>
    route.fulfill({
      json: {
        order: { publicId: 'order-state-1', ...(status ? { status } : {}), priceCents: 4990 },
        lyrics: approved
          ? [{ ...lyric, kind: 'approved', approvedAt: new Date().toISOString() }]
          : [],
        audio: [],
      },
    }),
  );
  await page.goto('/pedido/order-state-1');
  await expect(page.getByRole('alert')).toContainText(/estado inconsistente/i);
  await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);

  status = undefined;
  await page.reload();
  await expect(page.getByRole('alert')).toContainText(/estado inconsistente/i);

  status = 'failed';
  approved = true;
  await page.reload();
  await expect(page.getByRole('heading', { name: /problema na produção/i })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(/acompanhe este pedido/i);
  await expect(page.getByRole('main')).not.toContainText(/automatic|sem custo|vamos regerar/i);
});

test('entrega parcial é inconsistente; duas variantes concluem as cinco etapas', async ({
  page,
}) => {
  let audio = [{ variant: 1, status: 'completed' }];
  await page.route('**/api/v1/orders/order-delivery-1', (route) =>
    route.fulfill({
      json: {
        order: { publicId: 'order-delivery-1', status: 'delivered', priceCents: 4990 },
        lyrics: [{ ...lyric, kind: 'approved', approvedAt: new Date().toISOString() }],
        audio,
      },
    }),
  );
  await page.goto('/pedido/order-delivery-1');
  await expect(page.getByRole('alert')).toContainText(/entrega incompleta/i);
  audio = [
    { variant: 1, status: 'completed' },
    { variant: 2, status: 'completed' },
  ];
  await page.reload();
  await expect(
    page.getByRole('list', { name: /produção da música/i }).getByText('Concluído'),
  ).toHaveCount(5);
  await page.getByRole('link', { name: /ouvir versões/i }).click();
  await expect(page.getByRole('main').locator('audio')).toHaveCount(2);
  const downloads = page.getByRole('main').getByRole('link', { name: /baixar versão/i });
  await expect(downloads).toHaveCount(2);
  await expect(downloads.nth(0)).toHaveAttribute(
    'href',
    '/api/v1/orders/order-delivery-1/assets/1/download',
  );
  await expect(downloads.nth(1)).toHaveAttribute(
    'href',
    '/api/v1/orders/order-delivery-1/assets/2/download',
  );
});

test('histórico vazio explica o navegador e oferece criar música', async ({ page }) => {
  await page.goto('/minhas-musicas');
  await expect(page.getByRole('heading', { name: /ainda não criou/i })).toBeVisible();
  await expect(page.getByText(/neste navegador/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /criar minha música/i })).toHaveAttribute(
    'href',
    '/criar',
  );
});

test('salvar e aprovar nomeiam a espera, bloqueiam ambas as ações e preservam o editor', async ({
  page,
}) => {
  await page.route('**/api/v1/orders/order-editor-1**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'PATCH') {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return route.fulfill({
        status: 503,
        json: { error: { message: 'Falha ao salvar a versão' } },
      });
    }
    if (request.method() === 'POST' && path.endsWith('/approve')) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return route.fulfill({
        status: 503,
        json: { error: { message: 'Falha ao aprovar a letra' } },
      });
    }
    return route.fulfill({
      json: {
        order: { publicId: 'order-editor-1', status: 'lyrics_ready', priceCents: 4990 },
        lyrics: [lyric],
        audio: [],
      },
    });
  });
  await page.goto('/criar/letra?pedido=order-editor-1');
  const editor = page.getByRole('textbox', { name: /letra da música/i });
  await editor.fill('Texto em edição permanece aqui');

  await page.getByRole('button', { name: /salvar nova versão/i }).click();
  await expect(page.getByRole('button', { name: 'Salvando versão' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Salvamento em andamento' })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('Falha ao salvar a versão');
  await expect(editor).toHaveValue('Texto em edição permanece aqui');

  await page.getByRole('button', { name: /aprovar letra/i }).click();
  await expect(page.getByRole('button', { name: 'Aprovação em andamento' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Aprovando letra' })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('Falha ao aprovar a letra');
  await expect(editor).toHaveValue('Texto em edição permanece aqui');
});
