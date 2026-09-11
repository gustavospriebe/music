import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Header, JourneySteps, ProductPill, RouteFocus } from './components';

describe('navegação pública', () => {
  it('oferece o CTA canônico e fecha o menu com Escape devolvendo foco', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /música da resenha/i })).toHaveAttribute('href', '/');
    const menu = screen.getByRole('button', { name: /abrir menu/i });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    await user.click(menu);
    expect(screen.getByRole('button', { name: /fechar menu/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /abrir menu/i })).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
    await user.click(menu);
    await user.click(screen.getByRole('link', { name: /^Criar$/i }));
    expect(screen.getByRole('button', { name: /abrir menu/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('link', { name: /criar minha música/i })).toHaveAttribute(
      'href',
      '/criar',
    );
  });

  it('contém o foco no menu aberto e restaura fundo e foco', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Header />
        <main>
          <a href="/fundo">link de fundo</a>
        </main>
      </MemoryRouter>,
    );
    const backgroundLink = screen.getByRole('link', { name: /link de fundo/i });
    const menu = screen.getByRole('button', { name: /abrir menu/i });
    await user.click(menu);
    const dialog = screen.getByRole('dialog', { name: /menu/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const background = document.querySelector('main') as HTMLElement;
    expect(background).toHaveAttribute('inert');
    expect(background).toHaveAttribute('aria-hidden', 'true');
    const links = screen.getAllByRole('link');
    const last = links[links.length - 1] as HTMLElement;
    last.focus();
    await user.keyboard('{Tab}');
    expect(screen.getByRole('link', { name: /música da resenha/i })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /abrir menu/i })).toHaveFocus();
    expect(document.querySelector('main')).not.toHaveAttribute('inert');
    expect(backgroundLink).not.toHaveAttribute('aria-hidden');
  });

  it('rola ao topo e foca o conteúdo principal após trocar de rota', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    render(
      <MemoryRouter initialEntries={['/']}>
        <RouteFocus />
        <Routes>
          <Route
            path="/"
            element={
              <main>
                <h1>Início</h1>
                <Link to="/criar">Continuar</Link>
              </main>
            }
          />
          <Route
            path="/criar"
            element={
              <main>
                <h1>Criação</h1>
              </main>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('link', { name: 'Continuar' }));
    const main = screen.getByRole('main');
    await waitFor(() => expect(main).toHaveFocus());
    expect(main).toHaveAttribute('tabindex', '-1');
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 0, behavior: 'instant' });
    scrollTo.mockRestore();
  });

  it('identifica corretamente o produto selecionado', () => {
    render(<ProductPill type="emotional_tribute" />);
    expect(screen.getByText('Sua História em Música')).toBeInTheDocument();
  });

  it.each([
    [1, 'História'],
    [2, 'Letra'],
    [3, 'Pagamento'],
    [4, 'Produção'],
    [5, 'Entrega'],
  ] as const)('anuncia a posição %i pelo nome %s sem contador paralelo', (step, name) => {
    render(<JourneySteps step={step} />);
    expect(screen.getByRole('list', { name: 'Jornada da música' })).toBeVisible();
    expect(screen.getByText(name, { exact: true })).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByText(/etapa.*de 5/i)).not.toBeInTheDocument();
  });
  it('mantém cinco estados concluídos e a posição da entrega no trilho único', () => {
    render(<JourneySteps step={5} complete />);
    expect(screen.getAllByRole('list')).toHaveLength(1);
    expect(screen.getAllByRole('listitem', { name: /Concluído/ })).toHaveLength(5);
    expect(screen.getByText('Entrega', { exact: true })).toHaveAttribute('aria-current', 'step');
  });
});
