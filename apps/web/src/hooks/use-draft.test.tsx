import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { clearDraft, readDraft, useDraft } from './use-draft';

const Probe = ({ value }: { value: string }) => {
  const status = useDraft({ subjectName: value });
  return <span role="status">{status}</span>;
};

describe('rascunho local', () => {
  it('restaura JSON válido e ignora conteúdo indisponível ou corrompido', () => {
    localStorage.setItem('resenha:story-draft', JSON.stringify({ subjectName: 'Bia' }));
    expect(readDraft()).toEqual({ subjectName: 'Bia' });
    localStorage.setItem('resenha:story-draft', '{quebrado');
    expect(readDraft()).toEqual({});
  });

  it('anuncia salvamento sem bloquear e tolera falha ao limpar', async () => {
    render(<Probe value="Bia" />);
    expect(screen.getByRole('status')).toHaveTextContent('saving');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('saved'));
    expect(readDraft()).toEqual({ subjectName: 'Bia' });

    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    expect(() => clearDraft()).not.toThrow();
    remove.mockRestore();
  });
});
