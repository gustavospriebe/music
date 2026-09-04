import { expect, test } from '@playwright/test';

test('rascunho recarrega, erro recebe foco e retry remoto preserva a tentativa', async ({
  page,
}) => {
  const creationKeys: unknown[] = [];
  let storyAttempts = 0;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/analytics/beacon')) return route.fulfill({ json: { accepted: true } });
    if (request.method() === 'POST' && path.endsWith('/orders')) {
      const payload = request.postDataJSON() as { creationKey?: unknown };
      creationKeys.push(payload.creationKey);
      return route.fulfill({ status: 201, json: { publicId: 'order-retry-123' } });
    }
    if (request.method() === 'PATCH' && path.endsWith('/story')) {
      storyAttempts += 1;
      if (storyAttempts === 1)
        return route.fulfill({ status: 503, json: { error: { message: 'Rede instável' } } });
      return route.fulfill({ json: { saved: true } });
    }
    if (request.method() === 'GET' && path.endsWith('/orders/order-retry-123'))
      return route.fulfill({
        json: {
          order: { publicId: 'order-retry-123', status: 'story_completed', priceCents: 6789 },
          lyrics: [],
          audio: [],
        },
      });
    return route.fulfill({ status: 404, json: { error: { message: 'Rota não prevista' } } });
  });

  await page.goto('/criar');
  const subject = page.getByLabel(/para quem é a música/i);
  await subject.fill('Bia');
  await expect(page.getByRole('status')).toContainText('Rascunho salvo');
  await page.reload();
  await expect(subject).toHaveValue('Bia');

  await page.getByRole('button', { name: /gerar minha letra/i }).click();
  const occasion = page.getByLabel(/qual é a ocasião/i);
  await expect(occasion).toBeFocused();
  await expect(occasion).toHaveAttribute('aria-invalid', 'true');
  await occasion.fill('Aniversário');
  await page.getByLabel(/^seu nome$/i).fill('Nina');
  await page.getByLabel(/^seu e-mail$/i).fill('nina@example.test');
  await page
    .getByLabel(/histórias, apelidos/i)
    .fill('Sempre chega cantando\nTodo churrasco vira show');
  await page.getByLabel(/aceito os termos/i).check();
  await page.getByRole('button', { name: /gerar minha letra/i }).click();
  await expect(page.getByText('Rede instável')).toBeVisible();
  await page.getByRole('button', { name: /gerar minha letra/i }).click();
  await expect(page).toHaveURL(/\/criar\/letra\?pedido=order-retry-123/);
  expect(creationKeys).toHaveLength(2);
  expect(creationKeys[0]).toMatch(/^[0-9a-f-]{36}$/i);
  expect(creationKeys[1]).toBe(creationKeys[0]);
});

test('landing e checkout exibem o mesmo preço público; falha não inventa valor', async ({
  page,
}) => {
  await page.route('**/api/v1/products', (route) =>
    route.fulfill({
      json: [{ type: 'friend_roast', name: 'Música da Resenha', priceCents: 6789, active: true }],
    }),
  );
  await page.route('**/api/v1/orders/order-price-123', (route) =>
    route.fulfill({
      json: {
        order: { publicId: 'order-price-123', status: 'lyrics_approved', priceCents: 6789 },
        lyrics: [],
        audio: [],
      },
    }),
  );
  await page.goto('/');
  await expect(page.getByText(/R\$\s*67,89/)).toBeVisible();
  await page.goto('/criar/checkout?pedido=order-price-123');
  await expect(page.getByText(/R\$\s*67,89/)).toBeVisible();

  await page.unroute('**/api/v1/products');
  await page.route('**/api/v1/products', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'Catálogo indisponível' } } }),
  );
  await page.goto('/');
  await expect(page.getByText('Preço indisponível')).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText(/R\$/);
});

test('checkout dev confirma pelo pedido e anuncia a operação pendente', async ({ page }) => {
  let approvedPath = '';
  await page.route('**/api/v1/orders/order-dev-123', (route) =>
    route.fulfill({
      json: {
        order: { publicId: 'order-dev-123', status: 'lyrics_approved', priceCents: 4990 },
        lyrics: [],
        audio: [],
      },
    }),
  );
  await page.route('**/api/v1/orders/order-dev-123/checkout', (route) =>
    route.fulfill({ json: { checkoutUrl: '/pedido/order-dev-123', dev: true } }),
  );
  await page.route('**/api/v1/orders/order-dev-123/dev-payment/approve', async (route) => {
    approvedPath = new URL(route.request().url()).pathname;
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({ json: { approved: true } });
  });

  await page.goto('/criar/checkout?pedido=order-dev-123');
  const payment = page.getByRole('button', { name: /pagar com mercado pago/i });
  await payment.click();
  await expect(page.getByRole('status')).toHaveText('Confirmando pagamento');
  await expect(page.getByRole('button', { name: 'Confirmando pagamento' })).toBeDisabled();
  await expect(page).toHaveURL(/\/pedido\/order-dev-123/);
  expect(approvedPath).toBe('/api/v1/orders/order-dev-123/dev-payment/approve');
});
