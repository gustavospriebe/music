import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Music2,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Radio,
  CheckCircle2,
  Clock3,
  Copy,
  Disc3,
  Download,
  ImageDown,
  MessageCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type PublicConfiguration } from '../api';
import { CustomerWorkspace, Footer, Header, Loading } from '../components';
import { DeliveryCoverCard, OwnerCoverCard } from '../cover-card';
import { LyricEditor } from '../lyrics-editor';
import { readMyOrders, rememberMyOrder } from '../my-orders';
import {
  completedAudioCount,
  deriveOrderJourney,
  isCheckoutStatus,
  isLyricsWorkspaceStatus,
  isOrderStatus,
  latestLyrics,
  resumeCustomerPath,
} from '../order-journey';
import { formatMoney, type Lyrics, type LyricsContent, type OrderDetail } from '../types';

export { CreateStory } from './create-story';

function orderIdFromSearch() {
  const param = new URLSearchParams(window.location.search).get('pedido');
  return param ?? window.sessionStorage.getItem('resenha:lastOrder') ?? '';
}
export function LyricsReview() {
  const navigate = useNavigate();
  const [publicId] = useState(orderIdFromSearch);
  const queryClient = useQueryClient();
  const order = useQuery({
    queryKey: ['order', publicId],
    queryFn: () => api.getOrder(publicId),
    enabled: Boolean(publicId),
    refetchInterval: (query) =>
      query.state.data?.order.status === 'lyrics_generating' ? 1500 : false,
  });
  const generate = useMutation({
    mutationFn: (refinement?: { instructions: string; baseVersion: number }) =>
      api.generateLyrics(publicId, refinement),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order', publicId] }),
    onError: () => queryClient.invalidateQueries({ queryKey: ['order', publicId] }),
  });
  const edit = useMutation({
    mutationFn: ({ number, content }: { number: number; content: LyricsContent }) =>
      api.editLyrics(publicId, number, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order', publicId] }),
  });
  const approve = useMutation({
    mutationFn: ({ number, content }: { number: number; content?: LyricsContent }) =>
      api.approveLyrics(publicId, number, content),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['order', publicId] });
      navigate(`/criar/checkout?pedido=${publicId}`);
    },
  });
  if (!publicId) return <Navigate to="/criar" replace />;
  if (order.isLoading) return <Loading label="Carregando sua história…" />;
  if (order.isError || !order.data)
    return <PageError message="Não foi possível abrir sua história." />;
  const approved = order.data.lyrics.some((version) => Boolean(version.approvedAt));
  if (!isLyricsWorkspaceStatus(order.data.order.status, approved)) {
    if (order.isFetching) return <Loading label="Carregando sua história…" />;
    return (
      <Navigate
        to={resumeCustomerPath(order.data.order.status, publicId, { hasApprovedLyrics: approved })}
        replace
      />
    );
  }
  return (
    <LyricsReviewContent
      detail={order.data}
      generating={generate.isPending}
      operation={edit.isPending ? 'saving' : approve.isPending ? 'approving' : null}
      saved={edit.isSuccess}
      mutationError={generate.error ?? edit.error ?? approve.error}
      onGenerate={() => generate.mutate(undefined)}
      onRefine={(instructions, baseVersion) => {
        edit.reset();
        approve.reset();
        generate.mutate({ instructions, baseVersion });
      }}
      onSave={(number, content) => {
        generate.reset();
        approve.reset();
        return edit.mutateAsync({ number, content }).then(() => undefined);
      }}
      onApprove={(number, content) => {
        generate.reset();
        edit.reset();
        approve.mutate({ number, content });
      }}
    />
  );
}

function LyricsReviewContent({
  detail,
  generating,
  operation,
  saved,
  mutationError,
  onGenerate,
  onRefine,
  onSave,
  onApprove,
}: {
  detail: OrderDetail;
  generating: boolean;
  operation: 'saving' | 'approving' | null;
  saved: boolean;
  mutationError: Error | null;
  onGenerate: () => void;
  onRefine: (instructions: string, baseVersion: number) => void;
  onSave: (number: number, content: LyricsContent) => Promise<void>;
  onApprove: (number: number, content?: LyricsContent) => void;
}) {
  const status = detail.order.status;
  if (!isOrderStatus(status))
    return <PageError message="O pedido está com um estado inconsistente." />;
  const lyric = latestLyrics(detail.lyrics);
  const approved = detail.lyrics.some((version) => Boolean(version.approvedAt));
  if (status === 'lyrics_generating' && !lyric) return <LyricsGeneratingView />;
  const canGenerate = status === 'story_completed' || (status === 'failed' && !approved);
  if (status === 'lyrics_ready' && !lyric)
    return <PageError message="O pedido está com um estado inconsistente: a letra está ausente." />;
  if (!canGenerate && status !== 'lyrics_ready' && status !== 'lyrics_generating')
    return <PageError message="A revisão da letra não está disponível nesta etapa." />;
  return (
    <LyricsWorkspace
      remainingGenerations={
        detail.remainingGenerations ??
        Math.max(0, 4 - detail.lyrics.filter((version) => version.kind === 'generated').length)
      }
      versions={detail.lyrics}
      story={detail.story}
      status={status}
      lyric={lyric}
      canGenerate={canGenerate}
      generating={generating || status === 'lyrics_generating'}
      operation={operation}
      saved={saved}
      mutationError={mutationError}
      onGenerate={onGenerate}
      onRefine={onRefine}
      onSave={onSave}
      onApprove={onApprove}
    />
  );
}

function LyricsGeneratingView() {
  return (
    <CustomerWorkspace step={2} className="review">
      <h1>Criando sua letra</h1>
      <p role="status">
        Criando sua letra. A criação continua mesmo se você recarregar esta página.
      </p>
      <p className="sub">
        Este passo costuma levar alguns minutos. Você pode fechar a página e voltar pelo mesmo
        navegador; a história continua salva e a letra aparece aqui quando estiver pronta.
      </p>
    </CustomerWorkspace>
  );
}

