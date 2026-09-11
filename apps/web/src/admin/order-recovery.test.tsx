import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminOrderDetail } from '../api';
import { AdminOrderOperations, AudioVariantRecovery } from './order-recovery';
const mocks = vi.hoisted(() => ({
  retryJob: vi.fn(),
  adminGenerateLyrics: vi.fn(),
  adminRetryEmail: vi.fn(),
  adminRebuildAudio: vi.fn(),
  adminRegenerateAudio: vi.fn(),
}));
vi.mock('../api', () => ({ api: mocks }));
const base: AdminOrderDetail = {
  order: {
    id: 'order',
    publicId: 'public',
    productType: 'custom_song',
    status: 'failed',
    priceCents: 0,
    createdAt: '2026-09-07T10:00:00Z',
  },
  lyrics: [],
  audio: [],
  jobs: [],
  aiUsage: [],
  notes: [],
  payments: [],
  aiCost: {
    totalUsd: '0',
    lyricsUsd: '0',
    audioUsd: '0',
    inputTokens: 0,
    outputTokens: 0,
    calls: 0,
  },
  recovery: {
    lyrics: { canGenerate: true, canEdit: true, reason: null },
    audio: { canRebuild: true, reason: null },
    cover: { canRetry: true, requiresReference: true, jobId: 'cover-job', reason: null },
    email: { canRetry: true, reason: null },
  },
};
function show(detail = base, unsavedLyrics = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrap = (value: AdminOrderDetail) => (
    <QueryClientProvider client={client}>
      <AdminOrderOperations detail={value} unsavedLyrics={unsavedLyrics} />
    </QueryClientProvider>
  );
  const view = render(wrap(detail));
  return { ...view, update: (value: AdminOrderDetail) => view.rerender(wrap(value)) };
}
describe('ações de recuperação administrativas', () => {
  beforeEach(() =>
    Object.values(mocks).forEach((mock) => mock.mockReset().mockResolvedValue({ queued: true })),
  );
  it('só gera letra após confirmação e informa sucesso sem chamar áudio', async () => {
    show();
    expect(mocks.adminGenerateLyrics).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Gerar letra para revisão' }));
    expect(mocks.adminGenerateLyrics).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirmar: Gerar letra para revisão' }),
    );
    await screen.findByText('Letra criada e disponível para revisão.');
    expect(mocks.adminGenerateLyrics).toHaveBeenCalledExactlyOnceWith('order');
    expect(mocks.adminRebuildAudio).not.toHaveBeenCalled();
  });
  it('retoma somente o job permitido, mantém erro visível e não dispara rebuild', async () => {
    mocks.retryJob.mockRejectedValue(new Error('Aguarde o processamento atual.'));
    show({
      ...base,
      jobs: [
        {
          id: 'audio-job',
          type: 'generate_audio',
          status: 'failed',
          canRetry: true,
          lastError: 'O provedor recusou o conteúdo.',
          errorCode: 'content_blocked',
        },
      ],
    });
    expect(screen.getByText('Conteúdo recusado pelo provedor')).toBeVisible();
    expect(screen.getByText(/revise a letra e a descrição/i)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Retomar versões pendentes' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirmar: Retomar versões pendentes' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Aguarde o processamento atual.');
    expect(mocks.retryJob).toHaveBeenCalledExactlyOnceWith('audio-job', undefined);
    expect(mocks.adminRebuildAudio).not.toHaveBeenCalled();
  });
  it('exige foto e autorização para retomar capa com referência ausente', async () => {
    show();
    const button = screen.getByRole('button', { name: 'Retomar criação da capa' });
    expect(button).toBeDisabled();
    const file = new File(['photo'], 'reference.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Foto de referência'), file);
    expect(button).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: /tenho autorização/i }));
    await userEvent.click(button);
    expect(mocks.retryJob).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirmar: Retomar criação da capa' }),
    );
    await waitFor(() =>
      expect(mocks.retryJob).toHaveBeenCalledExactlyOnceWith('cover-job', { file, consent: true }),
    );
  });
  it('arquivo e consentimento não superam capability negada ou job ausente', async () => {
    const denied = {
      ...base,
      recovery: {
        ...base.recovery!,
        cover: {
          canRetry: false,
          requiresReference: true,
          jobId: 'cover-job',
          reason: 'Já existe uma capa em processamento.',
        },
      },
    };
    const view = show(denied);
    await userEvent.upload(
      screen.getByLabelText('Foto de referência'),
      new File(['x'], 'photo.png', { type: 'image/png' }),
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /tenho autorização/i }));
    expect(screen.getByRole('button', { name: 'Retomar criação da capa' })).toBeDisabled();
    view.update({
      ...base,
      recovery: {
        ...base.recovery!,
        cover: { canRetry: true, requiresReference: false, jobId: null, reason: null },
      },
    });
    expect(screen.getByRole('button', { name: 'Retomar criação da capa' })).toBeDisabled();
    expect(mocks.retryJob).not.toHaveBeenCalled();
  });
  it('nova capability durante confirmação impede executar ação obsoleta', async () => {
    const view = show();
    await userEvent.click(screen.getByRole('button', { name: 'Gerar as 2 versões do zero' }));
    view.update({
      ...base,
      recovery: {
        ...base.recovery!,
        audio: { canRebuild: false, reason: 'Produção em andamento.' },
      },
    });
    expect(
      screen.getByRole('button', { name: 'Confirmar: Gerar as 2 versões do zero' }),
    ).toBeDisabled();
    expect(mocks.adminRebuildAudio).not.toHaveBeenCalled();
  });
  it('bloqueia letra e áudio enquanto há edição não salva', () => {
    show(base, true);
    expect(screen.getByRole('button', { name: 'Gerar letra para revisão' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Gerar as 2 versões do zero' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retomar versões pendentes' })).toBeDisabled();
  });
  it('reenviar e-mail não executa chamadas de geração', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar aviso de entrega' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirmar: Reenviar aviso de entrega' }),
    );
    expect(await screen.findByText('Reenvio do aviso de entrega enfileirado.')).toBeVisible();
    expect(mocks.adminRetryEmail).toHaveBeenCalledExactlyOnceWith('order');
    expect(mocks.adminRebuildAudio).not.toHaveBeenCalled();
    expect(mocks.adminGenerateLyrics).not.toHaveBeenCalled();
    expect(mocks.retryJob).not.toHaveBeenCalled();
  });
  it('substitui uma faixa sem enfileirar o conjunto inteiro', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AudioVariantRecovery
          orderId="order"
          audio={{
            id: 'audio-2',
            assetId: 'asset',
            variant: 2,
            status: 'completed',
            canRegenerate: true,
          }}
          unsavedLyrics={false}
        />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Gerar novamente só a versão 2' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirmar: Gerar novamente só a versão 2' }),
    );
    await screen.findByText('A versão 2 foi enfileirada para nova criação.');
    expect(mocks.adminRegenerateAudio).toHaveBeenCalledExactlyOnceWith('order', 'audio-2');
    expect(mocks.adminRebuildAudio).not.toHaveBeenCalled();
  });
});
