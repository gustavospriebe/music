import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateStory } from './pages/create-story';
import { JourneySteps } from './components';
const apiMock = vi.hoisted(() => ({ configuration: vi.fn(), sendBeacon: vi.fn() }));
vi.mock('./api', () => ({ api: apiMock, visitorId: () => '22222222-2222-4222-8222-222222222222' }));
function studio(path = '/criar') {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <CreateStory />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const next = () => userEvent.click(screen.getByRole('button', { name: /^continuar$/i }));
describe('regressões da UAT do estúdio', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.configuration.mockResolvedValue({ generation: { lyricsAvailable: false } });
  });
  it('deep link só escolhe intenção e não sobrescreve ocasião do rascunho', async () => {
    localStorage.setItem(
      'resenha:v1:story-draft',
      JSON.stringify({ occasion: 'Encontro em Recife' }),
    );
    studio('/criar?ideia=amor');
    expect(screen.getByLabelText(/ocasião/i)).toHaveValue('Encontro em Recife');
    await userEvent.click(screen.getByRole('radio', { name: /uma homenagem/i }));
    expect(screen.getByLabelText(/ocasião/i)).toHaveValue('Encontro em Recife');
  });
  it('uma ideia sem ocasião avança e estilo e clima têm escolha única acessível', async () => {
    studio();
    await userEvent.type(screen.getByLabelText(/quem ou o que inspira/i), 'Uma viagem');
    await next();
    await userEvent.type(
      screen.getByLabelText(/conte sua história/i),
      'Quero celebrar as amizades que fiz na estrada.',
    );
    await next();
    const styles = screen.getByRole('group', { name: 'Estilo musical' });
    expect(within(styles).getByRole('radio', { name: 'Pop' })).toBeChecked();
    expect(screen.queryByRole('textbox', { name: 'Seu estilo' })).not.toBeInTheDocument();
    await userEvent.click(within(styles).getByRole('radio', { name: 'Outro' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Seu estilo' }),
      'Indie folk brasileiro',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await next();
    expect(screen.getByRole('textbox', { name: 'Seu estilo' })).toHaveValue(
      'Indie folk brasileiro',
    );
  });
  it('informa a indisponibilidade antes do primeiro preenchimento', async () => {
    studio();
    expect(await screen.findByText(/criação da letra temporariamente indisponível/i)).toBeVisible();
    expect(screen.getByLabelText(/quem ou o que inspira/i)).toHaveValue('');
  });
  it('jornada externa usa nomes sem contador que conflita com a preparação', () => {
    render(<JourneySteps step={2} />);
    expect(screen.queryByText(/etapa 2 de 5/i)).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Jornada da música' })).toBeVisible();
    expect(screen.getByText('Letra', { exact: true })).toHaveAttribute('aria-current', 'step');
  });
  it('preserva Outro nos dois grupos ao trocar presets e recarregar rascunho', async () => {
    const view = studio();
    await userEvent.type(screen.getByLabelText(/quem ou o que inspira/i), 'Uma viagem');
    await next();
    await userEvent.type(
      screen.getByLabelText(/conte sua história/i),
      'Uma viagem que virou amizade para a vida.',
    );
    await next();
    for (const [group, label, preset, custom] of [
      ['Estilo musical', 'Seu estilo', 'Pop', 'Indie folk brasileiro'],
      ['Clima da música', 'Seu clima', 'Animado', 'Esperançoso e contemplativo'],
    ] as const) {
      const fieldset = screen.getByRole('group', { name: group });
      expect(within(fieldset).getByRole('radio', { name: preset })).toBeChecked();
      await userEvent.click(within(fieldset).getByRole('radio', { name: 'Outro' }));
      await userEvent.type(screen.getByRole('textbox', { name: label }), custom);
      await userEvent.click(within(fieldset).getByRole('radio', { name: preset }));
      expect(screen.queryByRole('textbox', { name: label })).not.toBeInTheDocument();
      await userEvent.click(within(fieldset).getByRole('radio', { name: 'Outro' }));
      expect(screen.getByRole('textbox', { name: label })).toHaveValue(custom);
      expect(
        within(fieldset)
          .getAllByRole('radio')
          .filter((radio) => (radio as HTMLInputElement).checked),
      ).toHaveLength(1);
    }
    await waitFor(() =>
      expect(localStorage.getItem('resenha:v1:story-draft')).toContain(
        'Esperançoso e contemplativo',
      ),
    );
    view.unmount();
    studio();
    await next();
    await next();
    expect(screen.getByRole('textbox', { name: 'Seu estilo' })).toHaveValue(
      'Indie folk brasileiro',
    );
    expect(screen.getByRole('textbox', { name: 'Seu clima' })).toHaveValue(
      'Esperançoso e contemplativo',
    );
    for (const group of ['Estilo musical', 'Clima da música'])
      expect(
        within(screen.getByRole('group', { name: group })).getByRole('radio', {
          name: 'Outro',
        }),
      ).toBeChecked();
  });
});
