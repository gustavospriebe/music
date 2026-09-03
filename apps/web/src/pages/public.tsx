import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Music } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { api } from '../api';
import { Footer, Header, Loading } from '../components';
import { clearDraft, readDraft, useDraft } from '../hooks/use-draft';
import { formatMoney, type LyricsContent, type Story } from '../types';

const storySchema = z.object({
  buyerName: z.string().min(2, 'Informe seu nome'),
  buyerEmail: z.string().email('Informe um e-mail válido'),
  subjectName: z.string().min(2, 'Informe o nome da homenagem'),
  occasion: z.string().min(2, 'Conte a ocasião'),
  factsText: z
    .string()
    .min(8, 'Conte ao menos uma história')
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
export function Landing() {
  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <p className="eyebrow">PRESENTE QUE VIRA MEMÓRIA</p>
          <h1>
            Sua história merece <em>virar refrão.</em>
          </h1>
          <p>
            Conte a resenha da turma, aprove a letra e receba duas versões privadas para celebrar.
          </p>
          <Link className="button primary" to="/criar">
            Criar minha música <ArrowRight size={17} />
          </Link>
          <div className="demo-player" aria-label="Áudio demonstrativo">
            <Music aria-hidden="true" />
            <div>
              <b>Uma resenha inesquecível</b>
              <small>Áudio demo local · não é uma história real</small>
            </div>
          </div>
        </section>
        <section className="section">
          <p className="eyebrow">COMO FUNCIONA</p>
          <h2>Da memória ao play em três passos.</h2>
          <ol className="steps">
            <li>
              <b>1. Conte a história</b>
              <span>Apelidos, fatos e o clima da celebração.</span>
            </li>
            <li>
              <b>2. Aprove a letra</b>
              <span>Edite cada verso antes do pagamento.</span>
            </li>
            <li>
              <b>3. Compartilhe</b>
              <span>Receba duas versões numa página privada.</span>
            </li>
          </ol>
        </section>
        <section className="section tinted">
          <h2>O que você recebe</h2>
          <div className="cards">
            <article className="card">
              <b>Letra personalizada</b>
              <p>Revisável antes de pagar.</p>
            </article>
            <article className="card">
              <b>2 versões</b>
              <p>Para ouvir e baixar depois da revisão.</p>
            </article>
            <article className="card">
              <b>R$ 49,90</b>
              <p>Preço do produto base; adicionais aparecem no checkout.</p>
            </article>
          </div>
        </section>
        <section className="section faq">
          <h2>Perguntas frequentes</h2>
          <details>
            <summary>Posso ver a letra antes de pagar?</summary>
            <p>Sim, você revisa e aprova a letra primeiro.</p>
          </details>
          <details>
            <summary>Os áudios demo são reais?</summary>
            <p>Não. Demonstrações locais são identificadas como demo.</p>
          </details>
        </section>
      </main>
      <Footer />
    </>
  );
}

export function CreateStory() {
  const navigate = useNavigate();
  const form = useForm<StoryForm>({
    resolver: zodResolver(storySchema),
    defaultValues: { ...defaults, ...readDraft() },
  });
  const values = useWatch({ control: form.control });
  const saveStatus = useDraft(values);
  const submit = useMutation({
    mutationFn: async (data: StoryForm) => {
      const created = await api.createOrder('friend_roast');
      sessionStorage.setItem(`access:${created.publicId}`, created.accessToken);
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
      clearDraft();
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
      <input {...form.register(name)} {...extra} />
      {form.formState.errors[name] && (
        <small className="error">{form.formState.errors[name]?.message}</small>
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
          <span aria-live="polite">
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
            />
            {form.formState.errors.factsText && (
              <small className="error">{form.formState.errors.factsText.message}</small>
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
            <input type="checkbox" {...form.register('termsAccepted')} /> Li e aceito os{' '}
            <Link to="/termos">termos</Link> e a <Link to="/privacidade">privacidade</Link>.
          </label>
          <label className="check wide">
            <input type="checkbox" {...form.register('marketingAccepted')} /> Quero receber
            novidades (opcional).
          </label>
          <button className="button primary wide" disabled={submit.isPending}>
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
  window.sessionStorage.setItem('resenha:lastOrder', publicId);
}
export function LyricsReview() {
  const navigate = useNavigate();
  const publicId = orderIdFromSearch();
  const queryClient = useQueryClient();
  const order = useQuery({
    queryKey: ['order', publicId],
    queryFn: () => api.getOrder(publicId),
    enabled: Boolean(publicId),
  });
  const generate = useMutation({
    mutationFn: () => api.generateLyrics(publicId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order', publicId] }),
    onError: (e) => toast.error(e.message),
  });
  const edit = useMutation({
    mutationFn: ({ id, content }: { id: string; content: LyricsContent }) =>
      api.editLyrics(publicId, id, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order', publicId] }),
  });
  const approve = useMutation({
    mutationFn: (id: string) => api.approveLyrics(publicId, id),
    onSuccess: () => navigate(`/criar/checkout?pedido=${publicId}`),
  });
  if (!publicId) return <Navigate to="/criar" replace />;
  if (order.isLoading) return <Loading label="Carregando sua história…" />;
  if (order.isError || !order.data)
    return <PageError message="Não foi possível abrir sua história." />;
  const lyric = order.data.lyrics[0];
  return (
    <>
      <Header />
      <main className="review">
        <p className="eyebrow">ETAPA 5 DE 6 · REVISÃO</p>
        <h1>Sua letra, do seu jeito.</h1>
        {!lyric ? (
          <button
            className="button primary"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
          >
            {generate.isPending ? 'Criando…' : 'Criar letra agora'}
          </button>
        ) : (
          <LyricEditor
            lyric={lyric}
            onSave={(content) => edit.mutate({ id: lyric.id, content })}
            onApprove={() => approve.mutate(lyric.id)}
            busy={edit.isPending || approve.isPending}
          />
        )}
      </main>
      <Footer />
    </>
  );
}
function LyricEditor({
  lyric,
  onSave,
  onApprove,
  busy,
}: {
  lyric: { content: LyricsContent };
  onSave: (content: LyricsContent) => void;
  onApprove: () => void;
  busy: boolean;
}) {
  const form = useForm<{ fullLyrics: string }>({
    defaultValues: { fullLyrics: lyric.content.fullLyrics },
  });
  return (
    <form
      onSubmit={form.handleSubmit((v) => onSave({ ...lyric.content, fullLyrics: v.fullLyrics }))}
    >
      <p>Edite qualquer verso; cada salvamento cria uma nova versão histórica.</p>
      <textarea
        className="lyrics-editor"
        aria-label="Letra da música"
        {...form.register('fullLyrics')}
      />
      <div className="actions">
        <button className="button secondary" disabled={busy}>
          Salvar nova versão
        </button>
        <button type="button" className="button primary" disabled={busy} onClick={onApprove}>
          Aprovar letra <CheckCircle2 size={17} />
        </button>
      </div>
    </form>
  );
}

export function Checkout() {
  const nav = useNavigate();
  const publicId = orderIdFromSearch();
  const payment = useMutation({
    mutationFn: async () => {
      const checkout = await api.checkout(publicId);
      if (checkout.dev) {
        await api.approveDevPayment(checkout.paymentId);
        nav(`/pedido/${publicId}`);
        return;
      }
      window.location.href = checkout.checkoutUrl;
    },
    onError: (e) => toast.error(e.message),
  });
  if (!publicId) return <Navigate to="/criar" replace />;
  return (
    <>
      <Header />
      <main className="checkout">
        <p className="eyebrow">CHECKOUT · MERCADO PAGO</p>
        <h1>Falta pouco para dar play.</h1>
        <div className="price-card">
          <span>Música da Resenha</span>
          <b>{formatMoney(4990)}</b>
          <small>Letra, duas versões e página privada.</small>
          <button
            className="button primary"
            disabled={payment.isPending}
            onClick={() => payment.mutate()}
          >
            {payment.isPending ? 'Confirmando…' : 'Pagar com Mercado Pago'}
          </button>
        </div>
      </main>
      <Footer />
    </>
  );
}

const orderStep = (status: string) =>
  ['draft', 'story_completed', 'lyrics_generating'].includes(status)
    ? 1
    : status === 'lyrics_ready'
      ? 2
      : ['lyrics_approved', 'payment_pending'].includes(status)
        ? 3
        : [
              'paid',
              'audio_queued',
              'audio_generating',
              'review_required',
              'revision_requested',
            ].includes(status)
          ? 4
          : status === 'delivered'
            ? 5
            : 1;

export function OrderStatus() {
  const { publicOrderId = '' } = useParams();
  const order = useQuery({
    queryKey: ['order', publicOrderId],
    queryFn: () => api.getOrder(publicOrderId),
    refetchInterval: 2000,
  });
  if (order.isLoading) return <Loading label="Atualizando pedido…" />;
  if (order.isError || !order.data)
    return <PageError message="Pedido não encontrado ou acesso inválido." />;
  const status = order.data.order.status;
  const step = status === 'failed' ? 4 : orderStep(status);
  const steps = ['História', 'Letra aprovada', 'Pagamento', 'Produção do áudio', 'Entrega'];
  const approved = order.data.lyrics.find((lyric) => lyric.approvedAt) ?? order.data.lyrics[0];
  return (
    <>
      <Header />
      <main className="delivery">
        <p className="eyebrow">PEDIDO PRIVADO</p>
        <h1>
          {status === 'delivered'
            ? 'Sua música está pronta!'
            : status === 'failed'
              ? 'Tivemos um problema na produção'
              : 'Sua música está sendo produzida'}
        </h1>
        <p>
          {status === 'failed'
            ? 'Nossa equipe já foi avisada e vai corrigir e entregar assim que possível.'
            : status === 'delivered'
              ? 'Ouça e baixe as duas versões no player.'
              : 'Você recebe o link de entrega assim que a produção terminar.'}
        </p>
        <ol className="steps">
          {steps.map((label, index) => (
            <li key={label}>
              <b>
                {index + 1}. {label}
              </b>
              <span>
                {step > index + 1 ? 'Concluído' : step === index + 1 ? 'Etapa atual' : 'Aguardando'}
              </span>
            </li>
          ))}
        </ol>
        {approved && (
          <details className="price-card" open={step < 5}>
            <summary>{approved.content.title} · sua letra aprovada</summary>
            <pre className="lyrics-editor">{approved.content.fullLyrics}</pre>
          </details>
        )}
        {status === 'delivered' && (
          <Link className="button primary" to={`/pedido/${publicOrderId}/entrega`}>
            Ouvir versões
          </Link>
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
    refetchInterval: 5000,
  });
  if (order.isLoading) return <Loading label="Carregando suas músicas…" />;
  if (order.isError || !order.data)
    return <PageError message="Pedido não encontrado ou acesso inválido." />;
  const ready =
    order.data.order.status === 'delivered'
      ? order.data.audio.filter((audio) => audio.assetId)
      : [];
  return (
    <>
      <Header />
      <main className="delivery">
        <p className="eyebrow">SUAS VERSÕES</p>
        <h1>{ready.length ? 'Ouvir e baixar' : 'As versões ainda estão em produção'}</h1>
        {ready.map((audio) => (
          <div className="price-card" key={audio.id}>
            <span>Versão {audio.variant}</span>
            <audio
              controls
              preload="none"
              src={api.downloadUrl(publicOrderId, audio.assetId as string)}
            />
            <a
              className="button secondary"
              href={api.downloadUrl(publicOrderId, audio.assetId as string)}
              download
            >
              Baixar versão {audio.variant}
            </a>
          </div>
        ))}
        <Link className="button secondary" to={`/pedido/${publicOrderId}`}>
          ← Status do pedido
        </Link>
      </main>
      <Footer />
    </>
  );
}
export function Delivery() {
  const { deliveryToken = '' } = useParams();
  const delivery = useQuery({
    queryKey: ['delivery', deliveryToken],
    queryFn: () => api.delivery(deliveryToken),
    enabled: Boolean(deliveryToken),
    refetchInterval: 5000,
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
            <h1>Sua música está pronta!</h1>
            <p>Este link é privado. Ouça e baixe as duas versões abaixo.</p>
            {delivery.data.audio.map((audio) => (
              <div className="price-card" key={audio.id}>
                <span>Versão {audio.variant}</span>
                {audio.assetId && (
                  <>
                    <audio controls src={api.deliveryDownloadUrl(deliveryToken, audio.assetId)} />
                    <a
                      className="button secondary"
                      href={api.deliveryDownloadUrl(deliveryToken, audio.assetId)}
                      download
                    >
                      Baixar versão {audio.variant}
                    </a>
                  </>
                )}
              </div>
            ))}
            {delivery.data.lyrics[0] && (
              <details>
                <summary>Ver letra aprovada</summary>
                <pre className="lyrics-editor">{delivery.data.lyrics[0].content.fullLyrics}</pre>
              </details>
            )}
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
