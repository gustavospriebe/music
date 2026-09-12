import { failureDiagnosis, jobStatusPt } from './labels';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type AdminOrderDetail } from '../api';
import { AudioRecoveryActions, ConfirmOperation, JobDiagnosticCard } from './order-operations';

function OperationFeedback({
  error,
  success,
  message,
}: {
  error: Error | null;
  success: boolean;
  message: string;
}) {
  if (error)
    return (
      <p className="error" role="alert">
        {error.message}
      </p>
    );
  if (success)
    return (
      <p className="notice" role="status">
        {message}
      </p>
    );
  return null;
}

function useOrderOperations(id: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ['admin', 'order', id] });
  const retry = useMutation({
    mutationFn: ({
      jobId,
      reference,
    }: {
      jobId: string;
      reference?: { file: File; consent: boolean; policyVersion: string };
    }) => api.retryJob(jobId, reference),
    onSettled: refresh,
  });
  const lyrics = useMutation({ mutationFn: () => api.adminGenerateLyrics(id), onSettled: refresh });
  const email = useMutation({ mutationFn: () => api.adminRetryEmail(id), onSettled: refresh });
  const rebuild = useMutation({ mutationFn: () => api.adminRebuildAudio(id), onSettled: refresh });
  return { retry, lyrics, email, rebuild };
}

function CoverRecovery({
  detail,
  busy,
  pending,
  onRetry,
}: {
  detail: AdminOrderDetail;
  busy: boolean;
  pending: boolean;
  onRetry: (
    jobId: string,
    reference?: { file: File; consent: boolean; policyVersion: string },
  ) => void;
}) {
  const [reference, setReference] = useState<File | null>(null);
  const [acceptedPolicy, setAcceptedPolicy] = useState<string>();
  const configuration = useQuery({ queryKey: ['configuration'], queryFn: api.configuration });
  const policyVersion = configuration.data?.commercial.policyVersion ?? undefined;
  const consent = Boolean(acceptedPolicy && acceptedPolicy === policyVersion);
  const recovery = detail.recovery?.cover;
  const cover = [...(detail.covers ?? [])].sort((a, b) => b.attempt - a.attempt)[0];
  const requiresReference = recovery?.requiresReference === true;
  const referenceReady = reference && consent;
  const allowed =
    recovery?.canRetry === true &&
    Boolean(recovery.jobId) &&
    (!requiresReference || referenceReady);
  const reason = allowed
    ? null
    : (recovery?.reason ??
      (requiresReference
        ? 'Envie a foto e confirme a autorização para retomar.'
        : 'Não há recuperação de capa disponível nesta etapa.'));
  return (
    <article className="price-card">
      <h3>Capa</h3>
      <p>
        {cover
          ? `Tentativa ${cover.attempt} · ${jobStatusPt(cover.status)}`
          : 'Nenhuma capa registrada.'}
      </p>
      {requiresReference && (
        <div>
          <p className="notice">
            {recovery?.reason ?? 'Envie novamente a foto de referência para recuperar esta capa.'}
          </p>
          <label className="studio-field">
            Foto de referência
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(event) => {
                setReference(event.target.files?.[0] ?? null);
                setAcceptedPolicy(undefined);
              }}
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy || !policyVersion}
              onChange={(event) =>
                setAcceptedPolicy(event.target.checked ? policyVersion : undefined)
              }
            />
            Tenho autorização para usar esta foto na capa.
          </label>
        </div>
      )}
      <ConfirmOperation
        label="Retomar criação da capa"
        impact="Retoma a tentativa de capa interrompida. Não altera os áudios nem cria um novo pedido."
        pending={pending}
        disabledReason={busy && !pending ? 'Outra operação está em andamento.' : reason}
        onConfirm={() => {
          if (recovery?.jobId)
            onRetry(
              recovery.jobId,
              requiresReference && reference && acceptedPolicy
                ? { file: reference, consent, policyVersion: acceptedPolicy }
                : undefined,
            );
        }}
      />
    </article>
  );
}

function LyricsRecovery({
  detail,
  unsavedLyrics,
  busy,
  pending,
  onGenerate,
}: {
  detail: AdminOrderDetail;
  unsavedLyrics: boolean;
  busy: boolean;
  pending: boolean;
  onGenerate: () => void;
}) {
  const recovery = detail.recovery?.lyrics;
  const failure = detail.aiUsage
    .filter((usage) => usage.kind === 'lyrics')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const diagnosis = failureDiagnosis(failure?.error, undefined, failure?.errorCode);
  return (
    <article className="price-card">
      <h3>Letra</h3>
      <p>
        {detail.lyrics.length
          ? 'A versão salva está disponível no editor abaixo.'
          : 'Nenhuma versão de letra disponível.'}
      </p>
      {recovery?.remainingGenerations !== undefined && (
        <p className="sub">
          {recovery.remainingGenerations} gerações restantes no limite do pedido.
        </p>
      )}
      {diagnosis && (
        <details>
          <summary>{diagnosis.title}</summary>
          <p>{diagnosis.message}</p>
          <p>{diagnosis.action}</p>
          <p>{diagnosis.safeDetail}</p>
        </details>
      )}
      <ConfirmOperation
        label="Gerar letra para revisão"
        impact="Cria uma letra a partir da história salva, respeitando as tentativas disponíveis. O cliente ainda precisa revisar e aprovar antes do pagamento."
        pending={pending}
        disabledReason={
          busy && !pending
            ? 'Outra operação está em andamento.'
            : unsavedLyrics
              ? 'Salve ou descarte a edição da letra antes de criar outra versão.'
              : recovery?.canGenerate
                ? null
                : (recovery?.generateBlockedReason ??
                  recovery?.reason ??
                  'Geração de letra indisponível nesta etapa.')
        }
        onConfirm={onGenerate}
      />
    </article>
  );
}

