import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Header, ProductPill } from './components';

describe('navegação pública', () => {
  it('oferece o CTA canônico e um menu acessível no teclado', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /música da resenha/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: /abrir menu/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /criar minha música/i })).toHaveAttribute(
      'href',
      '/criar',
    );
  });

  it('identifica corretamente o produto selecionado', () => {
    render(<ProductPill type="emotional_tribute" />);
    expect(screen.getByText('Sua História em Música')).toBeInTheDocument();
  });
});
