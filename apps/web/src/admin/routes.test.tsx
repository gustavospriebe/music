import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jobStatusPt } from './labels';
import { eventPt, maskEmail, nextActionPt, orderAgePt, paymentStatusPt, statusPt } from './labels';
import { AdminDashboard, AdminOrderDetail, AdminOrders } from './routes';

const apiMock = vi.hoisted(() => ({
  revokeAccess: vi.fn(),
  adminLogin: vi.fn(),
  adminLogout: vi.fn(),
  adminOrders: vi.fn(),
  adminOrder: vi.fn(),
  adminOverview: vi.fn(),
  aiUsageSummary: vi.fn(),
  analyticsFunnel: vi.fn(),
  retryJob: vi.fn(),
  adminRebuildAudio: vi.fn(),
  adminApproveAudio: vi.fn(),
  adminUpdateLyrics: vi.fn(),
  adminGenerateLyrics: vi.fn(),
  adminRetryEmail: vi.fn(),
  adminRegenerateAudio: vi.fn(),
  adminAssetStreamUrl: vi.fn(() => '/admin-asset'),
}));
vi.mock('../api', () => ({ api: apiMock }));

const renderAdmin = (path: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/pedidos" element={<AdminOrders />} />
          <Route path="/admin/pedidos/:orderId" element={<AdminOrderDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('tradução operacional e privacidade', () => {
  it('traduz status e eventos sem expor o inglês técnico', () => {
    expect(statusPt('review_required')).toBe('Aguardando revisão');
    expect(paymentStatusPt('approved')).toBe('Aprovado');
    expect(eventPt('checkout_started')).toBe('Pagamento iniciado');
    expect(nextActionPt('failed')).toMatch(/retry/i);
    expect(orderAgePt(new Date(Date.now() - 90 * 60_000).toISOString())).toMatch(/há 1 h/);
  });

  it('mascara e-mail sem devolver o endereço cheio', () => {
    expect(maskEmail('ana@example.test')).toBe('a•••@example.test');
    expect(maskEmail('sem-arroba')).toBe('e-mail oculto');
    expect(maskEmail('ana@example.test')).not.toContain('ana@');
  });
});

describe('cockpit administrativo', () => {
  beforeEach(() => {
    apiMock.adminOverview.mockReset();
    apiMock.adminOrders.mockReset();
    apiMock.adminOrder.mockReset();
    apiMock.aiUsageSummary.mockReset();
    apiMock.analyticsFunnel.mockReset();
  });

  it('prioriza alertas e usa totais do servidor, não da primeira página', async () => {
    apiMock.adminOverview.mockResolvedValue({
      totals: { orders: 120, paid: 40, revenueCents: 199600 },
      attention: { failed: 2, reviewRequired: 1, audioQueued: 3, lyricsGenerating: 1 },
    });
    apiMock.aiUsageSummary.mockResolvedValue({
      month: { totalUsd: '1.00', lyricsUsd: '0.60', audioUsd: '0.40', calls: 2, blocked: 0 },
      byDay: [],
    });
    apiMock.analyticsFunnel.mockResolvedValue({
      days: 30,
      steps: [{ event: 'paid', orders: 4, rateFromPrevious: null }],
      preOrder: [],
      perSaleUsd: '0.10',
      salesWithCost: 2,
    });
    apiMock.adminOrders.mockResolvedValue({ items: [], page: 1, total: 0, pageSize: 30 });
    const { container } = renderAdmin('/admin');
    const alertsHeading = await screen.findByRole('heading', { name: /precisam de decisão/i });
    expect(alertsHeading).toBeVisible();
    const cards = container.querySelector('.cards') as HTMLElement;
    expect(alertsHeading.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(
      screen.getByRole('navigation', { name: 'Administração' }).querySelectorAll('a'),
    ).not.toHaveLength(0);
    expect(screen.getByText(/120/)).toBeVisible();
    expect(screen.getByText(/R\$\s*1\.996,00/)).toBeVisible();
    expect(screen.getByText(/pagamento confirmado/i)).toBeVisible();
    expect(screen.queryByText(/order_created/)).not.toBeInTheDocument();
  });

  it('descobre falhas de etapas no overview, abre filtro operacional e permite removê-lo', async () => {
    apiMock.adminOverview.mockResolvedValue({
      totals: { orders: 2, paid: 2, revenueCents: 0 },
      attention: {
        failed: 0,
        failedOperationalOrders: 2,
        reviewRequired: 0,
        audioQueued: 0,
        lyricsGenerating: 0,
      },
    });
    apiMock.aiUsageSummary.mockResolvedValue({ month: null, byDay: [] });
    apiMock.analyticsFunnel.mockResolvedValue({
      days: 30,
      steps: [],
      preOrder: [],
      perSaleUsd: '0',
      salesWithCost: 0,
    });
    apiMock.adminOrders.mockResolvedValue({
      items: [
        {
          id: 'delivered-cover-failed',
          publicId: 'public',
          productType: 'custom_song',
          status: 'delivered',
          priceCents: 0,
          createdAt: new Date().toISOString(),
          subjectName: 'Canção entregue',
        },
      ],
      page: 1,
      total: 2,
      pageSize: 30,
    });
    renderAdmin('/admin');
    expect(await screen.findByText('2 pedidos com falhas em etapas')).toBeVisible();
    await userEvent.click(screen.getByRole('link', { name: 'Ver pedidos com falhas em etapas' }));
    expect(await screen.findByText(/filtro ativo: pedidos com falhas em etapas/i)).toBeVisible();
    expect(apiMock.adminOrders).toHaveBeenCalledWith('?attention=failures&page=1');
    expect(screen.getByText('Verificar etapa com falha')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Remover filtro de falhas' }));
    await waitFor(() => expect(apiMock.adminOrders).toHaveBeenCalledWith('?page=1'));
    expect(
      screen.queryByText(/filtro ativo: pedidos com falhas em etapas/i),
    ).not.toBeInTheDocument();
  });

  it('mostra shell persistente nas três rotas administrativas', async () => {
    apiMock.adminOverview.mockResolvedValue({
      totals: { orders: 1, paid: 0, revenueCents: 0 },
      attention: { failed: 0, reviewRequired: 0, audioQueued: 0, lyricsGenerating: 0 },
    });
    apiMock.aiUsageSummary.mockResolvedValue({ month: null, byDay: [] });
    apiMock.analyticsFunnel.mockResolvedValue({
      days: 30,
      steps: [],
      preOrder: [],
      perSaleUsd: '0',
      salesWithCost: 0,
    });
    apiMock.adminOrders.mockResolvedValue({ items: [], page: 1, total: 0, pageSize: 30 });
    apiMock.adminOrder.mockResolvedValue({
      order: {
        id: 'internal-id-1',
        productType: 'friend_roast',
        status: 'delivered',
        priceCents: 4990,
        createdAt: new Date().toISOString(),
      },
      story: null,
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
        inputTokens: 0,
        outputTokens: 0,
        calls: 0,
      },
    });
    for (const path of ['/admin', '/admin/pedidos', '/admin/pedidos/internal-id-1']) {
      const { unmount } = renderAdmin(path);
      const nav = await screen.findByRole('navigation', { name: 'Administração' });
      expect(nav).toBeVisible();
      expect(screen.getByText(/operação · dados sintéticos/i)).toBeVisible();
      expect(screen.getByRole('button', { name: /sair/i })).toBeVisible();
      expect(nav.querySelector('a[href="/admin"]')).not.toBeNull();
      expect(nav.querySelector('a[href="/admin/pedidos"]')).not.toBeNull();
      unmount();
    }
  });

  it('exibe vazio e erro da lista sem inventar métrica', async () => {
    apiMock.adminOrders.mockResolvedValueOnce({ items: [], page: 1, total: 0, pageSize: 30 });
    const empty = renderAdmin('/admin/pedidos');
    expect(
      await screen.findByText(/nenhum pedido encontrado para os filtros atuais/i),
    ).toBeVisible();
    empty.unmount();
    apiMock.adminOrders.mockRejectedValueOnce(new Error('falha na lista'));
    renderAdmin('/admin/pedidos');
    expect(await screen.findByText(/sessão administrativa inválida/i)).toBeVisible();
  });

  it('exibe erro do overview sem estimar totais', async () => {
    apiMock.adminOverview.mockRejectedValueOnce(new Error('falha no overview'));
    apiMock.aiUsageSummary.mockResolvedValue({ month: null, byDay: [] });
    apiMock.analyticsFunnel.mockResolvedValue({
      days: 30,
      steps: [],
      preOrder: [],
      perSaleUsd: '0',
      salesWithCost: 0,
    });
    renderAdmin('/admin');
    expect(await screen.findByText(/sessão administrativa inválida/i)).toBeVisible();
  });

  it('aplica filtros só no botão, pagina com total e traduz a lista', async () => {
    apiMock.adminOverview.mockResolvedValue({
      totals: { orders: 1, paid: 0, revenueCents: 0 },
      attention: { failed: 0, reviewRequired: 0, audioQueued: 0, lyricsGenerating: 0 },
    });
    apiMock.adminOrders.mockResolvedValue({
      items: [
        {
          id: 'internal-id-1',
          publicId: 'PUBLIC-1',
          productType: 'friend_roast',
          status: 'failed',
          priceCents: 4990,
          createdAt: new Date().toISOString(),
          subjectName: 'Bia',
        },
      ],
      page: 1,
      total: 61,
      pageSize: 30,
    });
    renderAdmin('/admin/pedidos');
    expect(await screen.findAllByText(/página 1 de 3/i)).not.toHaveLength(0);
    expect(screen.getAllByText(/falhou/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Bia')).toBeVisible();
    expect(screen.queryByText('PUBLIC-1')).not.toBeInTheDocument();
    expect(apiMock.adminOrders).toHaveBeenCalledTimes(1);
    expect(apiMock.adminOrders.mock.calls[0]?.[0]).toBe('?page=1');
    await userEvent.type(screen.getByLabelText(/buscar/i), ' search-typed ');
    expect(apiMock.adminOrders).toHaveBeenCalledTimes(1);
    await userEvent.selectOptions(screen.getByLabelText(/status/i), 'failed');
    await userEvent.click(screen.getByRole('button', { name: /^filtrar$/i }));
    await waitFor(() => expect(apiMock.adminOrders).toHaveBeenCalledTimes(2));
    expect(apiMock.adminOrders.mock.calls[1]?.[0]).toContain('status=failed');
    expect(apiMock.adminOrders.mock.calls[1]?.[0]).toContain('page=1');
  });

  it('secciona o detalhe, mascara PII e confirma ações com efeito', async () => {
    apiMock.adminOrder.mockResolvedValue({
      order: {
        id: 'order-9',
        productType: 'friend_roast',
        status: 'review_required',
        priceCents: 4990,
        createdAt: new Date().toISOString(),
      },
      story: {
        subjectName: 'Bia',
        occasion: 'Aniversário',
        buyerEmail: 'ana@example.test',
        facts: ['Bia canta', 'Bia dança'],
      },
      lyrics: [
        {
          id: 'lyric-1',
          number: 1,
          kind: 'approved',
          approvedAt: new Date().toISOString(),
          content: { title: 'A Resenha da Bia', fullLyrics: 'Bia chegou' },
        },
      ],
      payments: [{ id: 'pay-1', status: 'approved', amountCents: 4990 }],
      jobs: [
        {
          id: 'job-1',
          status: 'failed',
          type: 'generate_audio',
          lastError: 'falhou',
          canRetry: true,
        },
      ],
      recovery: {
        lyrics: { canEdit: true, canGenerate: false, reason: null },
        audio: { canRebuild: true, reason: null },
        cover: { canRetry: false, requiresReference: false, jobId: null, reason: null },
        email: { canRetry: false, reason: null },
      },
      audio: [{ id: 'audio-1', variant: 1, status: 'completed', assetId: 'asset-1' }],
      notes: [],
      aiUsage: [],
      aiCost: {
        totalUsd: '0',
        lyricsUsd: '0',
        audioUsd: '0',
        inputTokens: 0,
        outputTokens: 0,
        calls: 0,
      },
    });
    renderAdmin('/admin/pedidos/order-9');
    expect(await screen.findByRole('heading', { name: /história/i })).toBeVisible();
    expect(screen.getByText('a•••@example.test')).toBeVisible();
    expect(screen.queryByText(/ana@example\.test/)).not.toBeInTheDocument();
    expect(screen.queryByText('order-9')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/externalId|req /);
    expect(document.body.innerHTML).not.toMatch(/JSON\.stringify/);
    expect(screen.getByRole('heading', { name: /letra aprovada/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /pagamento/i })).toBeVisible();
    expect(screen.getByText(/aprovado/i)).toBeVisible();
    expect(screen.getByRole('heading', { name: /custo de ia/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /operação do pedido/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /áudios/i })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /retomar versões pendentes/i }));
    expect(
      screen.getByText(/mantém as versões prontas.*somente as versões que ainda faltam/i),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    await waitFor(() => expect(apiMock.retryJob).toHaveBeenCalledWith('job-1', undefined));
    await userEvent.click(
      screen.getByRole('button', { name: /aprovar faixa 1 e entregar pedido/i }),
    );
    expect(screen.getByText(/marca o pedido inteiro como entregue/i)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    await waitFor(() =>
      expect(apiMock.adminApproveAudio).toHaveBeenCalledWith('order-9', 'audio-1'),
    );
  });

  it('confirma rebuild do conjunto com efeito descrito', async () => {
    apiMock.adminOrder.mockResolvedValueOnce({
      order: {
        id: 'order-9',
        productType: 'friend_roast',
        status: 'failed',
        priceCents: 4990,
        createdAt: new Date().toISOString(),
      },
      recovery: {
        lyrics: { canEdit: true, canGenerate: false, reason: null },
        audio: { canRebuild: true, reason: null },
        cover: { canRetry: false, requiresReference: false, jobId: null, reason: null },
        email: { canRetry: false, reason: null },
      },
      story: null,
      lyrics: [
        {
          id: 'lyric-1',
          number: 1,
          kind: 'approved',
          approvedAt: new Date().toISOString(),
          content: { title: 'Título', fullLyrics: 'letra' },
        },
      ],
      payments: [],
      jobs: [],
      audio: [],
      notes: [],
      aiUsage: [],
      aiCost: {
        totalUsd: '0',
        lyricsUsd: '0',
        audioUsd: '0',
        inputTokens: 0,
        outputTokens: 0,
        calls: 0,
      },
    });
    renderAdmin('/admin/pedidos/order-9');
    await userEvent.click(
      await screen.findByRole('button', { name: /gerar as 2 versões do zero/i }),
    );
    expect(
      screen.getByText(
        /substitui os áudios existentes.*duas versões novamente.*última letra aprovada/i,
      ),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    await waitFor(() => expect(apiMock.adminRebuildAudio).toHaveBeenCalledWith('order-9'));
  });
});

const pollingOrder = (status: string, jobStatus: string) => ({
  order: {
    id: 'polling-order',
    publicId: 'public-polling',
    productType: 'custom_song',
    status,
    priceCents: 0,
    createdAt: '2026-09-07T12:00:00Z',
  },
  lyrics: [],
  payments: [],
  audio: [],
  notes: [],
  aiUsage: [],
  jobs: jobStatus
    ? [
        {
          id: 'polling-job',
          type: 'generate_audio',
          status: jobStatus,
          lastError: jobStatus === 'failed' ? 'Falha terminal na produção' : null,
        },
      ]
    : [],
  aiCost: {
    totalUsd: '0',
    lyricsUsd: '0',
    audioUsd: '0',
    inputTokens: 0,
    outputTokens: 0,
    calls: 0,
  },
});

describe('atualização do detalhe administrativo', () => {
  afterEach(() => vi.useRealTimers());
  it.each([
    ['audio_generating', 'processing', 'failed', 'failed'],
    ['audio_generating', '', 'failed', 'failed'],
    ['audio_queued', 'pending', 'review_required', 'completed'],
    ['delivered', 'processing', 'delivered', 'completed'],
  ])(
    'atualiza %s/%s para %s/%s sem reload e encerra consultas automáticas',
    async (initial, job, final, terminalJob) => {
      vi.useFakeTimers();
      apiMock.adminOrder
        .mockReset()
        .mockResolvedValueOnce(pollingOrder(initial, job))
        .mockResolvedValue(pollingOrder(final, terminalJob));
      const view = renderAdmin('/admin/pedidos/polling-order');
      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(screen.getByRole('heading', { name: `Pedido · ${statusPt(initial)}` })).toBeVisible();
      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(apiMock.adminOrder).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('heading', { name: `Pedido · ${statusPt(final)}` })).toBeVisible();
      expect(screen.getByText(jobStatusPt(terminalJob), { exact: true })).toBeVisible();
      await act(() => vi.advanceTimersByTimeAsync(15000));
      expect(apiMock.adminOrder).toHaveBeenCalledTimes(2);
      view.unmount();
    },
  );
  it('preserva os dados e informa falha transitória de atualização, recuperando no próximo ciclo', async () => {
    vi.useFakeTimers();
    apiMock.adminOrder
      .mockReset()
      .mockResolvedValueOnce(pollingOrder('audio_generating', 'processing'))
      .mockRejectedValueOnce(new Error('Rede indisponível'))
      .mockResolvedValue(pollingOrder('failed', 'failed'));
    const view = renderAdmin('/admin/pedidos/polling-order');
    await act(() => vi.advanceTimersByTimeAsync(1));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByRole('heading', { name: 'Pedido · Produzindo áudio' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível atualizar o pedido. Os dados exibidos são da última consulta concluída.',
    );
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByRole('heading', { name: 'Pedido · Falhou' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    view.unmount();
  });
  it('oculta o snapshot e interrompe polling quando a sessão expira durante atualização', async () => {
    vi.useFakeTimers();
    apiMock.adminOrder
      .mockReset()
      .mockResolvedValueOnce(pollingOrder('audio_generating', 'processing'))
      .mockRejectedValue(Object.assign(new Error('Sessão expirada'), { status: 401 }));
    const view = renderAdmin('/admin/pedidos/polling-order');
    await act(() => vi.advanceTimersByTimeAsync(1));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByText('Sessão administrativa inválida ou expirada.')).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Pedido · Produzindo áudio' }),
    ).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(15000));
    expect(apiMock.adminOrder).toHaveBeenCalledTimes(2);
    view.unmount();
  });
});