function LyricsWorkspace({
  story,
  versions,
  remainingGenerations,
  status,
  lyric,
  canGenerate,
  generating,
  operation,
  saved,
  mutationError,
  onGenerate,
  onRefine,
  onSave,
  onApprove,
}: {
  story?: OrderDetail['story'];
  versions: Lyrics[];
  remainingGenerations: number;
  status: string;
  lyric: Lyrics | undefined;
  canGenerate: boolean;
  generating: boolean;
  operation: 'saving' | 'approving' | null;
  saved: boolean;
  mutationError: Error | null;
  onGenerate: () => void;
  onRefine: (instructions: string, baseVersion: number) => void;
  onSave: (number: number, content: LyricsContent) => Promise<void>;
  onApprove: (number: number, content?: LyricsContent) => void;
}) {
  return (
    <CustomerWorkspace step={2} className="review">
      {canGenerate ? null : <h1>{lyric ? lyric.content.title : 'Sua letra, do seu jeito.'}</h1>}
      {mutationError && (
        <p className="error" role="alert">
          {mutationError.message}
        </p>
      )}
      {canGenerate && (
        <LyricsGenerateAction
          story={story}
          status={status}
          pending={generating}
          onGenerate={onGenerate}
        />
      )}
      {!canGenerate && lyric && (
        <LyricEditor
          lyric={lyric}
          versions={versions}
          onSave={onSave}
          onApprove={onApprove}
          operation={operation}
          saved={saved}
          generating={generating}
          remainingGenerations={remainingGenerations}
          onRefine={onRefine}
        />
      )}
    </CustomerWorkspace>
  );
}

function PenMark() {
  return <Sparkles size={26} aria-hidden="true" />;
}
function SongBrief({ story, title }: { story?: OrderDetail['story']; title?: string }) {
  if (!story && !title) return null;
  const genre = typeof story?.genre === 'string' ? story.genre : '';
  const mood = typeof story?.mood === 'string' ? story.mood : '';
  const occasion = typeof story?.occasion === 'string' ? story.occasion.trim() : '';
  return (
    <div className="song-brief">
      <Music2 size={22} aria-hidden="true" />
      <div>
        <span className="eyebrow">SUA MÚSICA</span>
        <strong>{title || story?.subjectName || 'Sua criação original'}</strong>
        {occasion && <p>{occasion}</p>}
        {(genre || mood) && <small>{[genre, mood].filter(Boolean).join(' · ')}</small>}
      </div>
    </div>
  );
}
function LyricsGenerateAction({
  story,
  status,
  pending,
  onGenerate,
}: {
  story?: OrderDetail['story'];
  status: string;
  pending: boolean;
  onGenerate: () => void;
}) {
  const configuration = useQuery({
    queryKey: ['configuration'],
    queryFn: api.configuration,
    staleTime: 60_000,
  });
  const available = configuration.data?.generation.lyricsAvailable === true;
  return (
    <section className="lyrics-preparation" aria-labelledby="lyrics-prep-title">
      <span className="workspace-mark">
        <PenMark />
      </span>
      <p className="eyebrow">HISTÓRIA SALVA · PRÓXIMO PASSO</p>
      <h1 id="lyrics-prep-title">Vamos dar palavras à sua ideia?</h1>
      <p className="workspace-intro">
        Sua história e seu som já estão escolhidos. Crie uma primeira letra para ler, editar e
        deixar do seu jeito.
      </p>
      <SongBrief story={story} />
      <details className="generation-details">
        <summary>O que acontece ao criar a letra?</summary>
        <ul className="prep-expectations">
          <li>Vamos transformar sua história salva em uma letra revisável em português.</li>
          <li>Este passo costuma levar alguns minutos e consome uma tentativa de geração.</li>
          <li>Você pode fechar a página: a história continua salva e a letra aparece aqui.</li>
          <li>Volte pelo mesmo navegador ou pela página do pedido para acompanhar.</li>
        </ul>
      </details>
      {status === 'failed' && <p>A letra não foi concluída. Sua história continua salva.</p>}
      <button
        type="button"
        className="button primary"
        onClick={onGenerate}
        disabled={pending || !available}
      >
        {pending
          ? status === 'failed'
            ? 'Tentando gerar novamente'
            : 'Criando letra'
          : status === 'failed'
            ? 'Tentar gerar novamente'
            : 'Criar letra agora'}{' '}
        <ArrowRight size={17} aria-hidden="true" />
      </button>
      <p className="studio-note">
        <ShieldCheck size={14} aria-hidden="true" /> Você revisa a letra antes do pagamento.
      </p>
      {!available && (
        <p role="status" className="availability-note">
          {configuration.isLoading
            ? 'Verificando disponibilidade da criação…'
            : 'Criação da letra temporariamente indisponível. Sua história está salva.'}
        </p>
      )}
      {pending && <p role="status">Gerando sua letra…</p>}
    </section>
  );
}
export function Checkout() {
  return <CheckoutContent publicId={orderIdFromSearch()} />;
}

type CheckoutView =
  | { kind: 'home' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'redirect'; to: string }
  | { kind: 'ready'; detail: OrderDetail; approvedLyrics: Lyrics | undefined };

function resolveCheckoutView(
  publicId: string,
  order: {
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
    data?: OrderDetail;
  },
): CheckoutView {
  if (!publicId) return { kind: 'home' };
  if (order.isLoading) return { kind: 'loading' };
  if (order.isError || !order.data)
    return { kind: 'error', message: 'Não foi possível abrir seu pedido para pagamento.' };
  const detail = order.data;
  const approvedLyrics = latestLyrics(detail.lyrics.filter((lyric) => lyric.approvedAt));
  if (isCheckoutStatus(detail.order.status)) return { kind: 'ready', detail, approvedLyrics };
  if (order.isFetching) return { kind: 'loading' };
  if (!isOrderStatus(detail.order.status))
    return { kind: 'error', message: 'Não foi possível abrir seu pedido para pagamento.' };
  return {
    kind: 'redirect',
    to: resumeCustomerPath(detail.order.status, publicId, {
      hasApprovedLyrics: Boolean(approvedLyrics),
    }),
  };
}

