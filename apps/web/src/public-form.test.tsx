import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
  createOrder: vi.fn(),
  saveStory: vi.fn(),
  sendBeacon: vi.fn(),
}));
vi.mock('./api', () => ({
  api: apiMock,
  visitorId: () => '22222222-2222-4222-8222-222222222222',
}));

import { CreateStory } from './pages/public';

const renderForm = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CreateStory />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('formulário público', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.createOrder.mockReset();
    apiMock.saveStory.mockReset();
    apiMock.sendBeacon.mockReset();
  });

  it('restaura o rascunho e associa o primeiro erro ao controle focado', async () => {
    localStorage.setItem(
      'resenha:v1:story-draft',
      JSON.stringify({ subjectName: 'Bia', factsText: 'Só uma lembrança' }),
    );
    renderForm();
    const subject = screen.getByRole('textbox', { name: /para quem é a música/i });
    expect(subject).toHaveValue('Bia');
    await userEvent.click(screen.getByRole('button', { name: /gerar minha letra/i }));
    const occasion = screen.getByRole('textbox', { name: /qual é a ocasião/i });
    await waitFor(() => expect(occasion).toHaveFocus());
    expect(occasion).toHaveAttribute('aria-invalid', 'true');
    expect(occasion).toHaveAccessibleDescription('Conte a ocasião');
    expect(screen.getByText(/pelo menos 2 lembranças/i)).toBeInTheDocument();
  });

  it('associa uma mensagem específica a cada campo obrigatório', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /gerar minha letra/i }));

    const required = [
      [
        screen.getByRole('textbox', { name: /para quem é a música/i }),
        'Informe o nome da homenagem',
      ],
      [screen.getByRole('textbox', { name: /qual é a ocasião/i }), 'Conte a ocasião'],
      [screen.getByRole('textbox', { name: /^seu nome$/i }), 'Informe seu nome'],
      [screen.getByRole('textbox', { name: /^seu e-mail$/i }), 'Informe um e-mail válido'],
      [
        screen.getByRole('textbox', { name: /histórias, apelidos/i }),
        'Escreva pelo menos 2 lembranças, uma em cada linha',
      ],
      [
        screen.getByRole('checkbox', { name: /aceito os termos/i }),
        'Aceite os termos para continuar',
      ],
    ] as const;

    await waitFor(() => expect(required[0][0]).toHaveFocus());
    for (const [control, message] of required) {
      expect(control).toHaveAttribute('aria-invalid', 'true');
      expect(control).toHaveAccessibleDescription(message);
    }
  });

  it('repete create e story com uma única chave até o salvamento concluir', async () => {
    apiMock.createOrder.mockResolvedValue({ publicId: 'order-retry-123' });
    apiMock.saveStory.mockRejectedValueOnce(new Error('rede indisponível')).mockResolvedValue({
      saved: true,
    });
    renderForm();
    await userEvent.type(screen.getByRole('textbox', { name: /para quem é a música/i }), 'Bia');
    await userEvent.type(screen.getByRole('textbox', { name: /qual é a ocasião/i }), 'Aniversário');
    await userEvent.type(screen.getByRole('textbox', { name: /^seu nome$/i }), 'Nina');
    await userEvent.type(
      screen.getByRole('textbox', { name: /^seu e-mail$/i }),
      'nina@example.test',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: /histórias, apelidos/i }),
      'Sempre chega cantando{enter}Todo churrasco vira show',
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /aceito os termos/i }));
    const submit = screen.getByRole('button', { name: /gerar minha letra/i });
    await userEvent.click(submit);
    await waitFor(() => expect(apiMock.saveStory).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(submit).toBeEnabled());
    await userEvent.click(submit);
    await waitFor(() => expect(apiMock.saveStory).toHaveBeenCalledTimes(2));
    expect(apiMock.createOrder).toHaveBeenCalledTimes(2);
    const firstKey = apiMock.createOrder.mock.calls[0]?.[1];
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(firstKey).not.toBe('22222222-2222-4222-8222-222222222222');
    expect(apiMock.createOrder.mock.calls[1]?.[1]).toBe(firstKey);
    expect(localStorage.getItem('resenha:story-creation-key')).toBeNull();
  });
});
