/** Traduções operacionais e minimização de PII do cockpit administrativo. */

export const statusPt = (status: string): string => {
  const labels: Record<string, string> = {
    draft: 'Rascunho',
    story_completed: 'História pronta',
    lyrics_generating: 'Criando letra',
    lyrics_ready: 'Letra em revisão',
    lyrics_approved: 'Letra aprovada',
    payment_pending: 'Aguardando pagamento',
    paid: 'Pago',
    audio_queued: 'Áudio na fila',
    audio_generating: 'Produzindo áudio',
    review_required: 'Aguardando revisão',
    delivered: 'Entregue',
    revision_requested: 'Revisão solicitada',
    failed: 'Falhou',
    refunded: 'Reembolsado',
    cancelled: 'Cancelado',
  };
  return labels[status] ?? status;
};

export const paymentStatusPt = (status: string): string => {
  const labels: Record<string, string> = {
    creating: 'Criando cobrança',
    unknown: 'Resultado desconhecido; requer conferência',
    expired: 'Expirado',
    pending: 'Aguardando',
    approved: 'Aprovado',
    rejected: 'Recusado',
    cancelled: 'Cancelado',
    refunded: 'Reembolsado',
  };
  return labels[status] ?? status;
};

export const eventPt = (event: string): string => {
  const labels: Record<string, string> = {
    order_created: 'Pedido criado',
    story_saved: 'História salva',
    lyrics_generated: 'Letra gerada',
    lyrics_approved: 'Letra aprovada',
    checkout_started: 'Pagamento iniciado',
    paid: 'Pagamento confirmado',
    delivered: 'Pedido entregue',
    landing_view: 'Visita à página inicial',
    form_started: 'Formulário iniciado',
    form_completed: 'Formulário concluído',
  };
  return labels[event] ?? event;
};

export const funnelEventPt = (event: string): string => eventPt(event);

/** Mascara e-mail para operação: `a***@dominio`. Nunca devolve o endereço cheio. */
export const maskEmail = (email: string): string => {
  const [user = '', domain = ''] = email.split('@');
  if (!domain) return 'e-mail oculto';
  const first = user.slice(0, 1) || '•';
  return `${first}•••@${domain}`;
};

/** Idade do pedido em linguagem operacional curta. */
export const orderAgePt = (createdAt: string, now: number = Date.now()): string => {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 'data indisponível';
  const minutes = Math.max(0, Math.floor((now - created) / 60_000));
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
};

/** Próxima decisão operacional a partir do status técnico. */
export const nextActionPt = (status: string): string => {
  if (status === 'failed') return 'Investigar erro e decidir retry';
  if (status === 'review_required') return 'Ouvir e decidir aprovação';
  if (status === 'audio_queued' || status === 'audio_generating') return 'Acompanhar produção';
  if (status === 'lyrics_generating') return 'Acompanhar geração da letra';
  if (status === 'payment_pending' || status === 'lyrics_approved')
    return 'Aguardar pagamento do cliente';
  if (status === 'story_completed' || status === 'lyrics_ready')
    return 'Aguardar cliente revisar a letra';
  if (status === 'revision_requested') return 'Avaliar solicitação de ajuste';
  if (status === 'delivered') return 'Nenhuma ação pendente';
  return 'Verificar pedido';
};

export function jobNamePt(type: string): string {
  const names: Record<string, string> = {
    generate_audio: 'Criação das versões de áudio',
    generate_cover: 'Criação da capa',
    deliver_notify: 'Entrega e aviso por e-mail',
    generate_lyrics: 'Criação da letra',
  };
  return names[type] ?? 'Processamento do pedido';
}

export function jobStatusPt(status: string): string {
  const names: Record<string, string> = {
    pending: 'Aguardando execução',
    processing: 'Em processamento',
    completed: 'Concluído',
    failed: 'Interrompido',
  };
  return names[status] ?? 'Estado não reconhecido';
}

export function failureDiagnosis(
  error: string | null | undefined,
  blockedReason?: string | null,
  errorCode?: string | null,
) {
  if (!error) return null;
  const cases = [
    {
      code: 'reference_missing',
      match: /foto de referência.*indisponível|reference.*missing/i,
      title: 'Foto de referência indisponível',
      message: 'A capa precisa receber novamente a foto utilizada como referência.',
      action: 'Envie a foto e confirme a autorização antes de retomar a capa.',
    },
    {
      code: 'content_blocked',
      match: /PROHIBITED_CONTENT|conteúdo (?:proibido|recusado)|recusou o conteúdo/i,
      title: 'Conteúdo recusado pelo provedor',
      message: 'A geração foi interrompida por uma restrição de conteúdo.',
      action: 'Revise a letra e a descrição antes de tentar novamente.',
    },
    {
      code: 'provider_limit',
      match: /402|budget|credits|créditos|saldo|limite do provedor/i,
      title: 'Créditos ou limite de uso',
      message: 'O serviço interrompeu a geração por uma condição de cobrança ou limite.',
      action: 'Confira o saldo e os limites configurados antes de retomar.',
    },
    {
      code: 'provider_auth',
      match: /401|403|unauthorized|credential|credencial|não autorizou/i,
      title: 'Acesso ao serviço recusado',
      message: 'O serviço não autorizou a solicitação.',
      action: 'Confira a credencial e as permissões configuradas.',
    },
    {
      code: 'rate_limit',
      match: /429|rate.?limit/i,
      title: 'Limite temporário do serviço',
      message: 'O serviço limitou as solicitações recebidas.',
      action: 'Aguarde a disponibilidade antes de retomar a etapa.',
    },
    {
      code: 'timeout',
      match: /timeout|timed out|ETIMEDOUT/i,
      title: 'Tempo de resposta excedido',
      message: 'O serviço não concluiu a resposta dentro do prazo da solicitação.',
      action: 'Verifique o estado do serviço e retome a etapa quando estiver disponível.',
    },
  ];
  const matched = cases.find((item) =>
    errorCode ? item.code === errorCode : item.match.test(error),
  );
  return {
    title: matched?.title ?? 'Etapa interrompida',
    message: matched?.message ?? 'A etapa não foi concluída. Consulte o detalhe do diagnóstico.',
    action:
      blockedReason ?? matched?.action ?? 'Confira a causa antes de executar uma nova tentativa.',
    safeDetail: error,
  };
}
