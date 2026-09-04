export const orderStatuses = [
  'draft',
  'story_completed',
  'lyrics_generating',
  'lyrics_ready',
  'lyrics_approved',
  'payment_pending',
  'paid',
  'audio_queued',
  'audio_generating',
  'review_required',
  'delivered',
  'revision_requested',
  'failed',
  'refunded',
  'cancelled',
] as const;

export type OrderStatus = (typeof orderStatuses)[number];
type JourneyAction =
  'continue_story' | 'open_lyrics' | 'review_lyrics' | 'retry_lyrics' | 'checkout' | 'listen';
type JourneyKind =
  | 'story'
  | 'lyrics'
  | 'lyrics_failed'
  | 'payment'
  | 'production'
  | 'production_failed'
  | 'delivered'
  | 'closed';
type Journey = {
  valid: true;
  status: OrderStatus;
  step: 1 | 2 | 3 | 4 | 5;
  kind: JourneyKind;
  heading: string;
  message: string;
  action?: JourneyAction;
  complete: boolean;
};

export const isOrderStatus = (value: unknown): value is OrderStatus =>
  typeof value === 'string' && orderStatuses.some((status) => status === value);

export function deriveOrderJourney(
  status: Exclude<OrderStatus, 'delivered'>,
  context: { hasApprovedLyrics: boolean; completedAudio: number },
): Journey;
export function deriveOrderJourney(
  status: 'delivered',
  context: { hasApprovedLyrics: boolean; completedAudio: number },
): Journey | { valid: false; reason: 'inconsistent_delivery' };
export function deriveOrderJourney(
  status: unknown,
  context: { hasApprovedLyrics: boolean; completedAudio: number },
): Journey | { valid: false; reason: 'unknown_status' | 'inconsistent_delivery' };
export function deriveOrderJourney(
  status: unknown,
  context: { hasApprovedLyrics: boolean; completedAudio: number },
): Journey | { valid: false; reason: 'unknown_status' | 'inconsistent_delivery' } {
  if (!isOrderStatus(status)) return { valid: false, reason: 'unknown_status' };
  if (status === 'delivered') {
    if (context.completedAudio !== 2) return { valid: false, reason: 'inconsistent_delivery' };
    return {
      valid: true,
      status,
      step: 5,
      kind: 'delivered',
      heading: 'Sua música está pronta!',
      message: 'Ouça e baixe as duas versões no player.',
      action: 'listen',
      complete: true,
    };
  }
  if (status === 'failed') {
    return context.hasApprovedLyrics
      ? {
          valid: true,
          status,
          step: 4,
          kind: 'production_failed',
          heading: 'Tivemos um problema na produção',
          message:
            'A produção não foi concluída. Acompanhe este pedido sem nenhum custo extra; o acompanhamento não inicia outra geração.',
          complete: false,
        }
      : {
          valid: true,
          status,
          step: 2,
          kind: 'lyrics_failed',
          heading: 'A letra não foi concluída',
          message: 'Sua história está salva. Você pode tentar gerar a letra novamente.',
          action: 'retry_lyrics',
          complete: false,
        };
  }
  if (status === 'draft')
    return {
      valid: true,
      status,
      step: 1,
      kind: 'story',
      heading: 'Continue sua história',
      message: 'Complete os dados para começar a letra.',
      action: 'continue_story',
      complete: false,
    };
  if (['story_completed', 'lyrics_generating', 'lyrics_ready'].includes(status))
    return {
      valid: true,
      status,
      step: 2,
      kind: 'lyrics',
      heading:
        status === 'lyrics_ready'
          ? 'Revise sua letra'
          : status === 'lyrics_generating'
            ? 'Criando sua letra'
            : 'Sua história está pronta',
      message:
        status === 'lyrics_generating'
          ? 'A criação continua mesmo se você recarregar esta página.'
          : status === 'lyrics_ready'
            ? 'Sua letra está pronta para revisão.'
            : 'Sua história está pronta para virar letra.',
      action: status === 'lyrics_ready' ? 'review_lyrics' : 'open_lyrics',
      complete: false,
    };
  if (['lyrics_approved', 'payment_pending'].includes(status))
    return {
      valid: true,
      status,
      step: 3,
      kind: 'payment',
      heading: 'Falta o pagamento',
      message: 'Sua letra foi aprovada. Conclua o pagamento para produzir o áudio.',
      action: 'checkout',
      complete: false,
    };
  if (['refunded', 'cancelled'].includes(status))
    return {
      valid: true,
      status,
      step: 3,
      kind: 'closed',
      heading: status === 'refunded' ? 'Pedido reembolsado' : 'Pedido cancelado',
      message: 'Este pedido foi encerrado e não seguirá para produção.',
      complete: false,
    };
  return {
    valid: true,
    status,
    step: 4,
    kind: 'production',
    heading: 'Sua música está sendo produzida',
    message: 'Acompanhe por aqui até as duas versões ficarem prontas.',
    complete: false,
  };
}

export const latestLyrics = <T extends { number: number }>(versions: T[]): T | undefined =>
  versions.reduce<T | undefined>(
    (latest, version) => (!latest || version.number > latest.number ? version : latest),
    undefined,
  );
