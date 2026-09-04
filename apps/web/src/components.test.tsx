import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Header, ProductPill, RouteFocus } from './components';

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
});
