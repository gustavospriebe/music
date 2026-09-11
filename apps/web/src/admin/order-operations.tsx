import { useState, type ReactNode } from 'react';
import { jobNamePt, jobStatusPt } from './labels';

function operationDate(value: string | null | undefined): string {
  if (!value) return 'Não informada';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Não informada' : date.toLocaleString('pt-BR');
}

export type OperationJob = {
  id: string;
  type: string;
  status: string;
  attempts?: number;
  maxAttempts?: number;
  updatedAt?: string | null;
  nextRunAt?: string | null;
  diagnosis?: { title: string; message: string; action: string; safeDetail?: string | null } | null;
};

export function JobDiagnosticCard({ job, children }: { job: OperationJob; children?: ReactNode }) {
  return (
    <article className="price-card" aria-label={jobNamePt(job.type)}>
      <h3>{jobNamePt(job.type)}</h3>
      <p>{jobStatusPt(job.status)}</p>
      <dl className="summary-list">
        <div>
          <dt>Tentativas</dt>
          <dd>
            {job.attempts ?? 'Não informadas'} / {job.maxAttempts ?? 'limite não informado'}
          </dd>
        </div>
        <div>
          <dt>Última atualização</dt>
          <dd>{operationDate(job.updatedAt)}</dd>
        </div>
        {job.status === 'pending' && job.nextRunAt && (
          <div>
            <dt>Próxima execução prevista</dt>
            <dd>{operationDate(job.nextRunAt)}</dd>
          </div>
        )}
      </dl>
      {job.diagnosis && (
        <div className="notice">
          <h4>{job.diagnosis.title}</h4>
          <p>{job.diagnosis.message}</p>
          <p>
            <strong>Próximo passo:</strong> {job.diagnosis.action}
          </p>
          {job.diagnosis.safeDetail && (
            <details>
              <summary>Detalhe do diagnóstico</summary>
              <p>{job.diagnosis.safeDetail}</p>
            </details>
          )}
        </div>
      )}
      {children}
    </article>
  );
}

export function ConfirmOperation({
  label,
  impact,
  pending,
  disabledReason,
  onConfirm,
  costNote = 'Novas gerações consomem créditos de IA.',
}: {
  costNote?: string;
  label: string;
  impact: string;
  pending: boolean;
  disabledReason: string | null;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div>
      <p>{impact}</p>
      <p className="sub">{costNote}</p>
      {disabledReason && <p className="notice">{disabledReason}</p>}
      {confirming ? (
        <div role="group" aria-label={`Confirmar: ${label}`}>
          <p>Confirme a operação descrita acima para continuar.</p>
          <div className="actions">
            <button
              type="button"
              className="button primary"
              disabled={pending || Boolean(disabledReason)}
              onClick={() => {
                onConfirm();
                setConfirming(false);
              }}
            >
              Confirmar: {label}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="button secondary"
          disabled={pending || Boolean(disabledReason)}
          onClick={() => setConfirming(true)}
        >
          {pending ? 'Enfileirando…' : label}
        </button>
      )}
    </div>
  );
}

export function AudioRecoveryActions({
  resume,
  rebuild,
}: {
  resume: { pending: boolean; blockedReason: string | null; onConfirm: () => void };
  rebuild: { pending: boolean; blockedReason: string | null; onConfirm: () => void };
}) {
  return (
    <section aria-labelledby="audio-recovery-title">
      <h3 id="audio-recovery-title">Recuperar a produção do áudio</h3>
      <ConfirmOperation
        label="Retomar versões pendentes"
        impact="Mantém as versões prontas e cria somente as versões que ainda faltam."
        pending={resume.pending}
        disabledReason={resume.blockedReason}
        onConfirm={resume.onConfirm}
      />
      <ConfirmOperation
        label="Gerar as 2 versões do zero"
        impact="Substitui os áudios existentes e cria as duas versões novamente com a última letra aprovada."
        pending={rebuild.pending}
        disabledReason={rebuild.blockedReason}
        onConfirm={rebuild.onConfirm}
      />
    </section>
  );
}
