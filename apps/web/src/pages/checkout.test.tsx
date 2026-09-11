import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
  configuration: vi.fn(),
  getOrder: vi.fn(),
  checkout: vi.fn(),
  approveDevPayment: vi.fn(),
}));
vi.mock('../api', () => ({
  api: apiMock,
  visitorId: () => '22222222-2222-4222-8222-222222222222',
}));

import { Checkout, OrderStatus } from './public';

const renderCheckout = (publicId: string) => {
  window.history.replaceState({}, '', `/criar/checkout?pedido=${publicId}`);
  window.sessionStorage.setItem('resenha:lastOrder', publicId);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/criar/checkout?pedido=${publicId}`]}>
        <Routes>
          <Route path="/criar/checkout" element={<Checkout />} />
          <Route path="/pedido/:publicOrderId" element={<p>Página do pedido</p>} />
          <Route path="/criar" element={<p>Formulário</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const baseOrder = {
  order: { publicId: 'order-pay-1', status: 'lyrics_approved', priceCents: 4990 },
  story: { subjectName: 'Bia' },
  lyrics: [
    {
      number: 1,
      kind: 'approved',
      approvedAt: '2026-09-04T12:00:00.000Z',
      content: { title: 'A Resenha da Bia' },
    },
  ],
  audio: [],
  privateAccess: true,
};

describe('checkout e confiança', () => {
  beforeEach(() => {
    apiMock.configuration.mockResolvedValue({
      commercial: { ready: false },
      payment: { label: 'AbacatePay' },
      supportEmail: null,
    });
    apiMock.getOrder.mockReset();
    apiMock.checkout.mockReset();
    apiMock.approveDevPayment.mockReset();
  });

  it('exibe resumo reconhecível com homenagem, preço e próxima etapa', async () => {
    apiMock.getOrder.mockResolvedValue({
      ...baseOrder,
      payment: {
        label: 'AbacatePay',
        checkoutAllowed: true,
        configured: true,
        devFallback: false,
      },
    });
    renderCheckout('order-pay-1');
    expect(await screen.findByRole('heading', { name: /resumo do pedido/i })).toBeVisible();
    expect(screen.getByText('Música da Resenha')).toBeVisible();
    expect(screen.getByText('A Resenha da Bia')).toBeVisible();
    expect(screen.getByText('Sua música', { exact: true })).toBeVisible();
    expect(screen.queryByText('Homenagem', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText(/R\$\s*49,90/)).toBeVisible();
    expect(screen.getByText(/duas versões de áudio e página privada/i)).toBeVisible();
    expect(screen.getByText(/pagamento e depois produção do áudio/i)).toBeVisible();
    expect(screen.getByText(/redirecionado ao abacatepay/i)).toBeVisible();
    expect(screen.queryByText(/condições da sua música/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/preparando a abertura das compras/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pagar com abacatepay/i })).toBeEnabled();
  });

  it('nasce desabilitado com motivo quando o provider não está configurado', async () => {
    apiMock.getOrder.mockResolvedValue({
      ...baseOrder,
      payment: {
        label: 'AbacatePay',
        checkoutAllowed: false,
        configured: false,
        devFallback: false,
      },
    });
    renderCheckout('order-pay-1');
    const button = await screen.findByRole('button', { name: /pagar com abacatepay/i });
    expect(button).toBeDisabled();
    expect(await screen.findByRole('status')).toHaveTextContent(/pagamento indisponível/i);
  });

  it('mantém o botão habilitado com fallback dev fora de produção', async () => {
    apiMock.getOrder.mockResolvedValue({
      ...baseOrder,
      payment: {
        label: 'AbacatePay',
        checkoutAllowed: true,
        configured: false,
        devFallback: true,
      },
    });
    renderCheckout('order-pay-1');
    expect(
      await screen.findByRole('button', { name: /confirmar pagamento \(ambiente local\)/i }),
    ).toBeEnabled();
    expect(screen.getByText(/confirmado localmente/i)).toBeVisible();
    expect(screen.queryByText(/redirecionado ao abacatepay/i)).not.toBeInTheDocument();
  });

  it('sai do checkout quando o pedido já não aceita pagamento', async () => {
    apiMock.getOrder.mockResolvedValue({
      ...baseOrder,
      order: { ...baseOrder.order, status: 'failed' },
      payment: {
        label: 'AbacatePay',
        checkoutAllowed: true,
        configured: false,
        devFallback: true,
      },
    });
    renderCheckout('order-pay-1');
    expect(await screen.findByText('Página do pedido')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /pagar|confirmar pagamento/i }),
    ).not.toBeInTheDocument();
  });

  it('não trata status ausente como pedido pago', async () => {
    apiMock.getOrder.mockResolvedValue({
      ...baseOrder,
      order: { publicId: 'order-pay-1', priceCents: 4990 },
      payment: {
        label: 'AbacatePay',
        checkoutAllowed: true,
        configured: true,
        devFallback: false,
      },
    });
    renderCheckout('order-pay-1');
    expect(
      await screen.findByText(/não foi possível abrir seu pedido para pagamento/i),
    ).toBeVisible();
    expect(screen.queryByText('Página do pedido')).not.toBeInTheDocument();
  });
  it('preço zero é indefinido e bloqueio comercial prevalece sobre credencial', async () => {
    apiMock.getOrder.mockResolvedValue({
      ...baseOrder,
      order: { ...baseOrder.order, priceCents: 0 },
      payment: {
        label: 'Outro provedor',
        configured: true,
        devFallback: false,
        checkoutAllowed: false,
        unavailableReason: 'Preço ainda não definido.',
      },
    });
    renderCheckout('order-pay-1');
    expect(await screen.findByText('Preço a definir')).toBeVisible();
    expect(screen.queryByText(/R\$\s*0,00/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagar com Outro provedor' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Preço ainda não definido.');
  });
  it('exibe políticas e suporte configurados sem fixar marca do pagamento', async () => {
    apiMock.configuration.mockResolvedValue({
      supportEmail: 'suporte@example.test',
      commercial: {
        ready: true,
        deliveryEstimate: 'Em até 2 dias úteis',
        revisionPolicy: 'Um ajuste incluído',
        refundPolicy: 'Reembolso conforme termos',
        usageLicense: 'Uso pessoal',
        termsUrl: 'https://example.test/termos',
        privacyUrl: 'https://example.test/privacidade',
      },
      payment: { label: 'Pagamento parceiro' },
    });
    apiMock.getOrder.mockResolvedValue({
      ...baseOrder,
      payment: {
        label: 'Pagamento parceiro',
        configured: true,
        devFallback: false,
        checkoutAllowed: true,
      },
    });
    renderCheckout('order-pay-1');
    expect(await screen.findByText('Em até 2 dias úteis')).toBeVisible();
    expect(screen.getByText('Um ajuste incluído')).toBeVisible();
    expect(screen.getByText('Reembolso conforme termos')).toBeVisible();
    expect(screen.getByRole('link', { name: 'suporte@example.test' })).toHaveAttribute(
      'href',
      'mailto:suporte@example.test',
    );
    expect(screen.getByRole('button', { name: 'Pagar com Pagamento parceiro' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Termos' })).toHaveAttribute(
      'href',
      'https://example.test/termos',
    );
  });
  it('não cria parágrafo vazio no resumo quando a ocasião não foi informada', async () => {
    apiMock.getOrder.mockResolvedValue({
      ...baseOrder,
      order: { ...baseOrder.order, status: 'story_completed' },
      story: { subjectName: 'Nossa viagem', occasion: '  ' },
      lyrics: [],
      privateAccess: false,
    });
    const view = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/pedido/order-pay-1']}>
          <Routes>
            <Route path="/pedido/:publicOrderId" element={<OrderStatus />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Nossa viagem', { exact: true })).toBeVisible();
    expect(view.container.querySelector('.song-brief p')).toBeNull();
  });
});
