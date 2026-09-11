import type { OrderStatus } from '@resenha/contracts';

export type RecoveryJob = { id: string; type: string; status: string; payload: unknown };
export type RecoveryCover = {
  id: string;
  attempt: number;
  status: string;
  hadReference: boolean;
  referenceAssetId: string | null;
  createdAt: Date;
  referenceCreatedAt: Date | null;
  updatedAt: Date;
  lastError: string | null;
};
export type RecoveryContext = {
  status: OrderStatus;
  paid: boolean;
  approvedLyrics: boolean;
  hasStory: boolean;
  generatedCount: number;
  lyricsAvailable: boolean;
  jobs: RecoveryJob[];
  covers: RecoveryCover[];
  emailSent: boolean;
  deliveryBlocked: boolean;
  audioReady: boolean;
};
export const referenceRequired = (cover: RecoveryCover) =>
  cover.hadReference &&
  (!cover.referenceAssetId ||
    (cover.referenceCreatedAt ?? cover.createdAt).getTime() < Date.now() - 7 * 86_400_000);
export const coverAttempt = (payload: unknown): number | undefined => {
  if (!payload || typeof payload !== 'object' || !('attempt' in payload)) return undefined;
  return payload.attempt === 1 || payload.attempt === 2 ? payload.attempt : undefined;
};
export const audioRecoveryReason = (context: RecoveryContext): string | null => {
  if (!context.paid) return 'Confirme o pagamento antes de produzir áudio.';
  if (!context.approvedLyrics) return 'Uma letra aprovada é necessária.';
  if (
    !['failed', 'review_required', 'revision_requested', 'delivered', 'audio_queued'].includes(
      context.status,
    )
  )
    return 'O pedido não está disponível para reprodução.';
  if (context.jobs.some((job) => ['pending', 'processing'].includes(job.status)))
    return 'Já existe um trabalho em andamento neste pedido.';
  return null;
};
export const jobRecovery = (job: RecoveryJob, context: RecoveryContext) => {
  const cover = context.covers.find((item) => item.attempt === coverAttempt(job.payload));
  const requiresReference =
    job.type === 'generate_cover' && Boolean(cover && referenceRequired(cover));
  let reason: string | null = null;
  if (job.status !== 'failed') reason = 'Somente trabalhos com falha podem ser retomados.';
  else if (
    context.jobs.some(
      (other) =>
        other.id !== job.id &&
        (other.type === job.type ||
          (context.status === 'delivered' &&
            ['generate_audio', 'deliver-notify'].includes(other.type) &&
            ['generate_audio', 'deliver-notify'].includes(job.type))) &&
        ['pending', 'processing'].includes(other.status),
    )
  )
    reason = 'Já existe um trabalho deste tipo em andamento.';
  else if (job.type === 'generate_cover') {
    if (
      ![
        'paid',
        'audio_queued',
        'audio_generating',
        'review_required',
        'revision_requested',
        'delivered',
        'failed',
      ].includes(context.status)
    )
      reason = 'Esta etapa não permite retomar a capa.';
    else if (!context.paid || !context.approvedLyrics)
      reason = 'Pagamento e letra aprovada são necessários.';
    else if (!cover || !['failed', 'processing', 'pending'].includes(cover.status))
      reason = 'Esta tentativa de capa não pode ser retomada.';
  } else if (
    job.type === 'deliver-notify' ||
    (job.type === 'generate_audio' && context.status === 'delivered')
  ) {
    if (context.status !== 'delivered' || !context.audioReady)
      reason = 'A entrega ainda não foi concluída.';
    else if (context.deliveryBlocked)
      reason = 'O acesso à entrega está revogado, expirado ou precisa de revisão.';
    else if (context.emailSent) reason = 'A notificação já foi enviada.';
  } else if (job.type === 'generate_audio') reason = audioRecoveryReason(context);
  else reason = 'Este tipo de trabalho não permite retomada.';
  return { canRetry: !reason, retryBlockedReason: reason, requiresReference };
};
export const recoveryFor = (context: RecoveryContext) => {
  const lyricsBusy =
    context.status === 'lyrics_generating' ||
    context.jobs.some((job) => ['pending', 'processing'].includes(job.status));
  const prepayment =
    ['story_completed', 'lyrics_ready', 'lyrics_approved', 'failed'].includes(context.status) &&
    !context.paid;
  const canEdit =
    context.hasStory &&
    !lyricsBusy &&
    (prepayment ||
      (context.paid &&
        ['failed', 'review_required', 'revision_requested'].includes(context.status)));
  const canGenerate =
    prepayment &&
    context.status !== 'lyrics_approved' &&
    context.hasStory &&
    !lyricsBusy &&
    context.generatedCount < 4 &&
    context.lyricsAvailable;
  const editBlockedReason = canEdit
    ? null
    : !context.hasStory
      ? 'Preencha a história do pedido.'
      : lyricsBusy
        ? 'Aguarde o trabalho em andamento.'
        : 'Esta etapa não permite editar a letra.';
  const generateBlockedReason = canGenerate
    ? null
    : !context.hasStory
      ? 'Preencha a história do pedido.'
      : lyricsBusy
        ? 'Aguarde o trabalho em andamento.'
        : !prepayment || context.status === 'lyrics_approved'
          ? 'Esta etapa não permite gerar uma nova letra.'
          : context.generatedCount >= 4
            ? 'O limite de quatro gerações foi atingido. A edição manual continua disponível.'
            : 'A geração de letra está indisponível. Verifique a configuração do provedor.';
  const audioReason = audioRecoveryReason(context);
  const coverJob = [...context.jobs]
    .reverse()
    .find((job) => job.type === 'generate_cover' && job.status === 'failed');
  const cover = coverJob ? jobRecovery(coverJob, context) : null;
  const emailReason =
    context.status !== 'delivered' || !context.audioReady
      ? 'A entrega ainda não foi concluída.'
      : context.deliveryBlocked
        ? 'O acesso à entrega está revogado, expirado ou precisa de revisão.'
        : context.emailSent
          ? 'A notificação já foi enviada.'
          : context.jobs.some(
                (job) =>
                  ['deliver-notify', 'generate_audio'].includes(job.type) &&
                  ['pending', 'processing'].includes(job.status),
              )
            ? 'A notificação já está na fila.'
            : null;
  return {
    lyrics: {
      canGenerate,
      canEdit,
      generateBlockedReason,
      editBlockedReason,
      remainingGenerations: Math.max(0, 4 - context.generatedCount),
      reason:
        canGenerate || canEdit
          ? null
          : !context.hasStory
            ? 'Preencha a história do pedido.'
            : lyricsBusy
              ? 'Aguarde o trabalho em andamento.'
              : 'Esta etapa não permite recuperar a letra.',
    },
    audio: { canRebuild: !audioReason, reason: audioReason },
    cover: {
      canRetry: cover?.canRetry ?? false,
      requiresReference: cover?.requiresReference ?? false,
      jobId: coverJob?.id ?? null,
      reason: cover ? cover.retryBlockedReason : 'Não há tentativa de capa com falha.',
    },
    email: { canRetry: !emailReason, reason: emailReason },
  };
};
export const failureCode = (value: string | null) => {
  if (!value) return null;
  if (/402|limite do provedor/i.test(value)) return 'provider_limit';
  if (/401|403|credential|api.key|autoriz/i.test(value)) return 'provider_auth';
  if (/429|rate.?limit/i.test(value)) return 'rate_limit';
  if (/timeout|timed out|abort/i.test(value)) return 'timeout';
  if (/reference|referência/i.test(value)) return 'reference_missing';
  if (/PROHIBITED|content|conteúdo/i.test(value)) return 'content_blocked';
  return 'unknown';
};
export const publicFailure = (value: string | null) => {
  const code = failureCode(value);
  if (!code) return null;
  return {
    provider_limit:
      'O limite do provedor impediu a operação. Verifique o saldo e o limite da chave antes de retomar.',
    provider_auth: 'O provedor não autorizou a operação. Verifique a configuração.',
    rate_limit: 'O provedor recebeu muitas solicitações. Aguarde antes de retomar.',
    timeout: 'O provedor não respondeu no prazo. Aguarde e tente novamente.',
    reference_missing: 'A foto de referência está indisponível. Envie novamente para retomar.',
    content_blocked: 'O provedor recusou o conteúdo. Revise antes de retomar.',
    unknown: 'A operação não foi concluída. Revise a configuração e tente novamente.',
  }[code];
};
