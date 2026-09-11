import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderPlayer, OrderStatus } from './public';

const apiMock = vi.hoisted(() => ({ getOrder: vi.fn(), generateLyrics: vi.fn() }));
vi.mock('../api', () => ({ api: apiMock }));
const active = {
  order: { publicId: 'production-failure', status: 'audio_generating', priceCents: 5900 },
  lyrics: [
    {
      number: 1,
      kind: 'approved',
      approvedAt: '2026-09-07T20:00:00Z',
      content: { title: 'Nossa música', fullLyrics: 'Uma história que ficou' },
    },
  ],
  audio: [
    { variant: 1, status: 'completed' },
    { variant: 2, status: 'processing' },
  ],
  privateAccess: false,
};
const failed = {
  ...active,
  order: { ...active.order, status: 'failed' },
  audio: [
    { variant: 1, status: 'completed' },
    { variant: 2, status: 'failed' },
  ],
};
let client: QueryClient;
function page(player = false) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/pedido/production-failure${player ? '/entrega' : ''}`]}>
        <Routes>
          <Route path="/pedido/:publicOrderId" element={<OrderStatus />} />
          <Route path="/pedido/:publicOrderId/entrega" element={<OrderPlayer />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('atualização temporal da produção pública', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    apiMock.getOrder.mockReset().mockResolvedValueOnce(active).mockResolvedValue(failed);
    apiMock.generateLyrics.mockReset();
  });
  afterEach(() => {
    cleanup();
    client.clear();
    vi.useRealTimers();
  });

  it('polling substitui produção ativa por falha e remove atividade sem gerar novamente', async () => {
    const view = page();
    expect(await screen.findByText('1 de 2 versões prontas')).toBeVisible();
    expect(view.container.querySelector('.production-symbol.is-active')).not.toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(
      await screen.findByRole('heading', { name: 'Tivemos um problema na produção' }),
    ).toBeVisible();
    expect(screen.getByText(/seu pagamento permanece registrado/i)).toBeVisible();
    expect(view.container.querySelector('.production-status')).toBeNull();
    expect(view.container.querySelector('.production-symbol.is-active')).toBeNull();
    expect(screen.queryByText(/versões prontas/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /gerar|tentar novamente/i }),
    ).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(6000));
    expect(apiMock.getOrder).toHaveBeenCalledTimes(2);
    expect(apiMock.generateLyrics).not.toHaveBeenCalled();
  });

  it('player recebe falha por polling sem liberar áudio parcial e conduz ao status correto', async () => {
    const view = page(true);
    expect(
      await screen.findByText('As duas versões ainda não estão disponíveis para entrega.'),
    ).toBeVisible();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    await waitFor(() => expect(apiMock.getOrder).toHaveBeenCalledTimes(2));
    expect(client.getQueryData(['order', 'production-failure'])).toEqual(failed);
    expect(view.container.querySelector('audio')).toBeNull();
    expect(screen.queryByRole('link', { name: /baixar versão/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Ver status do pedido' }));
    expect(
      await screen.findByRole('heading', { name: 'Tivemos um problema na produção' }),
    ).toBeVisible();
    expect(view.container.querySelector('.production-status')).toBeNull();
    expect(apiMock.generateLyrics).not.toHaveBeenCalled();
  });
});
