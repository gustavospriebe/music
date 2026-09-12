import { jobNamePt, jobStatusPt, failureDiagnosis } from './labels';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AudioRecoveryActions, JobDiagnosticCard } from './order-operations';

describe('diagnóstico operacional do pedido', () => {
  it('traduz tipos e estados conhecidos sem expor identificadores técnicos desconhecidos', () => {
    expect(jobNamePt('generate_audio')).toBe('Criação das versões de áudio');
    expect(jobNamePt('generate_cover')).toBe('Criação da capa');
    expect(jobNamePt('deliver_notify')).toBe('Entrega e aviso por e-mail');
    expect(jobNamePt('internal-new-job')).toBe('Processamento do pedido');
    expect(jobStatusPt('pending')).toBe('Aguardando execução');
    expect(jobStatusPt('processing')).toBe('Em processamento');
    expect(jobStatusPt('completed')).toBe('Concluído');
    expect(jobStatusPt('failed')).toBe('Interrompido');
  });
  it('usa código estável da API para diagnóstico mesmo quando a descrição está sanitizada', () => {
    expect(failureDiagnosis('Mensagem segura.', null, 'content_blocked')?.title).toBe(
      'Conteúdo recusado pelo provedor',
    );
    expect(failureDiagnosis('Mensagem segura.', null, 'rate_limit')?.title).toBe(
      'Limite temporário do serviço',
    );
    expect(failureDiagnosis('Mensagem segura.', null, 'timeout')?.title).toBe(
      'Tempo de resposta excedido',
    );
    expect(failureDiagnosis('Mensagem segura.', null, 'reference_missing')?.title).toBe(
      'Foto de referência indisponível',
    );
    expect(failureDiagnosis('O provedor recusou o conteúdo. Revise antes de retomar.')?.title).toBe(
      'Conteúdo recusado pelo provedor',
    );
  });
  it('mostra tentativas e causa com próxima ação, mantendo o detalhe recolhido', async () => {
    render(
      <JobDiagnosticCard
        job={{
          id: 'internal-job',
          type: 'generate_audio',
          status: 'failed',
          attempts: 2,
          maxAttempts: 4,
          updatedAt: '2026-09-07T12:00:00Z',
          diagnosis: {
            title: 'Conteúdo recusado',
            message: 'A criação foi interrompida pelo provedor.',
            action: 'Revise a letra antes de gerar novamente.',
            safeDetail: 'PROHIBITED_CONTENT',
          },
        }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Criação das versões de áudio' })).toBeVisible();
    expect(screen.getByText('2 / 4')).toBeVisible();
    expect(
      screen.getByText('Revise a letra antes de gerar novamente.', { exact: false }),
    ).toBeVisible();
    expect(screen.getByText('PROHIBITED_CONTENT')).not.toBeVisible();
    await userEvent.click(screen.getByText('Detalhe do diagnóstico'));
    expect(screen.getByText('PROHIBITED_CONTENT')).toBeVisible();
    expect(screen.queryByText('internal-job')).not.toBeInTheDocument();
  });
  it('distingue retomar de substituir e só executa após confirmação explícita', async () => {
    const resume = vi.fn();
    const rebuild = vi.fn();
    render(
      <AudioRecoveryActions
        resume={{ pending: false, blockedReason: null, onConfirm: resume }}
        rebuild={{ pending: false, blockedReason: null, onConfirm: rebuild }}
      />,
    );
    expect(screen.getByText(/mantém as versões prontas/i)).toBeVisible();
    expect(screen.getByText(/substitui os áudios existentes/i)).toBeVisible();
    expect(resume).not.toHaveBeenCalled();
    expect(rebuild).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Retomar versões pendentes' }));
    expect(resume).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirmar: Retomar versões pendentes' }),
    );
    expect(resume).toHaveBeenCalledOnce();
    expect(rebuild).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Gerar as 2 versões do zero' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(rebuild).not.toHaveBeenCalled();
  });
  it('respeita impedimento operacional e explica o motivo sem permitir chamada', () => {
    const action = vi.fn();
    render(
      <AudioRecoveryActions
        resume={{
          pending: false,
          blockedReason: 'Corrija a letra antes de retomar.',
          onConfirm: action,
        }}
        rebuild={{ pending: true, blockedReason: null, onConfirm: action }}
      />,
    );
    expect(screen.getByText('Corrija a letra antes de retomar.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retomar versões pendentes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enfileirando…' })).toBeDisabled();
    expect(action).not.toHaveBeenCalled();
  });
});