function checkoutButtonLabel(pending: boolean, localCheckout: boolean, label: string): string {
  if (pending) return 'Confirmando pagamento';
  if (localCheckout) return 'Confirmar pagamento (ambiente local)';
  return `Pagar com ${label}`;
}
function CheckoutPaymentNote({
  unavailable,
  localCheckout,
  label,
  reason,
}: {
  unavailable: boolean;
  localCheckout: boolean;
  label: string;
  reason?: string | null;
}) {
  if (unavailable)
    return (
      <p role="status">
        Pagamento indisponível:{' '}
        {reason || 'estamos preparando as condições de compra. Sua letra continua salva.'}
      </p>
    );
  if (localCheckout)
    return (
      <p className="sub">
        Neste ambiente o pagamento é confirmado localmente, sem cobrança ou redirecionamento
        externo.
      </p>
    );
  return (
    <p className="sub">
      Ao continuar, você será redirecionado ao {label} para concluir com segurança.
    </p>
  );
}
function PurchaseConditions({ configuration }: { configuration?: PublicConfiguration }) {
  const policy = configuration?.commercial;
  const rows = [
    ['Prazo de entrega', policy?.deliveryEstimate],
    ['Ajustes', policy?.revisionPolicy],
    ['Reembolso', policy?.refundPolicy],
    ['Uso da música', policy?.usageLicense],
  ].filter((row) => Boolean(row[1]?.trim()));
  if (!rows.length && !configuration?.supportEmail && !policy?.termsUrl && !policy?.privacyUrl)
    return null;
  return (
    <section className="price-card" aria-labelledby="checkout-conditions-title">
      <h2 id="checkout-conditions-title">Condições da sua música</h2>
      <dl className="summary-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        {configuration?.supportEmail && (
          <div>
            <dt>Suporte</dt>
            <dd>
              <a href={`mailto:${configuration.supportEmail}`}>{configuration.supportEmail}</a>
            </dd>
          </div>
        )}
      </dl>
      <div className="actions">
        {policy?.termsUrl && (
          <a href={policy.termsUrl} target="_blank" rel="noreferrer">
            Termos
          </a>
        )}
        {policy?.privacyUrl && (
          <a href={policy.privacyUrl} target="_blank" rel="noreferrer">
            Privacidade
          </a>
        )}
      </div>
    </section>
  );
}

function CheckoutReady({
  configuration,
  detail,
  approvedLyrics,
  pending,
  errorMessage,
  onPay,
  productName,
}: {
  configuration?: PublicConfiguration;
  detail: OrderDetail;
  approvedLyrics: Lyrics | undefined;
  pending: boolean;
  errorMessage: string | undefined;
  onPay: () => void;
  productName: string;
}) {
  const paymentState = detail.payment;
  const localCheckout = Boolean(paymentState?.devFallback) && !paymentState?.configured;
  const unavailable = paymentState?.checkoutAllowed !== true;
  const providerLabel = paymentState?.label || configuration?.payment.label || 'pagamento seguro';
  return (
    <CustomerWorkspace step={3} className="checkout">
      <h1>Falta pouco para dar play.</h1>
      <div className="price-card" aria-labelledby="checkout-summary-title">
        <h2 id="checkout-summary-title">Resumo do pedido</h2>
        <dl className="summary-list">
          <div>
            <dt>Produto</dt>
            <dd>{productName}</dd>
          </div>
          <div>
            <dt>Sua música</dt>
            <dd>
              {approvedLyrics?.content.title ?? detail.story?.subjectName ?? 'A definir na letra'}
            </dd>
          </div>
          <div>
            <dt>Preço</dt>
            <dd>
              <b>
                {detail.order.priceCents > 0
                  ? formatMoney(detail.order.priceCents)
                  : 'Preço a definir'}
              </b>
            </dd>
          </div>
          <div>
            <dt>Inclui</dt>
            <dd>Letra revisável, duas versões de áudio e página privada.</dd>
          </div>
          <div>
            <dt>Próxima etapa</dt>
            <dd>Pagamento e depois produção do áudio.</dd>
          </div>
        </dl>
        {errorMessage && (
          <p className="error" role="alert">
            {errorMessage}
          </p>
        )}
        <CheckoutPaymentNote
          unavailable={unavailable}
          localCheckout={localCheckout}
          label={providerLabel}
          reason={paymentState?.unavailableReason}
        />
        <button
          className="button primary"
          disabled={pending || unavailable}
          aria-disabled={pending || unavailable}
          title={unavailable ? 'Pagamento indisponível neste ambiente' : undefined}
          onClick={onPay}
        >
          {checkoutButtonLabel(pending, localCheckout, providerLabel)}
        </button>
        {pending && <span role="status">Confirmando pagamento</span>}
      </div>
      <PurchaseConditions configuration={configuration} />
    </CustomerWorkspace>
  );
}

function CheckoutContent({ publicId }: { publicId: string }) {
  const configuration = useQuery({
    queryKey: ['configuration'],
    queryFn: api.configuration,
    staleTime: 60_000,
  });
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const order = useQuery({
    queryKey: ['order', publicId],
    queryFn: () => api.getOrder(publicId),
    enabled: Boolean(publicId),
  });
  const catalog = useQuery({
    queryKey: ['products'],
    queryFn: api.products,
    staleTime: 60_000,
  });
  const payment = useMutation({
    mutationFn: async () => {
      const checkout = await api.checkout(publicId);
      if (checkout.dev) {
        await api.approveDevPayment(publicId);
        await queryClient.invalidateQueries({ queryKey: ['order', publicId] });
        nav(`/pedido/${publicId}`);
        return;
      }
      window.location.href = checkout.checkoutUrl;
    },
    onError: (e) => toast.error(e.message),
  });
  const view = resolveCheckoutView(publicId, order);
  if (view.kind === 'home') return <Navigate to="/criar" replace />;
  if (view.kind === 'loading') return <Loading label="Carregando seu pedido…" />;
  if (view.kind === 'error') return <PageError message={view.message} />;
  if (view.kind === 'redirect') return <Navigate to={view.to} replace />;
  return (
    <CheckoutReady
      configuration={configuration.data}
      detail={view.detail}
      approvedLyrics={view.approvedLyrics}
      pending={payment.isPending}
      errorMessage={payment.isError ? payment.error.message : undefined}
      onPay={() => payment.mutate()}
      productName={
        catalog.data?.find((product) => product.type === view.detail.order.productType)?.name ??
        'Sua música'
      }
    />
  );
}

