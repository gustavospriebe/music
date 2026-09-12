import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
  configuration: vi.fn(),
  cover: vi.fn(),
  createCover: vi.fn(),
  coverDownloadUrl: vi.fn(() => '/owner-cover'),
  deliveryCover: vi.fn(),
  deliveryCoverDownloadUrl: vi.fn(() => '/delivery-cover'),
}));
vi.mock('./api', () => ({ api: apiMock }));

import { DeliveryCoverCard, OwnerCoverCard } from './cover-card';

const renderCard = (node: React.ReactNode) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
};

describe('capa da música', () => {
  beforeEach(() => {
    apiMock.configuration.mockResolvedValue({ commercial: { policyVersion: 'draft-v1' } });
    apiMock.cover.mockReset();
    apiMock.createCover.mockReset();
    apiMock.deliveryCover.mockReset();
  });

  it('exige consentimento para a foto e envia a referência escolhida', async () => {
    const user = userEvent.setup();
    const pending = {
      status: 'pending',
      attempt: 1,
      canRegenerate: false,
      hasReference: true,
      createdAt: '2026-09-04T12:00:00.000Z',
    };
    apiMock.cover
      .mockResolvedValueOnce({ available: true, cover: null })
      .mockResolvedValue({ available: true, cover: pending });
    apiMock.createCover.mockResolvedValue(pending);
    renderCard(<OwnerCoverCard publicId="public-order-1" />);

    const input = await screen.findByLabelText(/foto de referência/i);
    const file = new File(['jpeg'], 'turma.jpg', { type: 'image/jpeg' });
    await user.upload(input, file);
    const generate = screen.getByRole('button', { name: /gerar minha capa/i });
    expect(generate).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /tenho permissão/i }));
    await user.click(generate);

    await waitFor(() =>
      expect(apiMock.createCover).toHaveBeenCalledWith('public-order-1', file, true, 'draft-v1'),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/criando sua capa/i);
  });

  it('mostra download e a única regeneração restante ao dono', async () => {
    apiMock.cover.mockResolvedValue({
      available: true,
      cover: {
        status: 'completed',
        attempt: 1,
        canRegenerate: true,
        hasReference: false,
        createdAt: '2026-09-04T12:00:00.000Z',
        downloadUrl: '/api/v1/orders/public-order-1/cover/download',
      },
    });
    renderCard(<OwnerCoverCard publicId="public-order-1" />);

    expect(await screen.findByRole('img', { name: /capa gerada por ia/i })).toHaveAttribute(
      'src',
      '/owner-cover',
    );
    expect(screen.getByRole('link', { name: /baixar capa/i })).toHaveAttribute(
      'href',
      '/owner-cover',
    );
    expect(screen.getByText(/1 nova criação disponível/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gerar uma nova capa/i })).toBeInTheDocument();
  });

  it('entrega a capa em modo somente leitura sem controles de mutação', async () => {
    apiMock.deliveryCover.mockResolvedValue({
      available: true,
      cover: {
        status: 'completed',
        attempt: 2,
        canRegenerate: false,
        hasReference: true,
        createdAt: '2026-09-04T12:00:00.000Z',
        downloadUrl: '/api/v1/deliveries/token/cover/download',
      },
    });
    renderCard(<DeliveryCoverCard token="delivery-token" />);

    expect(await screen.findByRole('img', { name: /capa gerada por ia/i })).toHaveAttribute(
      'src',
      '/delivery-cover',
    );
    expect(screen.queryByLabelText(/foto de referência/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
