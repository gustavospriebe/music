import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const apiMock = vi.hoisted(() => ({
  configuration: vi.fn(),
  createOrder: vi.fn(),
  saveStory: vi.fn(),
  sendBeacon: vi.fn(),
}));
vi.mock('./api', () => ({ api: apiMock, visitorId: () => '22222222-2222-4222-8222-222222222222' }));
import { CreateStory } from './pages/public';
const renderForm = (path = '/criar') =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <CreateStory />
      </MemoryRouter>
    </QueryClientProvider>,
  );
const next = () => userEvent.click(screen.getByRole('button', { name: /^continuar$/i }));
const fillIdea = async () => {
  await userEvent.type(screen.getByRole('textbox', { name: /quem ou o que inspira/i }), 'Bia');
  await userEvent.type(screen.getByRole('textbox', { name: /qual é a ocasião/i }), 'Aniversário');
  await next();
};
const fillStory = async () => {
  await userEvent.type(
    screen.getByRole('textbox', { name: /conte sua história/i }),
    'Nossa viagem terminou em um show na praia.',
  );
  await next();
  await next();
};
describe('estúdio de criação livre', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    apiMock.configuration.mockResolvedValue({
      generation: { lyricsAvailable: false },
      commercial: { ready: false, policyVersion: 'draft-v1', termsUrl: null, privacyUrl: null },
    });
    apiMock.createOrder.mockReset();
    apiMock.saveStory.mockReset();
    apiMock.sendBeacon.mockReset();
  });
  it('restaura rascunho e bloqueia somente a etapa atual com erro acessível', async () => {
    localStorage.setItem(
      'resenha:v1:story-draft',
      JSON.stringify({ subjectName: 'Bia', factsText: 'Uma lembrança da praia' }),
    );
    renderForm();
    expect(screen.getByRole('textbox', { name: /quem ou o que inspira/i })).toHaveValue('Bia');
    const subject = screen.getByRole('textbox', { name: /quem ou o que inspira/i });
    await userEvent.clear(subject);
    await next();
    await waitFor(() => expect(subject).toHaveFocus());
    expect(subject).toHaveAttribute('aria-invalid', 'true');
    expect(subject).toHaveAccessibleDescription('Conte quem ou o que inspira a música');
    expect(apiMock.createOrder).not.toHaveBeenCalled();
  });
  it('mantém o texto ao voltar e mostra revisão editável sem exigir resenha', async () => {
    renderForm();
    await fillIdea();
    await fillStory();
    expect(screen.getByText('Nossa viagem terminou em um show na praia.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /editar história/i }));
    expect(screen.getByRole('textbox', { name: /conte sua história/i })).toHaveValue(
      'Nossa viagem terminou em um show na praia.',
    );
    expect(screen.queryByText(/humor da zoeira/i)).not.toBeInTheDocument();
  });
  it('limpa formulário e armazenamento mesmo com autosave pendente e após nova digitação', async () => {
    renderForm();
    await userEvent.type(
      screen.getByRole('textbox', { name: /quem ou o que inspira/i }),
      'Informação privada',
    );
    await userEvent.click(screen.getByText('Sobre seu rascunho'));
    await userEvent.click(screen.getByRole('button', { name: /apagar rascunho/i }));
    expect(screen.getByRole('textbox', { name: /quem ou o que inspira/i })).toHaveValue('');
    await waitFor(() => expect(localStorage.getItem('resenha:v1:story-draft')).toBeNull());
    await userEvent.type(
      screen.getByRole('textbox', { name: /quem ou o que inspira/i }),
      'Nova ideia',
    );
    await waitFor(() =>
      expect(localStorage.getItem('resenha:v1:story-draft')).toContain('Nova ideia'),
    );
    expect(localStorage.getItem('resenha:v1:story-draft')).not.toContain('Informação privada');
  });
  it('expõe autocomplete e erros finais, exige consentimentos e envia custom_song idempotente', async () => {
    apiMock.createOrder.mockResolvedValue({ publicId: 'order-retry-123' });
    apiMock.saveStory
      .mockRejectedValueOnce(new Error('rede indisponível'))
      .mockResolvedValue({ saved: true });
    renderForm();
    expect(screen.getByRole('list', { name: 'Jornada da música' })).toBeVisible();
    expect(screen.getByText('História', { exact: true })).toHaveAttribute('aria-current', 'step');
    await fillIdea();
    await fillStory();
    const submit = screen.getByRole('button', { name: /salvar história e continuar/i });
    await userEvent.click(submit);
    const name = screen.getByRole('textbox', { name: /^seu nome$/i });
    const email = screen.getByRole('textbox', { name: /^seu e-mail$/i });
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveAccessibleDescription('Informe seu nome');
    expect(name).toHaveAttribute('autocomplete', 'name');
    expect(email).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByRole('checkbox', { name: /aceito os termos/i })).toHaveAccessibleDescription(
      'Aceite os termos para continuar',
    );
    await userEvent.type(name, 'Nina');
    await userEvent.type(email, 'nina@example.test');
    await userEvent.click(screen.getByRole('checkbox', { name: /aceito os termos/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /posso usar os detalhes/i }));
    await userEvent.click(submit);
    await waitFor(() => expect(apiMock.saveStory).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(submit).toBeEnabled());
    await userEvent.click(submit);
    await waitFor(() => expect(apiMock.saveStory).toHaveBeenCalledTimes(2));
    expect(apiMock.createOrder.mock.calls[0]?.[0]).toBe('custom_song');
    expect(apiMock.createOrder.mock.calls[0]?.[1]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(apiMock.createOrder.mock.calls[1]?.[1]).toBe(apiMock.createOrder.mock.calls[0]?.[1]);
    expect(apiMock.saveStory.mock.calls[0]?.[1]).toMatchObject({
      productType: 'custom_song',
      intention: 'livre',
      brief: 'Nossa viagem terminou em um show na praia.',
      facts: [],
      safetyConfirmed: true,
    });
    expect(apiMock.saveStory.mock.calls[0]?.[1]).not.toHaveProperty('roastLevel');
    expect(localStorage.getItem('resenha:story-creation-key')).toBeNull();
  });
  it('salva a intenção escolhida sem inventar ocasião no pedido', async () => {
    apiMock.createOrder.mockResolvedValue({ publicId: 'order-free-intention' });
    apiMock.saveStory.mockResolvedValue({ saved: true });
    renderForm('/criar?ideia=amor');
    await userEvent.type(
      screen.getByRole('textbox', { name: /quem ou o que inspira/i }),
      'Uma história nossa',
    );
    await next();
    await fillStory();
    await userEvent.type(screen.getByRole('textbox', { name: 'Seu nome' }), 'Nina');
    await userEvent.type(screen.getByRole('textbox', { name: 'Seu e-mail' }), 'nina@example.test');
    await userEvent.click(screen.getByRole('checkbox', { name: /aceito os termos/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /posso usar os detalhes/i }));
    await userEvent.click(screen.getByRole('button', { name: /salvar história e continuar/i }));
    await waitFor(() => expect(apiMock.saveStory).toHaveBeenCalledTimes(1));
    expect(apiMock.saveStory.mock.calls[0]?.[1]).toMatchObject({
      productType: 'custom_song',
      intention: 'amor',
      subjectName: 'Uma história nossa',
    });
    expect(apiMock.saveStory.mock.calls[0]?.[1]).not.toHaveProperty('occasion');
  });
});
