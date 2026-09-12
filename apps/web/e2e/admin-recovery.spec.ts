import { publicConfiguration } from './public-configuration';
import { expect, test } from '@playwright/test';
const lyric = {
  id: 'lyric',
  number: 1,
  kind: 'approved',
  approvedAt: '2026-09-07T10:00:00Z',
  content: {
    title: 'Nossa canção',
    summary: 'Uma história',
    fullLyrics: 'Nossa história em um refrão',
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
const detail = {
  order: {
    id: 'admin-recovery',
    publicId: 'public-recovery',
    productType: 'custom_song',
    status: 'failed',
    priceCents: 0,
    createdAt: '2026-09-07T10:00:00Z',
  },
  lyrics: [lyric],
  jobs: [
    {
      id: 'audio-job',
      type: 'generate_audio',
      status: 'failed',
      attempts: 1,
      maxAttempts: 3,
      updatedAt: '2026-09-07T10:00:00Z',
      canRetry: true,
      retryBlockedReason: null,
      lastError: 'O provedor recusou o conteúdo.',
      errorCode: 'content_blocked',
    },
  ],
  audio: [],
  notes: [],
  aiUsage: [],
  payments: [{ id: 'payment', status: 'approved', amountCents: 0 }],
  recovery: {
    lyrics: { canGenerate: false, canEdit: true, reason: null },
    audio: { canRebuild: true, reason: null },
    cover: {
      canRetry: false,
      requiresReference: false,
      jobId: null as string | null,
      reason: null,
    },
    email: { canRetry: false, reason: null },
  },
  aiCost: {
    totalUsd: '0',
    lyricsUsd: '0',
    audioUsd: '0',
    inputTokens: 0,
    outputTokens: 0,
    calls: 0,
  },
};
test('admin revisa letra e retoma faltantes por confirmação, atualizando diagnóstico sem reload', async ({
  page,
}) => {
  let value = structuredClone(detail);
  let retries = 0;
  let rebuilds = 0;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/configuration')) return route.fulfill({ json: publicConfiguration });
    if (path.endsWith('/lyrics') && request.method() === 'PATCH') {
      expect(request.postDataJSON().fullLyrics).toBe('Uma nova letra revisada');
      value.lyrics = [{ ...lyric, number: 2, content: request.postDataJSON() }];
      return route.fulfill({ json: { id: 'lyric-2' } });
    }
    if (path.endsWith('/jobs/audio-job/retry')) {
      retries++;
      expect(request.postDataJSON()).toEqual({});
      value.order.status = 'audio_queued';
      value.jobs[0]!.status = 'pending';
      value.jobs[0]!.canRetry = false;
      return route.fulfill({ json: { queued: true } });
    }
    if (path.endsWith('/audio/rebuild')) {
      rebuilds++;
      return route.fulfill({ json: { queued: true } });
    }
    if (path.endsWith('/admin/orders/admin-recovery')) return route.fulfill({ json: value });
    return route.fulfill({ status: 204 });
  });
  await page.goto('/admin/pedidos/admin-recovery');
  await expect(page.getByText('Conteúdo recusado pelo provedor')).toBeVisible();
  expect(retries).toBe(0);
  await page
    .getByRole('textbox', { name: 'Texto da letra aprovada' })
    .fill('Uma nova letra revisada');
  await expect(
    page.getByRole('button', { name: 'Retomar versões pendentes', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Salvar nova versão aprovada' }).click();
  await expect(page.getByText('Nova versão da letra salva.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retomar versões pendentes', exact: true }).click();
  expect(retries).toBe(0);
  await expect(
    page.getByText('Mantém as versões prontas e cria somente as versões que ainda faltam.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar: Retomar versões pendentes' }).click();
  await expect(page.getByRole('heading', { name: 'Pedido · Áudio na fila' })).toBeVisible();
  await expect(
    page.getByText('Etapa reenfileirada. Acompanhe a atualização do processamento acima.'),
  ).toBeVisible();
  expect(retries).toBe(1);
  expect(rebuilds).toBe(0);
});

test('admin recupera capa com foto consentida e envia somente aviso de entrega', async ({
  page,
}) => {
  const value = structuredClone(detail);
  value.order.status = 'delivered';
  value.jobs = [];
  value.recovery.cover = {
    canRetry: true,
    requiresReference: true,
    jobId: 'cover-job',
    reason: null,
  };
  value.recovery.email.canRetry = true;
  let coverRequests = 0;
  let emailRequests = 0;
  let audioRequests = 0;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/configuration')) return route.fulfill({ json: publicConfiguration });
    if (path.endsWith('/jobs/cover-job/retry')) {
      coverRequests++;
      expect(request.headers()['content-type']).toContain('multipart/form-data; boundary=');
      const body = request.postData() ?? '';
      expect(body).toContain('name="consent"');
      expect(body).toContain('name="policyVersion"');
      expect(body).toContain(publicConfiguration.commercial.policyVersion);
      expect(body).toContain('true');
      expect(body).toContain('filename="reference.png"');
      value.recovery.cover.canRetry = false;
      return route.fulfill({ json: { queued: true } });
    }
    if (path.endsWith('/email/retry')) {
      emailRequests++;
      return route.fulfill({ json: { queued: true } });
    }
    if (path.includes('/audio/')) {
      audioRequests++;
      return route.fulfill({ json: { queued: true } });
    }
    if (path.endsWith('/admin/orders/admin-recovery')) return route.fulfill({ json: value });
    return route.fulfill({ status: 204 });
  });
  await page.goto('/admin/pedidos/admin-recovery');
  const coverButton = page.getByRole('button', { name: 'Retomar criação da capa', exact: true });
  await expect(coverButton).toBeDisabled();
  await page.getByLabel('Foto de referência').setInputFiles({
    name: 'reference.png',
    mimeType: 'image/png',
    buffer: Buffer.from('synthetic-reference'),
  });
  await expect(coverButton).toBeDisabled();
  await page.getByRole('checkbox', { name: /tenho autorização/i }).check();
  await coverButton.click();
  expect(coverRequests).toBe(0);
  await page.getByRole('button', { name: 'Confirmar: Retomar criação da capa' }).click();
  await expect(
    page.getByText('Etapa reenfileirada. Acompanhe a atualização do processamento acima.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reenviar aviso de entrega', exact: true }).click();
  await expect(page.getByText(/não gera áudio nem capa/i)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar: Reenviar aviso de entrega' }).click();
  await expect(page.getByText('Reenvio do aviso de entrega enfileirado.')).toBeVisible();
  expect(coverRequests).toBe(1);
  expect(emailRequests).toBe(1);
  expect(audioRequests).toBe(0);
});