export function OrderStatus() {
  const { publicOrderId = '' } = useParams();
  const order = useQuery({
    queryKey: ['order', publicOrderId],
    queryFn: () => api.getOrder(publicOrderId),
    refetchInterval: (query) => {
      const status = query.state.data?.order.status;
      return status &&
        [
          'lyrics_generating',
          'payment_pending',
          'paid',
          'audio_queued',
          'audio_generating',
          'review_required',
          'revision_requested',
        ].includes(status)
        ? 2000
        : false;
    },
  });
  if (order.isLoading) return <Loading label="Atualizando pedido…" />;
  if (order.isError || !order.data)
    return <PageError message="Pedido não encontrado ou acesso inválido." />;
  return (
    <OrderStatusContent
      publicOrderId={publicOrderId}
      detail={order.data}
      checkedAt={order.dataUpdatedAt}
      checking={order.isFetching}
    />
  );
}

const orderJourneyAction = (
  action: string | null | undefined,
  publicOrderId: string,
  status?: string,
) => {
  const actions: Record<string, { label: string; to: string }> = {
    continue_story: { label: 'Continuar história', to: '/criar' },
    open_lyrics: { label: 'Acompanhar letra', to: `/criar/letra?pedido=${publicOrderId}` },
    review_lyrics: { label: 'Revisar letra', to: `/criar/letra?pedido=${publicOrderId}` },
    retry_lyrics: { label: 'Tentar gerar novamente', to: `/criar/letra?pedido=${publicOrderId}` },
    checkout: {
      label: status === 'payment_pending' ? 'Reabrir página de pagamento' : 'Ir para o pagamento',
      to: `/criar/checkout?pedido=${publicOrderId}`,
    },
    listen: { label: 'Ouvir versões', to: `/pedido/${publicOrderId}/entrega` },
    view_orders: { label: 'Ver minhas músicas', to: '/minhas-musicas' },
  };
  return action ? (actions[action] ?? null) : null;
};