function EmailRecovery({
  detail,
  busy,
  pending,
  onRetry,
}: {
  detail: AdminOrderDetail;
  busy: boolean;
  pending: boolean;
  onRetry: () => void;
}) {
  const recovery = detail.recovery?.email;
  const notifications = detail.notifications ?? [];
  return (
    <article className="price-card">
      <h3>Aviso de entrega por e-mail</h3>
      {notifications.length ? (
        notifications.map((item) => (
          <p key={item.id}>
            {item.status === 'sent' ? 'Enviado' : jobStatusPt(item.status)} ·{' '}
            {new Date(item.updatedAt).toLocaleString('pt-BR')}
          </p>
        ))
      ) : (
        <p>Nenhum envio registrado.</p>
      )}
      <ConfirmOperation
        label="Reenviar aviso de entrega"
        impact="Envia novamente o aviso ao e-mail do cliente com acesso à entrega existente. Não gera áudio nem capa."
        costNote="O serviço de e-mail pode cobrar pelo envio, conforme o provedor configurado."
        pending={pending}
        disabledReason={
          busy && !pending
            ? 'Outra operação está em andamento.'
            : recovery?.canRetry
              ? null
              : (recovery?.reason ?? 'Reenvio indisponível nesta etapa.')
        }
        onConfirm={onRetry}
      />
    </article>
  );
}

function OperationJobHistory({ detail }: { detail: AdminOrderDetail }) {
  const failedJobs = detail.jobs.filter((job) => job.status === 'failed');
  return (
    <>
      {failedJobs.length > 0 && (
        <p className="notice">
          {failedJobs.length}{' '}
          {failedJobs.length === 1
            ? 'tentativa com falha registrada'
            : 'tentativas com falha registradas'}
          . Consulte o histórico e as ações disponíveis abaixo.
        </p>
      )}
      <div className="admin-operation-grid">
        {detail.jobs.map((job) => (
          <JobDiagnosticCard
            key={job.id}
            job={{
              ...job,
              type:
                detail.order.status === 'delivered' &&
                job.type === 'generate_audio' &&
                job.status !== 'completed'
                  ? 'deliver_notify'
                  : job.type,
              nextRunAt: job.runAt,
              diagnosis: failureDiagnosis(job.lastError, job.retryBlockedReason, job.errorCode),
            }}
          />
        ))}
      </div>
    </>
  );
}
function audioRecoveryView(detail: AdminOrderDetail, unsavedLyrics: boolean) {
  const audioJob =
    detail.order.status === 'delivered'
      ? undefined
      : detail.jobs.find((job) => job.type === 'generate_audio' && job.canRetry);
  const failedAudioJob = detail.jobs.find(
    (job) => job.type === 'generate_audio' && job.status === 'failed',
  );
  const resumeReason = unsavedLyrics
    ? 'Salve ou descarte a edição da letra antes de retomar.'
    : audioJob
      ? null
      : (failedAudioJob?.retryBlockedReason ?? 'Nenhuma versão pendente disponível para retomada.');
  const rebuildReason = unsavedLyrics
    ? 'Salve ou descarte a edição da letra antes de gerar novos áudios.'
    : detail.recovery?.audio.canRebuild
      ? null
      : (detail.recovery?.audio.reason ?? 'Geração do conjunto indisponível nesta etapa.');
  return { audioJob, resumeReason, rebuildReason };
}
export function AdminOrderOperations({
  detail,
  unsavedLyrics,
}: {
  detail: AdminOrderDetail;
  unsavedLyrics: boolean;
}) {
  const operations = useOrderOperations(detail.order.id);
  const busy =
    operations.retry.isPending ||
    operations.lyrics.isPending ||
    operations.email.isPending ||
    operations.rebuild.isPending;
  const { audioJob, resumeReason, rebuildReason } = audioRecoveryView(detail, unsavedLyrics);
  return (
    <section className="admin-operations" aria-labelledby="admin-operations-title">
      <h2 id="admin-operations-title">Operação do pedido</h2>
      <p className="sub">
        As etapas em andamento são atualizadas automaticamente. Escolha uma ação e confira seu
        impacto antes de confirmar.
      </p>
      <OperationJobHistory detail={detail} />
      <div className="admin-operation-grid">
        <LyricsRecovery
          detail={detail}
          unsavedLyrics={unsavedLyrics}
          busy={busy}
          pending={operations.lyrics.isPending}
          onGenerate={() => operations.lyrics.mutate()}
        />
        <article className="price-card">
          <AudioRecoveryActions
            resume={{
              pending:
                operations.retry.isPending && operations.retry.variables?.jobId === audioJob?.id,
              blockedReason: busy ? 'Uma operação está em andamento.' : resumeReason,
              onConfirm: () => {
                if (audioJob) operations.retry.mutate({ jobId: audioJob.id });
              },
            }}
            rebuild={{
              pending: operations.rebuild.isPending,
              blockedReason: busy ? 'Uma operação está em andamento.' : rebuildReason,
              onConfirm: () => operations.rebuild.mutate(),
            }}
          />
        </article>
        <CoverRecovery
          detail={detail}
          busy={busy}
          pending={
            operations.retry.isPending &&
            operations.retry.variables?.jobId === detail.recovery?.cover.jobId
          }
          onRetry={(jobId, reference) => operations.retry.mutate({ jobId, reference })}
        />
        <EmailRecovery
          detail={detail}
          busy={busy}
          pending={operations.email.isPending}
          onRetry={() => operations.email.mutate()}
        />
      </div>
      <OperationFeedback
        error={operations.retry.error}
        success={operations.retry.isSuccess}
        message="Etapa reenfileirada. Acompanhe a atualização do processamento acima."
      />
      <OperationFeedback
        error={operations.lyrics.error}
        success={operations.lyrics.isSuccess}
        message="Letra criada e disponível para revisão."
      />
      <OperationFeedback
        error={operations.rebuild.error}
        success={operations.rebuild.isSuccess}
        message="As duas versões foram enfileiradas para uma nova criação."
      />
      <OperationFeedback
        error={operations.email.error}
        success={operations.email.isSuccess}
        message="Reenvio do aviso de entrega enfileirado."
      />
      <details>
        <summary>Histórico das ações administrativas</summary>
        {detail.notes.length ? (
          detail.notes.map((note) => (
            <p key={note.id}>
              {new Date(note.createdAt).toLocaleString('pt-BR')} · {note.message}
            </p>
          ))
        ) : (
          <p>Nenhuma ação registrada.</p>
        )}
      </details>
    </section>
  );
}

