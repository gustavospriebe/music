import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { api, visitorId } from '../api';
import { Footer, Header, Loading, ProductionRail } from '../components';
import { DeliveryCoverCard, OwnerCoverCard } from '../cover-card';
import { clearDraft, readDraft, useDraft } from '../hooks/use-draft';
import { readMyOrders, rememberMyOrder } from '../my-orders';
import {
  completedAudioCount,
  deriveOrderJourney,
  isOrderStatus,
  latestLyrics,
} from '../order-journey';
import { clearCreationKey, creationKey } from '../submission-attempt';
import {
  formatMoney,
  type Lyrics,
  type LyricsContent,
  type OrderDetail,
  type Story,
} from '../types';

const storySchema = z.object({
  buyerName: z.string().min(2, 'Informe seu nome'),
  buyerEmail: z.string().email('Informe um e-mail válido'),
  subjectName: z.string().min(2, 'Informe o nome da homenagem'),
  occasion: z.string().min(2, 'Conte a ocasião'),
  factsText: z
    .string()
    .min(8, 'Escreva pelo menos 2 lembranças, uma em cada linha')
    .refine(
      (value) =>
        value
          .split('\n')
          .map((item) => item.trim())
          .filter((item) => item.length >= 2).length >= 2,
      'Escreva pelo menos 2 lembranças, uma em cada linha',
    ),
  genre: z.string().min(1),
  mood: z.string().min(1),
  termsAccepted: z.boolean().refine((value) => value, 'Aceite os termos para continuar'),
  marketingAccepted: z.boolean(),
  roastLevel: z.enum(['light', 'medium', 'strong']),
  voice: z.enum(['either', 'male', 'female', 'duet']),
});
type StoryForm = z.infer<typeof storySchema>;
const defaults: StoryForm = {
  buyerName: '',
  buyerEmail: '',
  subjectName: '',
  occasion: '',
  factsText: '',
  genre: 'pagode',
  mood: 'animado',
  termsAccepted: false,
  marketingAccepted: false,
  roastLevel: 'light',
  voice: 'either',
};
export function CreateStory() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => {
    api.sendBeacon('form_started');
  }, []);
  const form = useForm<StoryForm>({
    resolver: zodResolver(storySchema),
    defaultValues: { ...defaults, ...readDraft() },
  });
  const values = useWatch({ control: form.control });
  const saveStatus = useDraft(values);
  const submit = useMutation({
    mutationFn: async (data: StoryForm) => {
      const created = await api.createOrder('friend_roast', creationKey(), visitorId());
      rememberOrder(created.publicId);
      const facts = data.factsText
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
      const story: Story = {
        productType: 'friend_roast',
        buyerName: data.buyerName,
        buyerEmail: data.buyerEmail,
        subjectName: data.subjectName,
        occasion: data.occasion,
        genre: data.genre,
        mood: data.mood,
        voice: data.voice,
        facts,
        relationship: 'Amigo(a) da turma',
        traits: [facts[0]?.slice(0, 200) ?? 'Da resenha'],
        biggestStory: facts[0]?.slice(0, 500) ?? 'Sempre chega cantando',
        roastLevel: data.roastLevel,
        safetyConfirmed: true,
        termsAccepted: data.termsAccepted,
        marketingAccepted: data.marketingAccepted,
      };
      await api.saveStory(created.publicId, story);
      return created.publicId;
    },
    onSuccess: (publicId) => {
      void queryClient.invalidateQueries({ queryKey: ['order', publicId] });
      clearCreationKey();
      clearDraft();
      api.sendBeacon('form_completed');
      toast.success('História salva. Vamos criar sua letra!');
      navigate(`/criar/letra?pedido=${encodeURIComponent(publicId)}`);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a história.'),
  });
  const field = (
    name: keyof StoryForm,
    label: string,
    extra?: React.InputHTMLAttributes<HTMLInputElement>,
  ) => (
    <label>
      {label}
      <input
        {...form.register(name)}
        {...extra}
        aria-label={label}
        aria-invalid={form.formState.errors[name] ? 'true' : undefined}
        aria-describedby={form.formState.errors[name] ? `${name}-error` : undefined}
      />
      {form.formState.errors[name] && (
        <small id={`${name}-error`} className="error">
          {form.formState.errors[name]?.message}
        </small>
      )}
    </label>
  );
  return (
    <>
      <Header />
      <main className="form-page">
        <p className="eyebrow">CRIE SUA MÚSICA</p>
        <h1>Conte a resenha em seu ritmo.</h1>
        <p className="sub">
          Etapa 1 de 6 ·{' '}
          <span role="status">
            {saveStatus === 'saving'
              ? 'Salvando rascunho…'
              : saveStatus === 'saved'
                ? 'Rascunho salvo'
                : saveStatus === 'error'
                  ? 'Não foi possível salvar o rascunho'
                  : ''}
          </span>
        </p>
        <div className="progress" aria-label="Progresso do formulário">
          <i />
        </div>
        <form className="form-grid" onSubmit={form.handleSubmit((data) => submit.mutate(data))}>
          {field('subjectName', 'Para quem é a música?')} {field('occasion', 'Qual é a ocasião?')}{' '}
          {field('buyerName', 'Seu nome')} {field('buyerEmail', 'Seu e-mail', { type: 'email' })}
          <label className="wide">
            Histórias, apelidos e bordões
            <textarea
              {...form.register('factsText')}
              placeholder="Pelo menos 2 lembranças, uma em cada linha"
              aria-invalid={form.formState.errors.factsText ? 'true' : undefined}
              aria-describedby={form.formState.errors.factsText ? 'factsText-error' : undefined}
            />
            {form.formState.errors.factsText && (
              <small id="factsText-error" className="error">
                {form.formState.errors.factsText.message}
              </small>
            )}
          </label>
          <label>
            Humor da zoeira
            <select {...form.register('roastLevel')}>
              <option value="light">Leve</option>
              <option value="medium">Médio</option>
              <option value="strong">Forte, sem humilhar</option>
            </select>
          </label>
          <label>
            Gênero musical
            <select {...form.register('genre')}>
              <option value="pagode">Pagode</option>
              <option value="sertanejo">Sertanejo</option>
              <option value="funk">Funk</option>
              <option value="pop">Pop</option>
            </select>
          </label>
          <label>
            Clima
            <select {...form.register('mood')}>
              <option value="animado">Animado</option>
              <option value="emocionante">Emocionante</option>
              <option value="engraçado">Engraçado</option>
            </select>
          </label>
          <label>
            Voz
            <select {...form.register('voice')}>
              <option value="either">Tanto faz</option>
              <option value="male">Masculina</option>
              <option value="female">Feminina</option>
              <option value="duet">Dueto</option>
            </select>
          </label>
          <label className="check wide">
            <input
              type="checkbox"
              {...form.register('termsAccepted')}
              aria-invalid={form.formState.errors.termsAccepted ? 'true' : undefined}
              aria-describedby={
                form.formState.errors.termsAccepted ? 'termsAccepted-error' : undefined
              }
            />{' '}
            Li e aceito os <Link to="/termos">termos</Link> e a{' '}
            <Link to="/privacidade">privacidade</Link>.
            {form.formState.errors.termsAccepted && (
              <small id="termsAccepted-error" className="error">
                {form.formState.errors.termsAccepted.message}
              </small>
            )}
          </label>
          <label className="check wide">
            <input type="checkbox" {...form.register('marketingAccepted')} /> Quero receber
            novidades (opcional).
          </label>
          <button type="submit" className="button primary wide" disabled={submit.isPending}>
            {submit.isPending ? 'Salvando…' : 'Gerar minha letra'} <ArrowRight size={17} />
          </button>
        </form>
      </main>
      <Footer />
    </>
  );
}