function ProductionStatus({
  detail,
  checkedAt,
  checking,
}: {
  detail: OrderDetail;
  checkedAt: number;
  checking: boolean;
}) {
  const completed = completedAudioCount(detail.audio);
  const reviewing =
    detail.order.status === 'review_required' || detail.order.status === 'revision_requested';
  const queued = detail.order.status === 'paid' || detail.order.status === 'audio_queued';
  return (
    <section className="production-status" aria-labelledby="production-status-title">
      <div className="production-live">
        <span
          className={
            detail.order.status === 'revision_requested'
              ? 'production-symbol is-active'
              : reviewing
                ? 'production-symbol'
                : 'production-symbol is-active'
          }
          aria-hidden="true"
        >
          {detail.order.status === 'revision_requested' ? (
            <Clock3 size={24} />
          ) : reviewing ? (
            <CheckCircle2 size={24} />
          ) : (
            <Radio size={24} />
          )}
        </span>
        <div>
          <h2 id="production-status-title">
            {reviewing
              ? detail.order.status === 'revision_requested'
                ? 'Ajuste aguardando avaliação'
                : 'Versões prontas para revisão'
              : queued
                ? 'Sua música está na fila de criação'
                : 'Sua criação está em andamento'}
          </h2>
          <p>
            {reviewing
              ? 'O acompanhamento atualiza quando a revisão avançar.'
              : 'Pode deixar esta página aberta: verificamos o andamento automaticamente.'}
          </p>
        </div>
      </div>
      <div className="audio-production-count">
        <strong>{completed} de 2 versões prontas</strong>
        <span>Confirmadas pelo processamento</span>
      </div>
      <ul className="audio-production-versions" aria-label="Versões do áudio">
        {[1, 2].map((variant) => {
          const item =
            detail.audio.find(
              (audio) => audio.variant === variant && audio.status === 'completed',
            ) ?? detail.audio.find((audio) => audio.variant === variant);
          const ready = item?.status === 'completed';
          return (
            <li key={variant}>
              <span>Versão {variant}</span>
              <b>
                {ready
                  ? 'Gerada'
                  : item?.status === 'processing'
                    ? 'Em criação'
                    : item?.status === 'failed'
                      ? 'Precisa de atenção'
                      : 'Aguardando processamento'}
              </b>
            </li>
          );
        })}
      </ul>
      <p className="last-check" aria-live="polite">
        <Clock3 size={14} aria-hidden="true" />
        {checking
          ? 'Verificando andamento…'
          : `Última verificação às ${new Date(checkedAt).toLocaleTimeString('pt-BR')}`}
      </p>
    </section>
  );
}
function OrderStatusContent({
  publicOrderId,
  detail,
  checkedAt,
  checking,
}: {
  publicOrderId: string;
  detail: OrderDetail;
  checkedAt: number;
  checking: boolean;
}) {
  const approved = latestLyrics(detail.lyrics.filter((lyric) => lyric.approvedAt));
  const completedAudio = completedAudioCount(detail.audio);
  const journey = deriveOrderJourney(detail.order.status, {
    hasApprovedLyrics: Boolean(approved),
    completedAudio,
  });
  if (!journey.valid)
    return (
      <PageError
        message={
          journey.reason === 'inconsistent_delivery'
            ? 'O pedido está com uma entrega incompleta: faltam duas versões válidas.'
            : 'O pedido está com um estado inconsistente.'
        }
      />
    );
  const action = orderJourneyAction(journey.action, publicOrderId, detail.order.status);
  return (
    <CustomerWorkspace step={journey.step} complete={journey.complete} className="delivery">
      <p className="eyebrow">PEDIDO PRIVADO</p>
      <h1>{journey.heading}</h1>
      <p>{journey.message}</p>
      {detail.order.status === 'payment_pending' && (
        <div
          className="status-banner"
          style={{
            margin: '1rem 0',
            padding: '0.85rem 1.15rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            background: 'var(--surface-2, rgba(255,255,255,0.05))',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
          }}
        >
          <Clock3 size={20} style={{ flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.4' }}>
            <strong>Verificando pagamento automaticamente...</strong> Não se preocupe se já fez o
            PIX, esta tela atualizará assim que o banco confirmar.
          </p>
        </div>
      )}
      {journey.kind === 'production' && (
        <ProductionStatus detail={detail} checkedAt={checkedAt} checking={checking} />
      )}
      <SongBrief story={detail.story} title={approved?.content.title} />
      {action && (
        <div className="order-status-cta-row">
          <Link className="button primary" to={action.to}>
            {action.label}
          </Link>
        </div>
      )}
      {(journey.step >= 4 && detail.privateAccess) || approved ? (
        <div className="order-status-studio-section">
          {journey.step >= 4 && detail.privateAccess && <OwnerCoverCard publicId={publicOrderId} />}
          {approved && (
            <details className="price-card approved-lyrics-disclosure">
              <summary>
                {approved.content.title} ·{' '}
                {approved.approvedAt ? 'sua letra aprovada' : 'sua letra em revisão'}
              </summary>
              <pre className="lyrics-editor">{approved.content.fullLyrics}</pre>
            </details>
          )}
        </div>
      ) : null}
    </CustomerWorkspace>
  );
}

export function OrderPlayer() {
  const { publicOrderId = '' } = useParams();
  const order = useQuery({
    queryKey: ['order', publicOrderId],
    queryFn: () => api.getOrder(publicOrderId),
    refetchInterval: (query) => (query.state.data?.order.status === 'delivered' ? false : 5000),
  });
  const coverQuery = useQuery({
    queryKey: ['cover', 'owner', publicOrderId],
    queryFn: () => api.cover(publicOrderId),
    enabled: Boolean(publicOrderId && order.data?.privateAccess),
  });

  if (order.isLoading) return <Loading label="Carregando suas músicas…" />;
  if (order.isError || !order.data)
    return (
      <PageError
        message="Pedido não encontrado ou acesso inválido."
        backTo="/"
        backLabel="Voltar ao início"
      />
    );
  const ready = order.data.audio.filter((audio) => audio.status === 'completed');
  const journey = deriveOrderJourney(order.data.order.status, {
    hasApprovedLyrics: order.data.lyrics.some((lyric) => Boolean(lyric.approvedAt)),
    completedAudio: new Set(ready.map((audio) => audio.variant)).size,
  });
  if (!journey.valid || journey.kind !== 'delivered')
    return (
      <PageError
        message="As duas versões ainda não estão disponíveis para entrega."
        backTo={`/pedido/${publicOrderId}`}
        backLabel="Ver status do pedido"
      />
    );

  const approvedLyrics = latestLyrics(
    order.data.lyrics.filter((lyric) => Boolean(lyric.approvedAt)),
  );
  const story = order.data.story as
    { subjectName?: string; occasion?: string; genre?: string; mood?: string } | undefined;
  const songTitle = approvedLyrics?.content.title || story?.subjectName || 'Sua Canção';
  const cover = coverQuery.data?.cover;
  const hasCover = cover?.status === 'completed';
  const coverUrl = api.coverDownloadUrl(publicOrderId);

  const shareOnWhatsApp = () => {
    const url = window.location.href;
    const text = `Ouça a música personalizada que criamos: "${songTitle}"!\n${url}`;
    window.open(
      `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const copyOrderLink = () => {
    void navigator.clipboard.writeText(window.location.href);
    toast.success('Link do pedido copiado!');
  };

  const copyLyrics = () => {
    if (approvedLyrics?.content.fullLyrics) {
      void navigator.clipboard.writeText(approvedLyrics.content.fullLyrics);
      toast.success('Letra da música copiada!');
    }
  };

  return (
    <CustomerWorkspace step={5} complete className="delivery">
      <section className="delivery-hero-lounge" aria-label="Apresentação da música">
        <div className="vinyl-showcase">
          <div className="vinyl-disc" aria-hidden="true">
            <div className="vinyl-groove-lines" />
            <div className="vinyl-center-badge">
              <div className="vinyl-spindle-hole" />
              <span className="vinyl-badge-text">RESENHA HD</span>
            </div>
          </div>
          <div className="vinyl-sleeve">
            {hasCover ? (
              <img src={coverUrl} alt="Capa oficial do álbum" className="vinyl-cover-image" />
            ) : (
              <div className="vinyl-placeholder-artwork">
                <span className="artwork-badge">ÁLBUM EXCLUSIVO</span>
                <strong className="artwork-title">{songTitle}</strong>
                <small className="artwork-genre">{story?.genre || 'Música Original'}</small>
              </div>
            )}
          </div>
        </div>

        <div className="delivery-hero-content">
          <div className="delivery-status-indicator">
            <span className="pulse-dot" aria-hidden="true" />
            <p className="eyebrow">SUAS VERSÕES MASTERIZADAS</p>
          </div>

          <h1 className="delivery-main-heading">Ouvir e baixar</h1>
          <h2 className="delivery-song-title">{songTitle}</h2>

          <div className="delivery-tags-row">
            {story?.subjectName && (
              <span className="pill-tag">Homenagem a {story.subjectName}</span>
            )}
            {story?.occasion && <span className="pill-tag">{story.occasion}</span>}
            {(story?.genre || story?.mood) && (
              <span className="pill-tag">
                {[story?.genre, story?.mood].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>

          <div className="delivery-quick-actions">
            <button
              type="button"
              className="button secondary hero-share-whatsapp"
              onClick={shareOnWhatsApp}
            >
              <MessageCircle size={16} aria-hidden="true" /> Compartilhar no WhatsApp
            </button>

            <button
              type="button"
              className="button secondary hero-copy-link"
              onClick={copyOrderLink}
            >
              <Copy size={16} aria-hidden="true" /> Copiar link
            </button>

            {hasCover && (
              <a className="button secondary hero-download-cover" href={coverUrl} download>
                <ImageDown size={16} aria-hidden="true" /> Baixar capa HD
              </a>
            )}
          </div>
        </div>
      </section>

      <div className="delivery-studio-grid">
        <div className="delivery-tracks-column">
          <div className="column-header">
            <h3>Faixas Masterizadas</h3>
            <span className="track-count-badge">2 interpretações</span>
          </div>

          <div className="tracks-stack">
            {ready.map((audio) => (
              <article className="price-card track-player-card" key={audio.variant}>
                <div className="track-player-header">
                  <div className="track-title-wrap">
                    <span className="track-version-label">Versão {audio.variant}</span>
                    <span
                      className={`track-pill-badge ${audio.variant === 1 ? 'is-primary' : 'is-alternate'}`}
                    >
                      {audio.variant === 1 ? 'Arranjo Principal' : 'Arranjo Variação'}
                    </span>
                  </div>
                  <small className="track-characteristic">
                    {audio.variant === 1
                      ? 'Voz principal com melodia marcante e refrão envolvente'
                      : 'Interpretação intimista com arranjo alternativo'}
                  </small>
                </div>

                <div className="audio-player-wrapper">
                  <audio
                    controls
                    preload="none"
                    src={api.downloadUrl(publicOrderId, audio.variant)}
                  />
                </div>

                <div className="track-player-actions">
                  <a
                    className="button secondary track-download-button"
                    href={api.downloadUrl(publicOrderId, audio.variant)}
                    download
                  >
                    <Download size={15} aria-hidden="true" /> Baixar versão {audio.variant}
                  </a>
                </div>
              </article>
            ))}
          </div>

          {order.data.privateAccess && <RevisionRequest publicId={publicOrderId} />}
        </div>

        <div className="delivery-sidebar-column">
          {approvedLyrics?.content.fullLyrics && (
            <section className="lyrics-display-card" aria-labelledby="lyrics-display-title">
              <div className="lyrics-display-header">
                <h3 id="lyrics-display-title">Letra Oficial</h3>
                <button
                  type="button"
                  className="button secondary small-action-btn"
                  onClick={copyLyrics}
                >
                  <Copy size={13} aria-hidden="true" /> Copiar letra
                </button>
              </div>
              <pre className="poetic-lyrics-content">{approvedLyrics.content.fullLyrics}</pre>
            </section>
          )}
        </div>
      </div>

      <div className="delivery-footer-navigation">
        <Link className="button secondary" to={`/pedido/${publicOrderId}`}>
          ← Status do pedido
        </Link>
      </div>
    </CustomerWorkspace>
  );
}
function RevisionRequest({ publicId }: { publicId: string }) {
  const [message, setMessage] = useState('');
  const client = useQueryClient();
  const navigate = useNavigate();
  const request = useMutation({
    mutationFn: () => api.requestRevision(publicId, message.trim()),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['order', publicId] });
      toast.success('Solicitação de ajuste recebida.');
      navigate(`/pedido/${publicId}`);
    },
  });
  return (
    <details className="revision-form">
      <summary>
        <div className="revision-summary-left">
          <span className="revision-summary-title">Algo precisa de ajuste?</span>
          <span className="revision-summary-desc">
            Nossa equipe avalia solicitações conforme os termos do serviço.
          </span>
        </div>
        <span className="revision-summary-toggle">Solicitar ajuste</span>
      </summary>
      {request.isSuccess ? (
        <p className="notice" role="status">
          Solicitação recebida. A equipe vai avaliar seu pedido.
        </p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (message.trim()) request.mutate();
          }}
        >
          <label className="studio-field">
            O que você gostaria de ajustar?
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={1000}
              rows={4}
              required
            />
          </label>
          {request.isError && (
            <p className="error" role="alert">
              {request.error.message}
            </p>
          )}
          <button
            type="submit"
            className="button secondary"
            disabled={request.isPending || !message.trim()}
          >
            {request.isPending ? 'Enviando…' : 'Enviar solicitação de ajuste'}
          </button>
        </form>
      )}
    </details>
  );
}
const myOrderStatusLabel = (status: unknown, approved: boolean, completedAudio: number) => {
  const journey = deriveOrderJourney(status, {
    hasApprovedLyrics: approved,
    completedAudio,
  });
  if (!journey.valid) return 'Estado inconsistente';
  if (journey.kind === 'delivered') return 'Pronta';
  if (journey.kind === 'production_failed') return 'Problema na produção';
  if (journey.kind === 'production') return 'Em produção';
  if (journey.kind === 'payment') return 'Aguardando pagamento';
  if (journey.kind === 'closed') return 'Pedido encerrado';
  return 'Em criação';
};

export function MyOrders() {
  const [ids] = useState<string[]>(() => readMyOrders());
  const details = useQueries({
    queries: ids.map((publicId) => ({
      queryKey: ['order', publicId],
      queryFn: () => api.getOrder(publicId),
      retry: false,
      staleTime: 30_000,
    })),
  });
  if (!ids.length)
    return (
      <>
        <Header hidePrimaryAction />
        <main className="delivery library-empty-stage">
          <div className="library-empty-card">
            <div className="empty-vinyl-icon" aria-hidden="true">
              <Disc3 size={48} />
            </div>
            <p className="eyebrow">MINHAS MÚSICAS</p>
            <h1>Você ainda não criou nenhuma música aqui</h1>
            <p>Os pedidos feitos neste navegador aparecem nesta página, sem cadastro.</p>
            <Link className="button primary" to="/criar">
              Criar minha música
            </Link>
          </div>
        </main>
        <Footer />
      </>
    );
  return (
    <>
      <Header />
      <main className="delivery library-page-container">
        <div className="library-page-header">
          <div>
            <p className="eyebrow">DISCOGRAFIA PESSOAL</p>
            <h1>Suas músicas neste navegador</h1>
            <p className="library-subtitle">
              Sem cadastro: em aparelho novo ou navegador limpo, a lista não acompanha.
            </p>
          </div>
          <Link className="button primary library-new-music-btn" to="/criar">
            + Criar nova música
          </Link>
        </div>

        <div className="library-discography-grid">
          {details.map((query, index) => {
            const publicId = ids[index];
            if (query.isLoading) return <Loading key={publicId} label="Carregando pedidos…" />;
            if (query.isError || !query.data)
              return (
                <div className="price-card library-card" key={publicId}>
                  <span>Acesso a uma música indisponível</span>
                  <p>
                    Disponível só neste navegador/dispositivo. Abra no aparelho onde criou ou peça
                    um novo link de acesso.
                  </p>
                  <Link className="button secondary" to={`/pedido/${publicId}`}>
                    Tentar abrir mesmo assim
                  </Link>
                </div>
              );
            const title = latestLyrics(query.data.lyrics);
            const approved = query.data.lyrics.some((lyric) => Boolean(lyric.approvedAt));
            const completedAudio = completedAudioCount(query.data.audio);
            const story = query.data.story as
              { subjectName?: string; occasion?: string; genre?: string } | undefined;
            const journey = deriveOrderJourney(query.data.order.status, {
              hasApprovedLyrics: approved,
              completedAudio,
            });
            const nextStep = !journey.valid
              ? 'Verificar pedido'
              : journey.kind === 'delivered'
                ? 'Ouvir e baixar'
                : journey.kind === 'payment'
                  ? 'Ir para o pagamento'
                  : journey.kind === 'production_failed'
                    ? 'Ver status do pedido'
                    : journey.kind === 'production'
                      ? 'Acompanhar produção'
                      : 'Continuar criação';
            const createdAt = query.data.order.createdAt
              ? new Date(query.data.order.createdAt).toLocaleDateString('pt-BR')
              : null;
            const isDelivered = journey.valid && journey.kind === 'delivered';
            const destination = isDelivered ? `/pedido/${publicId}/entrega` : `/pedido/${publicId}`;

            return (
              <article className="price-card library-card library-discography-item" key={publicId}>
                <div className="library-vinyl-badge" aria-hidden="true">
                  <div className="library-vinyl-mini-disc" />
                  <div className="library-vinyl-mini-sleeve">
                    <Music2 size={24} />
                  </div>
                </div>

                <div className="library-card-content">
                  <div className="library-item-top">
                    <span
                      className={`library-status-pill ${
                        isDelivered ? 'is-delivered' : 'is-processing'
                      }`}
                    >
                      {myOrderStatusLabel(query.data.order.status, approved, completedAudio)}
                    </span>
                    {story?.genre && <span className="library-genre-badge">{story.genre}</span>}
                  </div>

                  <h2>{title?.content.title ?? story?.subjectName ?? 'Sua música'}</h2>

                  <dl className="summary-list library-item-meta">
                    {story?.occasion && (
                      <div>
                        <dt>Ocasião</dt>
                        <dd>{story.occasion}</dd>
                      </div>
                    )}
                    {createdAt && (
                      <div>
                        <dt>Criada em</dt>
                        <dd>{createdAt}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Progresso</dt>
                      <dd>
                        {myOrderStatusLabel(query.data.order.status, approved, completedAudio)}
                      </dd>
                    </div>
                    <div>
                      <dt>Próxima ação</dt>
                      <dd>{nextStep}</dd>
                    </div>
                  </dl>

                  <div className="library-item-cta">
                    <Link
                      className={`button ${isDelivered ? 'primary' : 'secondary'}`}
                      to={destination}
                    >
                      {nextStep}
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>
      <Footer />
    </>
  );
}

export function Delivery() {
  const { deliveryToken = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const delivery = useQuery({
    queryKey: ['delivery', deliveryToken],
    queryFn: () => api.delivery(deliveryToken),
    enabled: Boolean(deliveryToken),
    refetchInterval: 5000,
  });
  const coverQuery = useQuery({
    queryKey: ['delivery-cover', deliveryToken],
    queryFn: () => api.deliveryCover(deliveryToken),
    enabled: Boolean(deliveryToken),
  });
  const recover = useMutation({
    mutationFn: () => api.recoverViaDelivery(deliveryToken),
    onSuccess: ({ publicId }) => {
      rememberMyOrder(publicId);
      void queryClient.invalidateQueries({ queryKey: ['delivery', deliveryToken] });
      void queryClient.invalidateQueries({ queryKey: ['order', publicId] });
      navigate(`/pedido/${publicId}`);
    },
    onError: (e) => toast.error(e.message),
  });
  if (delivery.isError) {
    return (
      <>
        <Header />
        <PageError message="Link de entrega inválido ou expirado." />
        <Footer />
      </>
    );
  }

  const cover = coverQuery.data?.cover;
  const hasCover = cover?.status === 'completed';
  const coverUrl = api.deliveryCoverDownloadUrl(deliveryToken);
  const approvedLyric = delivery.data?.lyrics[0];
  const songTitle = approvedLyric?.content.title || 'Sua Canção';

  const shareOnWhatsApp = () => {
    const text = `Ouça a música personalizada que criamos: "${songTitle}"!\n${window.location.href}`;
    window.open(
      `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const copyDeliveryLink = () => {
    void navigator.clipboard.writeText(window.location.href);
    toast.success('Link de entrega copiado!');
  };

  return (
    <>
      <Header />
      <main className="delivery delivery-page-wrapper">
        <div className="delivery-header-meta">
          <p className="eyebrow">ENTREGA PRIVADA</p>
        </div>
        {delivery.isLoading && <Loading label="Abrindo sua entrega…" />}
        {delivery.data && (
          <>
            {delivery.data.audio.length === 2 ? (
              <>
                <section className="delivery-hero-lounge" aria-label="Apresentação da música">
                  <div className="vinyl-showcase">
                    <div className="vinyl-disc" aria-hidden="true">
                      <div className="vinyl-groove-lines" />
                      <div className="vinyl-center-badge">
                        <div className="vinyl-spindle-hole" />
                        <span className="vinyl-badge-text">RESENHA HD</span>
                      </div>
                    </div>
                    <div className="vinyl-sleeve">
                      {hasCover ? (
                        <img
                          src={coverUrl}
                          alt="Capa oficial do álbum"
                          className="vinyl-cover-image"
                        />
                      ) : (
                        <div className="vinyl-placeholder-artwork">
                          <span className="artwork-badge">ÁLBUM EXCLUSIVO</span>
                          <strong className="artwork-title">{songTitle}</strong>
                          <small className="artwork-genre">Música Original</small>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="delivery-hero-content">
                    <div className="delivery-status-indicator">
                      <span className="pulse-dot" aria-hidden="true" />
                      <p className="eyebrow">ÁUDIO MASTERIZADO</p>
                    </div>

                    <h1 className="delivery-main-heading">Sua música está pronta!</h1>
                    <h2 className="delivery-song-title">{songTitle}</h2>
                    <p className="delivery-sub-notice">
                      Este link é privado. Ouça as duas versões masterizadas e faça o download
                      abaixo.
                    </p>

                    <div className="delivery-quick-actions">
                      <button
                        type="button"
                        className="button secondary hero-share-whatsapp"
                        onClick={shareOnWhatsApp}
                      >
                        <MessageCircle size={16} aria-hidden="true" /> Compartilhar no WhatsApp
                      </button>

                      <button
                        type="button"
                        className="button secondary hero-copy-link"
                        onClick={copyDeliveryLink}
                      >
                        <Copy size={16} aria-hidden="true" /> Copiar link
                      </button>

                      {hasCover && (
                        <a
                          className="button secondary hero-download-cover"
                          href={coverUrl}
                          download
                        >
                          <ImageDown size={16} aria-hidden="true" /> Baixar capa HD
                        </a>
                      )}
                    </div>
                  </div>
                </section>

                <div className="delivery-studio-grid">
                  <div className="delivery-tracks-column">
                    <div className="column-header">
                      <h3>Versões da Música</h3>
                      <span className="track-count-badge">2 faixas</span>
                    </div>

                    <div className="tracks-stack">
                      {delivery.data.audio.map((audio) => (
                        <article className="price-card track-player-card" key={audio.variant}>
                          <div className="track-player-header">
                            <div className="track-title-wrap">
                              <span className="track-version-label">Versão {audio.variant}</span>
                              <span
                                className={`track-pill-badge ${audio.variant === 1 ? 'is-primary' : 'is-alternate'}`}
                              >
                                {audio.variant === 1 ? 'Principal' : 'Variação'}
                              </span>
                            </div>
                          </div>
                          <div className="audio-player-wrapper">
                            <audio
                              controls
                              src={api.deliveryDownloadUrl(deliveryToken, audio.variant)}
                            />
                          </div>
                          <div className="track-player-actions">
                            <a
                              className="button secondary track-download-button"
                              href={api.deliveryDownloadUrl(deliveryToken, audio.variant)}
                              download
                            >
                              <Download size={15} aria-hidden="true" /> Baixar versão{' '}
                              {audio.variant}
                            </a>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>

                  <div className="delivery-sidebar-column">
                    {approvedLyric && (
                      <section
                        className="lyrics-display-card"
                        aria-labelledby="delivery-lyrics-title"
                      >
                        <div className="lyrics-display-header">
                          <h3 id="delivery-lyrics-title">Letra Aprovada</h3>
                          <button
                            type="button"
                            className="button secondary small-action-btn"
                            onClick={() => {
                              void navigator.clipboard.writeText(approvedLyric.content.fullLyrics);
                              toast.success('Letra copiada!');
                            }}
                          >
                            <Copy size={13} aria-hidden="true" /> Copiar
                          </button>
                        </div>
                        <pre className="poetic-lyrics-content">
                          {approvedLyric.content.fullLyrics}
                        </pre>
                      </section>
                    )}

                    <DeliveryCoverCard token={deliveryToken} />
                  </div>
                </div>
              </>
            ) : (
              <div className="delivery-incomplete-card">
                <h1>As versões ainda não estão prontas</h1>
                <p className="error" role="alert">
                  A entrega está incompleta. Acompanhe o pedido para receber as duas versões.
                </p>
              </div>
            )}

            <div className="delivery-recover-bar">
              <button
                type="button"
                className="button secondary"
                disabled={recover.isPending}
                onClick={() => recover.mutate()}
              >
                {recover.isPending ? 'Liberando…' : 'Acompanhar pedido neste navegador'}
              </button>
            </div>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
export function Legal({ kind }: { kind: 'privacidade' | 'termos' }) {
  const privacy = kind === 'privacidade';
  return (
    <>
      <Header />
      <main className="form-page">
        <h1>{privacy ? 'Privacidade' : 'Termos de uso'}</h1>
        <p className="error">
          Este conteúdo é informativo no MVP e deve passar por revisão jurídica antes da produção.
        </p>
        {privacy ? (
          <>
            <h2>Dados e finalidade</h2>
            <p>
              Usamos história, e-mail e preferências para criar, entregar e dar suporte à música. A
              letra, o áudio e a capa podem ser processados por fornecedores de inteligência
              artificial e infraestrutura contratados para essa finalidade.
            </p>
            <h2>Foto de referência</h2>
            <p>
              O envio é opcional e exige que você tenha autorização das pessoas retratadas. A foto é
              normalizada, mantida de forma privada e apagada ao fim da tentativa ou, em caso de
              abandono, em até sete dias. A capa criada e registros financeiros seguem a retenção do
              pedido.
            </p>
            <h2>Seus direitos</h2>
            <p>
              Antes do lançamento, o canal de privacidade e os prazos para acesso, correção,
              oposição e exclusão deverão ser aprovados juridicamente. Para solicitar esses direitos
              no piloto, responda ao e-mail privado de entrega; a operação deve confirmar que essa
              caixa é monitorada antes de aceitar pedidos. Solicitações de exclusão não apagam
              registros que precisem ser mantidos por obrigação legal.
            </p>
          </>
        ) : (
          <>
            <h2>Conteúdo criado com IA</h2>
            <p>
              Letra, áudio e capa são produzidos com inteligência artificial a partir do contexto
              fornecido. O resultado pode conter imprecisões e não deve imitar artista, celebridade
              ou pessoa sem autorização.
            </p>
            <h2>Direitos e responsabilidades</h2>
            <p>
              Você declara ter direito de usar as histórias e fotos enviadas e deve revisar a letra
              antes do pagamento. Não envie material ilegal, abusivo, íntimo ou envolvendo menores
              sem a política e as autorizações aplicáveis.
            </p>
            <h2>Entrega e ajustes</h2>
            <p>
              O pedido inclui duas versões de áudio, uma capa opcional e uma regeneração de capa.
              Prazos, reembolso, suporte e licença final ainda dependem de aprovação
              jurídico-comercial antes da produção.
            </p>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
export function PageError({
  message,
  backTo = '/',
  backLabel = 'Voltar ao início',
}: {
  message: string;
  backTo?: string;
  backLabel?: string;
}) {
  return (
    <main className="form-page">
      <h1>Não foi possível abrir esta página</h1>
      <p className="error" role="alert">
        {message}
      </p>
      <Link className="button secondary" to={backTo}>
        {backLabel}
      </Link>
    </main>
  );
}
export function NotFound() {
  return <PageError message="A página que você procura não existe." />;
}