export function AudioVariantRecovery({
  orderId,
  audio,
  unsavedLyrics,
}: {
  orderId: string;
  audio: AdminOrderDetail['audio'][number];
  unsavedLyrics: boolean;
}) {
  const client = useQueryClient();
  const retry = useMutation({
    mutationFn: () => api.adminRegenerateAudio(orderId, audio.id),
    onSettled: () => client.invalidateQueries({ queryKey: ['admin', 'order', orderId] }),
  });
  const reason = unsavedLyrics
    ? 'Salve ou descarte a edição da letra antes de substituir esta faixa.'
    : audio.canRegenerate
      ? null
      : (audio.regenerateBlockedReason ?? 'Esta faixa não pode ser substituída nesta etapa.');
  return (
    <>
      <ConfirmOperation
        label={`Gerar novamente só a versão ${audio.variant}`}
        impact={`Substitui apenas a versão ${audio.variant}. A outra versão permanece disponível.`}
        pending={retry.isPending}
        disabledReason={reason}
        onConfirm={() => retry.mutate()}
      />
      <OperationFeedback
        error={retry.error}
        success={retry.isSuccess}
        message={`A versão ${audio.variant} foi enfileirada para nova criação.`}
      />
    </>
  );
}

export function UnknownAiCalls({ detail }: { detail: AdminOrderDetail }) {
  const client = useQueryClient();
  const [note, setNote] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const resolve = useMutation({
    mutationFn: (callId: string) => api.resolveAiCall(detail.order.id, callId, note),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin', 'order', detail.order.id] }),
  });
  if (!detail.unknownCalls?.length) return null;
  return (
    <section aria-label="Resultados externos desconhecidos">
      <h3>Conferência de chamadas sem resultado</h3>
      <p>
        Confira o histórico do provedor antes de autorizar outra tentativa. A chamada anterior pode
        ter sido cobrada.
      </p>
      <label>
        Resultado da conferência
        <textarea value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />
      </label>
      <label>
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        Conferi o provedor e autorizo uma nova tentativa, mesmo que isso gere outra cobrança.
      </label>
      {detail.unknownCalls.map((call) => (
        <article key={call.id}>
          <p>
            {call.kind} · {call.provider} · {new Date(call.createdAt).toLocaleString('pt-BR')}
          </p>
          <button
            type="button"
            disabled={!acknowledged || note.trim().length < 3 || resolve.isPending}
            onClick={() => resolve.mutate(call.id)}
          >
            Registrar conferência e liberar retomada
          </button>
        </article>
      ))}
      <OperationFeedback
        error={resolve.error}
        success={resolve.isSuccess}
        message="Conferência registrada. Use a ação de retomada desejada; o custo anterior continua desconhecido."
      />
    </section>
  );
}
