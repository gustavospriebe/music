import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type Funnel } from '../api';
import { Loading } from '../components';
import { formatMoney, formatUsd, formatUsdExact, products } from '../types';

export function AdminLogin() {
  const nav = useNavigate();
  const form = useForm<{ email: string; password: string }>();
  const login = useMutation({
    mutationFn: (v: { email: string; password: string }) => api.adminLogin(v.email, v.password),
    onSuccess: () => nav('/admin'),
    onError: (e) => toast.error(e.message),
  });
  return (
    <main className="admin login">
      <p className="eyebrow">ADMINISTRAÇÃO</p>
      <h1>Entrar</h1>
      <form onSubmit={form.handleSubmit((v) => login.mutate(v))}>
        <label>
          E-mail
          <input type="email" {...form.register('email', { required: true })} />
        </label>
        <label>
          Senha
          <input type="password" {...form.register('password', { required: true })} />
        </label>
        <button className="button primary" disabled={login.isPending}>
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
function Logout() {
  const nav = useNavigate();
  return (
    <button
      className="button secondary"
      onClick={() => void api.adminLogout().finally(() => nav('/admin/login'))}
    >
      <LogOut size={16} /> Sair
    </button>
  );
}
const visitorsOf = (funnel: Funnel, event: string): number =>
  funnel.preOrder.find((step) => step.event === event)?.visitors ?? 0;
const stepOrdersOf = (funnel: Funnel, event: string): number =>
  funnel.steps.find((step) => step.event === event)?.orders ?? 0;
export function AdminDashboard() {
  const orders = useQuery({ queryKey: ['admin', 'orders'], queryFn: () => api.adminOrders() });
  const usage = useQuery({ queryKey: ['admin', 'ai-usage'], queryFn: () => api.aiUsageSummary() });
  const funnel = useQuery({
    queryKey: ['admin', 'funnel'],
    queryFn: () => api.analyticsFunnel(30),
  });
  if (orders.isLoading || usage.isLoading) return <Loading label="Carregando indicadores…" />;
  if (orders.isError) return <AdminAuthError />;
  const items = orders.data?.items ?? [];
  const paid = items.filter((x) => ['paid', 'audio_generating', 'delivered'].includes(x.status));
  const month = usage.data?.month;
  const key = usage.data?.key;
  return (
    <main className="admin">
      <div className="admin-head">
        <div>
          <p className="eyebrow">ADMINISTRAÇÃO</p>
          <h1>Visão geral</h1>
        </div>
        <Logout />
      </div>
      <div className="cards">
        <article className="card">
          <b>{items.length}</b>
          <p>Pedidos</p>
        </article>
        <article className="card">
          <b>{paid.length}</b>
          <p>Pagos/em produção</p>
        </article>
        <article className="card">
          <b>{formatMoney(paid.reduce((sum, x) => sum + x.priceCents, 0))}</b>
          <p>Receita registrada</p>
        </article>
        <article className="card">
          <b>{month ? formatUsdExact(month.totalUsd) : '—'}</b>
          <p>
            Custo IA no mês
            {month && month.calls > 0
              ? ` · ${month.calls} chamadas · letra ${formatUsdExact(month.lyricsUsd)} · áudio ${formatUsdExact(month.audioUsd)}`
              : ''}
          </p>
        </article>
        <article className="card">
          <b>
            {funnel.data
              ? `${stepOrdersOf(funnel.data, 'delivered')} / ${stepOrdersOf(funnel.data, 'paid')}`
              : '—'}
          </b>
          <p>
            Entregues / pagos (30d)
            {funnel.data && stepOrdersOf(funnel.data, 'paid') > 0
              ? ` · ${((stepOrdersOf(funnel.data, 'delivered') / stepOrdersOf(funnel.data, 'paid')) * 100).toFixed(1)}% de entrega`
              : ''}
          </p>
        </article>
        <article className="card">
          <b>
            {usage.data ? usage.data.byDay.slice(-7).reduce((sum, d) => sum + d.blocked, 0) : '—'}
          </b>
          <p>Bloqueios do filtro (7d)</p>
        </article>
      </div>
      {usage.isError && (
        <p className="error">
          Observabilidade de custo indisponível (resumo de IA falhou); pedidos seguem normais.
        </p>
      )}
      {key && (
        <p>
          Key OpenRouter: {formatUsd(key.usage)} usados
          {key.limit !== null ? ` de ${formatUsd(key.limit)}` : ' (sem limite configurado)'}
          {key.remaining !== null ? ` · ${formatUsd(key.remaining)} restantes` : ''} ·{' '}
          {month && month.calls > 0
            ? `custo rastreado ${formatUsdExact(month.totalUsd)}`
            : 'sem custo rastreado no mês'}
        </p>
      )}
      <h2>Funil (30 dias)</h2>
      {funnel.isError && (
        <p className="error">
          Funil indisponível (resumo de analytics falhou); pedidos seguem normais.
        </p>
      )}
      {funnel.data && (
        <>
          <p>
            Visitantes: landing {visitorsOf(funnel.data, 'landing_view')} · formulário{' '}
            {visitorsOf(funnel.data, 'form_started')} · concluíram{' '}
            {visitorsOf(funnel.data, 'form_completed')}
          </p>
          {funnel.data.steps.map((step) => (
            <p key={step.event}>
              {step.event}: {step.orders} pedidos
              {step.rateFromPrevious !== null
                ? ` · ${(step.rateFromPrevious * 100).toFixed(1)}% da etapa anterior`
                : ''}
            </p>
          ))}
          <p>
            Custo por venda: {formatUsdExact(funnel.data.perSaleUsd)} ({funnel.data.salesWithCost}{' '}
            vendas com custo)
          </p>
        </>
      )}
      <Link className="button primary" to="/admin/pedidos">
        Ver pedidos
      </Link>
    </main>
  );
}
const orderStatuses = [
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
export function AdminOrders() {
  const [status, setStatus] = useState('');
  const [productType, setProductType] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (productType) params.set('productType', productType);
  if (q.trim()) params.set('q', q.trim());
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const filters = params.size ? `?${params}` : '';
  const orders = useQuery({
    queryKey: ['admin', 'orders', filters],
    queryFn: () => api.adminOrders(filters),
  });
  if (orders.isLoading) return <Loading label="Carregando pedidos…" />;
  if (orders.isError) return <AdminAuthError />;
  return (
    <main className="admin">
      <div className="admin-head">
        <div>
          <p className="eyebrow">ADMINISTRAÇÃO</p>
          <h1>Pedidos</h1>
        </div>
        <Logout />
      </div>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          orders.refetch();
        }}
      >
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos</option>
            {orderStatuses.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Produto
          <select value={productType} onChange={(event) => setProductType(event.target.value)}>
            <option value="">Todos</option>
            <option value="friend_roast">Música da Resenha</option>
            <option value="team_anthem">Hino da Pelada</option>
            <option value="emotional_tribute">Sua História em Música</option>
          </select>
        </label>
        <label>
          Buscar publicId
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="X6NUN8…" />
        </label>
        <label>
          De
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          Até
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button className="button secondary">Filtrar</button>
      </form>
      <div className="admin-table">
        {orders.data?.items.map((order) => (
          <Link key={order.id} to={`/admin/pedidos/${order.id}`}>
            <span>{order.publicId}</span>
            <span>{products[order.productType].title}</span>
            <span className="status">{order.status}</span>
            <span>{formatMoney(order.priceCents)}</span>
          </Link>
        ))}
        {!orders.data?.items.length && <p>Nenhum pedido encontrado.</p>}
      </div>
    </main>
  );
}
function AdminAuthError() {
  return (
    <main className="admin">
      <p className="error">Sessão administrativa inválida ou expirada.</p>
      <Link className="button primary" to="/admin/login">
        Ir para o login
      </Link>
    </main>
  );
}
export function AdminOrderDetail() {
  const { orderId = '' } = useParams();
  const client = useQueryClient();
  const detail = useQuery({
    queryKey: ['admin', 'order', orderId],
    queryFn: () => api.adminOrder(orderId),
  });
  const [draftLyrics, setDraftLyrics] = useState<string | null>(null);
  const invalidate = () => client.invalidateQueries({ queryKey: ['admin', 'order', orderId] });
  const retry = useMutation({
    mutationFn: (id: string) => api.retryJob(id),
    onSuccess: invalidate,
  });
  const saveLyrics = useMutation({
    mutationFn: (content: Parameters<typeof api.adminUpdateLyrics>[1]) =>
      api.adminUpdateLyrics(orderId, content),
    onSuccess: () => {
      toast.success('Nova versão aprovada da letra.');
      setDraftLyrics(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const rebuild = useMutation({
    mutationFn: () => api.adminRebuildAudio(orderId),
    onSuccess: () => {
      toast.success('Reprodução enfileirada com a letra aprovada mais recente.');
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const approveAudio = useMutation({
    mutationFn: (audioId: string) => api.adminApproveAudio(orderId, audioId),
    onSuccess: () => {
      toast.success('Áudio aprovado e pedido entregue.');
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  if (detail.isLoading) return <Loading label="Carregando pedido…" />;
  if (detail.isError) return <AdminAuthError />;
  if (!detail.data)
    return (
      <main className="admin">
        <p className="error">Pedido não encontrado.</p>
      </main>
    );
  const value = detail.data;
  const approved = value.lyrics.find((lyric) => lyric.approvedAt) ?? value.lyrics[0];
  const canRebuild = ['failed', 'review_required', 'delivered', 'audio_queued'].includes(
    value.order.status,
  );
  return (
    <main className="admin">
      <Link to="/admin/pedidos">← Pedidos</Link>
      <h1>Pedido {value.order.publicId}</h1>
      <div className="admin-columns">
        <section>
          <h2>História</h2>
          <pre>{JSON.stringify(value.story, null, 2)}</pre>
          <h2>Letra aprovada</h2>
          {approved ? (
            <>
              <p>{approved.content.title}</p>
              <textarea
                className="lyrics-editor"
                rows={8}
                value={draftLyrics ?? approved.content.fullLyrics}
                onChange={(event) => setDraftLyrics(event.target.value)}
              />
              <button
                className="button primary"
                disabled={saveLyrics.isPending || draftLyrics === null}
                onClick={() =>
                  saveLyrics.mutate({ ...approved.content, fullLyrics: draftLyrics ?? '' })
                }
              >
                {saveLyrics.isPending ? 'Salvando…' : 'Salvar nova versão aprovada'}
              </button>
            </>
          ) : (
            <p>Sem letra registrada.</p>
          )}
          <h2>Pagamento</h2>
          <p>
            {value.payments.map((x) => `${x.status} · ${formatMoney(x.amountCents)}`).join(', ') ||
              'Ainda não iniciado'}
          </p>
          <h2>Custo de IA</h2>
          <p>
            Total {formatUsdExact(value.aiCost.totalUsd)} · letra{' '}
            {formatUsdExact(value.aiCost.lyricsUsd)} · áudio {formatUsdExact(value.aiCost.audioUsd)}{' '}
            · {value.aiCost.calls} chamadas · {value.aiCost.inputTokens + value.aiCost.outputTokens}{' '}
            tokens
          </p>
          {value.aiUsage.map((row) => (
            <p key={row.id}>
              {row.kind} · {row.status} · {row.model ?? 'modelo desconhecido'} ·{' '}
              {row.inputTokens + row.outputTokens} tokens ·{' '}
              {row.costUsd ? formatUsdExact(row.costUsd) : 'custo ausente'} ·{' '}
              {row.latencyMs !== null ? `${row.latencyMs}ms` : 'sem latência'} · tentativa{' '}
              {row.attempt}
              {row.externalId && <small> · req {row.externalId}</small>}{' '}
              {row.error && <small className="error">{row.error}</small>}
            </p>
          ))}
        </section>
        <section>
          <h2>Fila</h2>
          {value.jobs.map((job) => (
            <p key={job.id}>
              {job.type}: {job.status}{' '}
              {job.lastError && <small className="error">{job.lastError}</small>}{' '}
              {job.status === 'failed' && (
                <button className="button secondary" onClick={() => retry.mutate(job.id)}>
                  Tentar novamente
                </button>
              )}
            </p>
          ))}
          <h2>Áudios</h2>
          {value.audio.filter((a) => a.assetId && a.status === 'completed').length === 0 && (
            <p>Nenhuma versão disponível ainda.</p>
          )}
          {value.audio
            .filter((a) => a.assetId && a.status === 'completed')
            .map((a) => (
              <div key={a.id} className="price-card">
                <span>Versão {a.variant}</span>
                <audio
                  controls
                  preload="none"
                  src={api.adminAssetStreamUrl(value.order.id, a.assetId as string)}
                />
                <a
                  className="button secondary"
                  href={api.adminAssetStreamUrl(value.order.id, a.assetId as string)}
                  download
                >
                  Baixar
                </a>
                {value.order.status === 'review_required' && (
                  <button
                    className="button primary"
                    disabled={approveAudio.isPending}
                    onClick={() => approveAudio.mutate(a.id)}
                  >
                    {approveAudio.isPending ? 'Entregando…' : 'Aprovar e entregar'}
                  </button>
                )}
              </div>
            ))}
          {canRebuild && (
            <button
              className="button secondary"
              disabled={rebuild.isPending}
              onClick={() => rebuild.mutate()}
            >
              {rebuild.isPending ? 'Enfileirando…' : 'Reproduzir as 2 versões com a letra atual'}
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
