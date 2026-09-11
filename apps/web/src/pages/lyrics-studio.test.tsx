import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Checkout, LyricsReview, OrderStatus } from './public';
const apiMock = vi.hoisted(() => ({
  getOrder: vi.fn(),
  configuration: vi.fn(),
  editLyrics: vi.fn(),
  approveLyrics: vi.fn(),
  generateLyrics: vi.fn(),
}));
vi.mock('../api', () => ({ api: apiMock }));
const lyrics = {
  number: 1,
  kind: 'generated',
  content: {
    title: 'Nossa viagem',
    summary: 'Uma aventura entre amigos',
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
const base = {
  order: { publicId: 'studio-lyric', status: 'lyrics_ready', priceCents: 5900 },
  story: { subjectName: 'Nossa viagem' },
  lyrics: [lyrics],
  audio: [],
  privateAccess: false,
};
function page(route = '/criar/letra?pedido=studio-lyric') {
  window.history.replaceState({}, '', route);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/criar/letra" element={<LyricsReview />} />
          <Route path="/criar/checkout" element={<Checkout />} />
          <Route path="/pedido/:publicOrderId" element={<OrderStatus />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
describe('revisão da letra e acompanhamento', () => {
  beforeEach(() => {
    apiMock.getOrder.mockResolvedValue(base);
    apiMock.configuration.mockResolvedValue({
      generation: { lyricsAvailable: true },
      commercial: { ready: false },
      payment: { label: 'Pagamento seguro' },
    });
    apiMock.editLyrics.mockReset();
    apiMock.approveLyrics.mockReset();
    apiMock.generateLyrics.mockReset();
  });
  it('convida a editar e permite descartar alterações sem enviar outra versão', async () => {
    page();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar letra' }));
    const editor = screen.getByRole('textbox', { name: 'Letra da música' });
    await userEvent.clear(editor);
    await userEvent.type(editor, 'Uma letra diferente');
    expect(screen.getByText('Alterações ainda não salvas')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Descartar alterações' }));
    expect(screen.queryByRole('textbox', { name: 'Letra da música' })).not.toBeInTheDocument();
    expect(screen.getByText('A estrada nos levou', { exact: false })).toBeVisible();
    expect(apiMock.editLyrics).not.toHaveBeenCalled();
  });
  it('bloqueia aprovação/refino com edição pendente, conserva falha e descarta título e versos', async () => {
    apiMock.editLyrics.mockRejectedValue(new Error('Não foi possível salvar'));
    page();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar letra' }));
    const title = screen.getByRole('textbox', { name: 'Título da música' });
    const editor = screen.getByRole('textbox', { name: 'Letra da música' });
    await userEvent.clear(title);
    await userEvent.type(title, 'Outro título');
    await userEvent.clear(editor);
    await userEvent.type(editor, 'Primeira estrofe\n\nOutra estrofe');
    await userEvent.click(screen.getByText('Quer outra direção para a letra?'));
    expect(screen.getByRole('button', { name: 'Aprovar letra' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Criar nova versão' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await screen.findByRole('alert');
    expect(editor).toHaveValue('Primeira estrofe\n\nOutra estrofe');
    expect(title).toHaveValue('Outro título');
    expect(screen.getByText('Alterações ainda não salvas')).toBeVisible();
    expect(apiMock.generateLyrics).not.toHaveBeenCalled();
    expect(apiMock.approveLyrics).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Descartar alterações' }));
    await userEvent.click(screen.getByRole('button', { name: 'Editar letra' }));
    expect(screen.getByRole('textbox', { name: 'Título da música' })).toHaveValue(
      lyrics.content.title,
    );
    expect(screen.getByRole('textbox', { name: 'Letra da música' })).toHaveValue(
      lyrics.content.fullLyrics,
    );
  });
  it('preserva o rascunho em refetch e consulta do histórico somente leitura', async () => {
    const current = {
      ...lyrics,
      number: 2,
      kind: 'edited',
      content: { ...lyrics.content, title: 'Atual' },
    };
    apiMock.getOrder.mockResolvedValue({ ...base, lyrics: [lyrics, current] });
    const view = page();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar letra' }));
    await userEvent.clear(screen.getByRole('textbox', { name: 'Letra da música' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Letra da música' }),
      'Rascunho que fica',
    );
    apiMock.getOrder.mockResolvedValue({
      ...base,
      order: { ...base.order, status: 'lyrics_generating' },
      lyrics: [lyrics, current],
    });
    await act(() => view.client.invalidateQueries({ queryKey: ['order', 'studio-lyric'] }));
    expect(screen.getByRole('textbox', { name: 'Letra da música' })).toHaveValue(
      'Rascunho que fica',
    );
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Letra da música' })).toBeDisabled(),
    );
    apiMock.getOrder.mockResolvedValue({ ...base, lyrics: [lyrics, current] });
    await act(() => view.client.invalidateQueries({ queryKey: ['order', 'studio-lyric'] }));

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Letra da música' })).toBeEnabled(),
    );
    await userEvent.click(screen.getByText('Versões anteriores da letra'));
    await userEvent.click(screen.getByRole('button', { name: 'Versão 1' }));
    expect(screen.queryByRole('textbox', { name: 'Letra da música' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar letra' })).not.toBeInTheDocument();
    expect(screen.getByText('A estrada nos levou', { exact: false })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar à versão atual' }));
    expect(screen.getByRole('textbox', { name: 'Letra da música' })).toHaveValue(
      'Rascunho que fica',
    );
    expect(apiMock.editLyrics).not.toHaveBeenCalled();
  });
  it('refina somente por ação explícita usando a versão salva mais recente e preserva histórico', async () => {
    let detail = { ...base, remainingGenerations: 3 };
    apiMock.getOrder.mockImplementation(async () => detail);
    apiMock.editLyrics.mockImplementation(async (_id, _number, content) => {
      detail = {
        ...detail,
        lyrics: [...detail.lyrics, { ...lyrics, number: 2, kind: 'edited', content }],
      };
      return { number: 2, kind: 'edited' };
    });
    apiMock.generateLyrics.mockImplementation(async () => {
      detail = {
        ...detail,
        remainingGenerations: 2,
        lyrics: [
          ...detail.lyrics,
          {
            ...lyrics,
            number: 3,
            content: { ...lyrics.content, title: 'Nova direção', fullLyrics: 'Novo refrão' },
          },
        ],
      };
      return { number: 3, kind: 'generated' };
    });
    page();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar letra' }));
    expect(apiMock.generateLyrics).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByRole('textbox', { name: 'Letra da música' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Letra da música' }),
      'Versos salvos por mim',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await screen.findByText('Nova versão salva.');
    await userEvent.click(screen.getByText('Quer outra direção para a letra?'));
    const instructions = screen.getByRole('textbox', { name: 'O que você quer mudar?' });
    expect(instructions).toHaveAttribute('maxlength', '1000');
    await userEvent.type(instructions, 'ab');
    expect(screen.getByRole('button', { name: 'Criar nova versão' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Refrão marcante' }));
    expect(apiMock.generateLyrics).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Criar nova versão' }));
    await screen.findByRole('heading', { name: 'Nova direção' });
    expect(apiMock.generateLyrics).toHaveBeenCalledExactlyOnceWith('studio-lyric', {
      instructions: 'Crie um refrão mais marcante e fácil de cantar, preservando a história.',
      baseVersion: 2,
    });
    await userEvent.click(screen.getByText('Versões anteriores da letra'));
    await userEvent.click(screen.getByRole('button', { name: 'Versão 2' }));
    expect(screen.getByText('Versos salvos por mim')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Versão 1' })).toBeVisible();
  });
  it('checkout não exibe políticas vazias como se fossem condições de compra', async () => {
    apiMock.getOrder.mockResolvedValue({
      ...base,
      order: { ...base.order, status: 'lyrics_approved' },
      lyrics: [{ ...lyrics, approvedAt: '2026-09-07T10:00:00Z' }],
      payment: { checkoutAllowed: false, configured: false, devFallback: false },
    });
    page('/criar/checkout?pedido=studio-lyric');
    await screen.findByRole('heading', { name: 'Resumo do pedido' });
    expect(screen.queryByText('Em definição')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Condições da sua música' }),
    ).not.toBeInTheDocument();
  });
  it('mostra apenas a política configurada sem liberar checkout incompleto', async () => {
    apiMock.configuration.mockResolvedValue({
      generation: { lyricsAvailable: true },
      commercial: {
        ready: false,
        deliveryEstimate: 'Entrega em até dois dias úteis',
        revisionPolicy: null,
        refundPolicy: null,
        usageLicense: null,
        termsUrl: null,
        privacyUrl: null,
      },
      payment: { label: 'Pagamento seguro' },
      supportEmail: null,
    });
    apiMock.getOrder.mockResolvedValue({
      ...base,
      order: { ...base.order, status: 'lyrics_approved' },
      lyrics: [{ ...lyrics, approvedAt: '2026-09-07T10:00:00Z' }],
      payment: { checkoutAllowed: false, configured: false, devFallback: false },
    });
    page('/criar/checkout?pedido=studio-lyric');
    expect(await screen.findByText('Entrega em até dois dias úteis')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Condições da sua música' })).toBeVisible();
    expect(screen.queryByText('Em definição')).not.toBeInTheDocument();
    expect(screen.queryByText('Ajustes')).not.toBeInTheDocument();
    expect(screen.queryByText('Reembolso')).not.toBeInTheDocument();
    expect(screen.queryByText('Uso da música')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pagar/i })).toBeDisabled();
  });
  it('produção mostra contagem real e checagem, mantendo a letra recolhida', async () => {
    apiMock.getOrder.mockResolvedValue({
      ...base,
      order: { ...base.order, status: 'audio_generating' },
      lyrics: [{ ...lyrics, approvedAt: '2026-09-07T10:00:00Z' }],
      audio: [
        { variant: 1, status: 'completed' },
        { variant: 2, status: 'processing' },
      ],
    });
    const view = page('/pedido/studio-lyric');
    expect(await screen.findByText('1 de 2 versões prontas')).toBeVisible();
    expect(screen.getByText(/última verificação/i)).toBeVisible();
    await waitFor(() => expect(view.container.querySelector('details[open]')).toBeNull());
  });
});