function orderIdFromSearch() {
  const param = new URLSearchParams(window.location.search).get('pedido');
  return param ?? window.sessionStorage.getItem('resenha:lastOrder') ?? '';
}
function rememberOrder(publicId: string) {
  try {
    window.sessionStorage.setItem('resenha:lastOrder', publicId);
  } catch {
    // modo privado: segue só com localStorage
  }
  rememberMyOrder(publicId);
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
    mutationFn: () => api.generateLyrics(publicId),
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
  return (
    <LyricsReviewContent
      detail={order.data}
      generating={generate.isPending}
      operation={edit.isPending ? 'saving' : approve.isPending ? 'approving' : null}
      saved={edit.isSuccess}
      mutationError={generate.error ?? edit.error ?? approve.error}
      onGenerate={() => generate.mutate()}
      onSave={(number, content) => {
        approve.reset();
        edit.mutate({ number, content });
      }}
      onApprove={(number, content) => {
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
  onSave,
  onApprove,
}: {
  detail: OrderDetail;
  generating: boolean;
  operation: 'saving' | 'approving' | null;
  saved: boolean;
  mutationError: Error | null;
  onGenerate: () => void;
  onSave: (number: number, content: LyricsContent) => void;
  onApprove: (number: number, content?: LyricsContent) => void;
}) {
  const status = detail.order.status;
  if (!isOrderStatus(status))
    return <PageError message="O pedido está com um estado inconsistente." />;
  const lyric = latestLyrics(detail.lyrics);
  const approved = detail.lyrics.some((version) => Boolean(version.approvedAt));
  if (status === 'lyrics_generating') return <LyricsGeneratingView />;
  const canGenerate = status === 'story_completed' || (status === 'failed' && !approved);
  if (status === 'lyrics_ready' && !lyric)
    return <PageError message="O pedido está com um estado inconsistente: a letra está ausente." />;
  if (!canGenerate && status !== 'lyrics_ready')
    return <PageError message="A revisão da letra não está disponível nesta etapa." />;
  return (
    <LyricsWorkspace
      status={status}
      lyric={lyric}
      canGenerate={canGenerate}
      generating={generating}
      operation={operation}
      saved={saved}
      mutationError={mutationError}
      onGenerate={onGenerate}
      onSave={onSave}
      onApprove={onApprove}
    />
  );
}

function LyricsGeneratingView() {
  return (
    <>
      <Header />
      <main className="review">
        <p className="eyebrow">ETAPA 2 DE 5 · LETRA</p>
        <h1>Criando sua letra</h1>
        <p role="status">
          Criando sua letra. A criação continua mesmo se você recarregar esta página.
        </p>
      </main>
      <Footer />
    </>
  );
}

function LyricsWorkspace({
  status,
  lyric,
  canGenerate,
  generating,
  operation,
  saved,
  mutationError,
  onGenerate,
  onSave,
  onApprove,
}: {
  status: string;
  lyric: Lyrics | undefined;
  canGenerate: boolean;
  generating: boolean;
  operation: 'saving' | 'approving' | null;
  saved: boolean;
  mutationError: Error | null;
  onGenerate: () => void;
  onSave: (number: number, content: LyricsContent) => void;
  onApprove: (number: number, content?: LyricsContent) => void;
}) {
  return (
    <>
      <Header />
      <main className="review">
        <p className="eyebrow">ETAPA 2 DE 5 · LETRA</p>
        <h1>{lyric ? lyric.content.title : 'Sua letra, do seu jeito.'}</h1>
        {mutationError && (
          <p className="error" role="alert">
            {mutationError.message}
          </p>
        )}
        {canGenerate && (
          <LyricsGenerateAction status={status} pending={generating} onGenerate={onGenerate} />
        )}
        {!canGenerate && lyric && (
          <LyricEditor
            key={lyric.number}
            lyric={lyric}
            onSave={(content) => onSave(lyric.number, content)}
            onApprove={(content) => onApprove(lyric.number, content)}
            operation={operation}
            saved={saved}
          />
        )}
      </main>
      <Footer />
    </>
  );
}

function LyricsGenerateAction({
  status,
  pending,
  onGenerate,
}: {
  status: string;
  pending: boolean;
  onGenerate: () => void;
}) {
  return (
    <>
      {status === 'failed' && <p>A letra não foi concluída. Sua história continua salva.</p>}
      <button type="button" className="button primary" onClick={onGenerate} disabled={pending}>
        {pending
          ? 'Tentando gerar novamente'
          : status === 'failed'
            ? 'Tentar gerar novamente'
            : 'Criar letra agora'}
      </button>
    </>
  );
}
function LyricEditor({
  lyric,
  onSave,
  onApprove,
  operation,
  saved,
}: {
  lyric: { content: LyricsContent };
  onSave: (content: LyricsContent) => void;
  onApprove: (content?: LyricsContent) => void;
  operation: 'saving' | 'approving' | null;
  saved: boolean;
}) {
  const form = useForm<{ fullLyrics: string }>({
    defaultValues: { fullLyrics: lyric.content.fullLyrics },
  });
  const current = (): LyricsContent => ({
    ...lyric.content,
    fullLyrics: form.getValues().fullLyrics,
  });
  return (
    <form
      onSubmit={form.handleSubmit((v) => onSave({ ...lyric.content, fullLyrics: v.fullLyrics }))}
    >
      <p>Edite qualquer verso; cada salvamento cria uma nova versão histórica.</p>
      {saved && <p role="status">Nova versão salva.</p>}
      <textarea
        className="lyrics-editor"
        aria-label="Letra da música"
        {...form.register('fullLyrics')}
      />
      <div className="actions">
        <button type="submit" className="button secondary" disabled={operation !== null}>
          {operation === 'saving'
            ? 'Salvando versão'
            : operation === 'approving'
              ? 'Aprovação em andamento'
              : 'Salvar nova versão'}
        </button>
        <button
          type="button"
          className="button primary"
          disabled={operation !== null}
          onClick={() =>
            onApprove(
              form.getValues().fullLyrics !== lyric.content.fullLyrics ? current() : undefined,
            )
          }
        >
          {operation === 'approving'
            ? 'Aprovando letra'
            : operation === 'saving'
              ? 'Salvamento em andamento'
              : 'Aprovar letra'}{' '}
          <CheckCircle2 size={17} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}

export function Checkout() {
  const nav = useNavigate();
  const [publicId] = useState(orderIdFromSearch);
  const order = useQuery({
    queryKey: ['order', publicId],
    queryFn: () => api.getOrder(publicId),
    enabled: Boolean(publicId),
  });
  const payment = useMutation({
    mutationFn: async () => {
      const checkout = await api.checkout(publicId);
      if (checkout.dev) {
        await api.approveDevPayment(publicId);
        nav(`/pedido/${publicId}`);
        return;
      }
      window.location.href = checkout.checkoutUrl;
    },
    onError: (e) => toast.error(e.message),
  });
  if (!publicId) return <Navigate to="/criar" replace />;
  if (order.isLoading) return <Loading label="Carregando seu pedido…" />;
  if (order.isError || !order.data)
    return <PageError message="Não foi possível abrir seu pedido para pagamento." />;
  return (
    <>
      <Header />
      <main className="checkout">
        <p className="eyebrow">CHECKOUT · MERCADO PAGO</p>
        <h1>Falta pouco para dar play.</h1>
        <div className="price-card">
          <span>Música da Resenha</span>
          <b>{formatMoney(order.data.order.priceCents)}</b>
          <small>Letra, duas versões e página privada.</small>
          <button
            className="button primary"
            disabled={payment.isPending}
            onClick={() => payment.mutate()}
          >
            {payment.isPending ? 'Confirmando pagamento' : 'Pagar com Mercado Pago'}
          </button>
          {payment.isPending && <span role="status">Confirmando pagamento</span>}
        </div>
      </main>
      <Footer />
    </>
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
  return <OrderStatusContent publicOrderId={publicOrderId} detail={order.data} />;
}

const orderJourneyAction = (action: string | null | undefined, publicOrderId: string) => {
  const actions: Record<string, { label: string; to: string }> = {
    continue_story: { label: 'Continuar história', to: '/criar' },
    open_lyrics: { label: 'Acompanhar letra', to: `/criar/letra?pedido=${publicOrderId}` },
    review_lyrics: { label: 'Revisar letra', to: `/criar/letra?pedido=${publicOrderId}` },
    retry_lyrics: { label: 'Tentar gerar novamente', to: `/criar/letra?pedido=${publicOrderId}` },
    checkout: { label: 'Ir para o pagamento', to: `/criar/checkout?pedido=${publicOrderId}` },
    listen: { label: 'Ouvir versões', to: `/pedido/${publicOrderId}/entrega` },
  };
  return action ? (actions[action] ?? null) : null;
};

function OrderStatusContent({
  publicOrderId,
  detail,
}: {
  publicOrderId: string;
  detail: OrderDetail;
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
  const action = orderJourneyAction(journey.action, publicOrderId);
  return (
    <>
      <Header />
      <main className="delivery">
        <p className="eyebrow">PEDIDO PRIVADO</p>
        <h1>{journey.heading}</h1>
        <p>{journey.message}</p>
        {action && (
          <Link className="button primary" to={action.to}>
            {action.label}
          </Link>
        )}
        <ProductionRail step={journey.step} complete={journey.complete} />
        {journey.step >= 4 && detail.privateAccess && <OwnerCoverCard publicId={publicOrderId} />}
        {approved && (
          <details className="price-card" open={!journey.complete}>
            <summary>
              {approved.content.title} ·{' '}
              {approved.approvedAt ? 'sua letra aprovada' : 'sua letra em revisão'}
            </summary>
            <pre className="lyrics-editor">{approved.content.fullLyrics}</pre>
          </details>
        )}
      </main>
      <Footer />
    </>
  );
}

export function OrderPlayer() {
  const { publicOrderId = '' } = useParams();
  const order = useQuery({
    queryKey: ['order', publicOrderId],
    queryFn: () => api.getOrder(publicOrderId),
    refetchInterval: (query) => (query.state.data?.order.status === 'delivered' ? false : 5000),
  });
  if (order.isLoading) return <Loading label="Carregando suas músicas…" />;
  if (order.isError || !order.data)
    return <PageError message="Pedido não encontrado ou acesso inválido." />;
  const ready = order.data.audio.filter((audio) => audio.status === 'completed');
  const journey = deriveOrderJourney(order.data.order.status, {
    hasApprovedLyrics: order.data.lyrics.some((lyric) => Boolean(lyric.approvedAt)),
    completedAudio: new Set(ready.map((audio) => audio.variant)).size,
  });
  if (!journey.valid || journey.kind !== 'delivered')
    return <PageError message="As duas versões ainda não estão disponíveis para entrega." />;
  return (
    <>
      <Header />
      <main className="delivery">
        <p className="eyebrow">SUAS VERSÕES</p>
        <h1>Ouvir e baixar</h1>
        {ready.map((audio) => (
          <div className="price-card" key={audio.variant}>
            <span>Versão {audio.variant}</span>
            <audio controls preload="none" src={api.downloadUrl(publicOrderId, audio.variant)} />
            <a
              className="button secondary"
              href={api.downloadUrl(publicOrderId, audio.variant)}
              download
            >
              Baixar versão {audio.variant}
            </a>
          </div>
        ))}
        {order.data.privateAccess && <OwnerCoverCard publicId={publicOrderId} />}
        <Link className="button secondary" to={`/pedido/${publicOrderId}`}>
          ← Status do pedido
        </Link>
      </main>
      <Footer />
    </>
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
        <main className="delivery">
          <p className="eyebrow">MINHAS MÚSICAS</p>
          <h1>Você ainda não criou nenhuma música aqui</h1>
          <p>Os pedidos feitos neste navegador aparecem nesta página, sem cadastro.</p>
          <Link className="button primary" to="/criar">
            Criar minha música
          </Link>
        </main>
        <Footer />
      </>
    );
  return (
    <>
      <Header />
      <main className="delivery">
        <p className="eyebrow">MINHAS MÚSICAS</p>
        <h1>Suas músicas neste navegador</h1>
        <p>Sem cadastro: em aparelho novo ou navegador limpo, a lista não acompanha.</p>
        {details.map((query, index) => {
          const publicId = ids[index];
          if (query.isLoading) return <Loading key={publicId} label="Carregando pedidos…" />;
          if (query.isError || !query.data)
            return (
              <div className="price-card" key={publicId}>
                <span>Pedido {publicId}</span>
                <p>
                  Disponível só neste navegador/dispositivo. Abra no aparelho onde criou ou peça um
                  novo link de acesso.
                </p>
                <Link className="button secondary" to={`/pedido/${publicId}`}>
                  Tentar abrir mesmo assim
                </Link>
              </div>
            );
          const title = latestLyrics(query.data.lyrics);
          const approved = query.data.lyrics.some((lyric) => Boolean(lyric.approvedAt));
          const completedAudio = completedAudioCount(query.data.audio);
          return (
            <div className="price-card" key={publicId}>
              <span>{title?.content.title ?? `Pedido ${publicId}`}</span>
              <p>{myOrderStatusLabel(query.data.order.status, approved, completedAudio)}</p>
              <Link className="button secondary" to={`/pedido/${publicId}`}>
                Ver pedido
              </Link>
            </div>
          );
        })}
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
  return (
    <>
      <Header />
      <main className="delivery">
        <p className="eyebrow">ENTREGA PRIVADA</p>
        {delivery.isLoading && <Loading label="Abrindo sua entrega…" />}
        {delivery.isError && <PageError message="Link de entrega inválido ou expirado." />}
        {delivery.data && (
          <>
            {delivery.data.audio.length === 2 ? (
              <>
                <h1>Sua música está pronta!</h1>
                <p>Este link é privado. Ouça e baixe as duas versões abaixo.</p>
                {delivery.data.audio.map((audio) => (
                  <div className="price-card" key={audio.variant}>
                    <span>Versão {audio.variant}</span>
                    <audio controls src={api.deliveryDownloadUrl(deliveryToken, audio.variant)} />
                    <a
                      className="button secondary"
                      href={api.deliveryDownloadUrl(deliveryToken, audio.variant)}
                      download
                    >
                      Baixar versão {audio.variant}
                    </a>
                  </div>
                ))}
                {delivery.data.lyrics[0] && (
                  <details>
                    <summary>Ver letra aprovada</summary>
                    <pre className="lyrics-editor">
                      {delivery.data.lyrics[0].content.fullLyrics}
                    </pre>
                  </details>
                )}
                <DeliveryCoverCard token={deliveryToken} />
              </>
            ) : (
              <>
                <h1>As versões ainda não estão prontas</h1>
                <p className="error" role="alert">
                  A entrega está incompleta. Acompanhe o pedido para receber as duas versões.
                </p>
              </>
            )}
            <button
              type="button"
              className="button secondary"
              disabled={recover.isPending}
              onClick={() => recover.mutate()}
            >
              {recover.isPending ? 'Liberando…' : 'Acompanhar pedido neste navegador'}
            </button>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
export function Legal({ kind }: { kind: 'privacidade' | 'termos' }) {
  return (
    <>
      <Header />
      <main className="form-page">
        <h1>{kind === 'privacidade' ? 'Privacidade' : 'Termos de uso'}</h1>
        <p>
          Este conteúdo é informativo no MVP e deve passar por revisão jurídica antes da produção.
        </p>
        <p>Usamos seus dados apenas para criar, entregar e dar suporte à música solicitada.</p>
      </main>
      <Footer />
    </>
  );
}
export function PageError({ message }: { message: string }) {
  return (
    <main className="form-page">
      <h1>Não foi possível abrir esta página</h1>
      <p className="error" role="alert">
        {message}
      </p>
      <Link className="button secondary" to="/">
        Voltar ao início
      </Link>
    </main>
  );
}
export function NotFound() {
  return <PageError message="A página que você procura não existe." />;
}
