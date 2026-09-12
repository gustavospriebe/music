import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  api,
  type AdminOrder,
  type AdminOrderDetail as AdminDetail,
  type AiUsageSummary,
  type Funnel,
  type FinancialEnvironmentTotals,
} from '../api';
import { Loading } from '../components';
import { formatMoney, formatUsdExact } from '../types';
import { eventPt, maskEmail, nextActionPt, orderAgePt, paymentStatusPt, statusPt } from './labels';
import { AdminShell } from './shell';
import { AdminOrderOperations, AudioVariantRecovery } from './order-recovery';
import { UnknownAiCalls } from './order-recovery';

function ConfirmAction({
  label,
  effect,
  pendingLabel,
  pending,
  onConfirm,
}: {
  label: string;
  effect: string;
  pendingLabel: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed)
    return (
      <button type="button" className="button secondary" onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  return (
    <div role="group" aria-label={`Confirmar: ${label}`}>
      <p className="sub">{effect}</p>
      <div className="actions">
        <button
          type="button"
          className="button primary"
          disabled={pending}
          onClick={() => {
            onConfirm();
            setArmed(false);
          }}
        >
          {pending ? pendingLabel : `Confirmar: ${label}`}
        </button>
        <button type="button" className="button secondary" onClick={() => setArmed(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

const storyText = (story: AdminDetail['story']): { label: string; value: string }[] => {
  if (!story) return [];
  const record = story as unknown as Record<string, unknown>;
  const pick = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.filter((item) => typeof item === 'string').join('; ');
    return '';
  };
  const rows: { label: string; value: string }[] = [];
  const push = (label: string, value: unknown) => {
    const text = pick(value);
    if (text) rows.push({ label, value: text });
  };
  push('Homenageado', record.subjectName);
  push('Ocasião', record.occasion);
  push('Gênero', record.genre);
  push('Clima', record.mood);
  push('Voz', record.voice);
  if (typeof record.buyerEmail === 'string' && record.buyerEmail)
    rows.push({ label: 'E-mail do comprador', value: maskEmail(record.buyerEmail) });
  push('Ideia original', record.brief);
  push('Histórias', record.facts);
  push('Bordões', record.catchphrases);
  return rows;
};

export function AdminLogin() {
  const nav = useNavigate();
  const client = useQueryClient();
  const form = useForm<{ email: string; password: string }>();
  const login = useMutation({
    mutationFn: (v: { email: string; password: string }) => api.adminLogin(v.email, v.password),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin'] });
      nav('/admin');
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <main className="admin login">
      <p className="eyebrow">ADMINISTRAÇÃO · OPERAÇÃO INTERNA</p>
      <h1>Entrar na operação</h1>
      <p className="sub">
        Acesso restrito à equipe. Use as credenciais do ambiente atual; em caso de bloqueio, fale
        com quem gerencia as variáveis do ambiente.
      </p>
      <form onSubmit={form.handleSubmit((v) => login.mutate(v))}>
        <label>
          E-mail
          <input
            type="email"
            autoComplete="username"
            {...form.register('email', { required: true })}
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            autoComplete="current-password"
            {...form.register('password', { required: true })}
          />
        </label>
        <button className="button primary" type="submit" disabled={login.isPending}>
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
const visitorsOf = (funnel: Funnel, event: string): number =>
  funnel.preOrder.find((step) => step.event === event)?.visitors ?? 0;
const stepOrdersOf = (funnel: Funnel, event: string): number =>
  funnel.steps.find((step) => step.event === event)?.orders ?? 0;

type OverviewAlerts = {
  failedOperationalOrders?: number;
  failed: number;
  reviewRequired: number;
  audioQueued: number;
  lyricsGenerating: number;
};

function AdminAttentionStatus({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  onRetry: () => void;
}) {
  if (loading) return <p role="status">Verificando pedidos com falha…</p>;
  if (error)
    return (
      <p className="error">
        Não foi possível carregar os pedidos com falha agora.{' '}
        <button type="button" className="link-button" onClick={onRetry}>
          Tentar novamente
        </button>
      </p>
    );
  if (empty) return <p>Nenhum pedido com falha no momento.</p>;
  return null;
}

function AdminAttentionList({ alerts, items }: { alerts: OverviewAlerts; items: AdminOrder[] }) {
  return (
    <ul className="admin-alerts">
      {(alerts.failedOperationalOrders ?? 0) > 0 && (
        <li>
          <b>{alerts.failedOperationalOrders} pedidos com falhas em etapas</b>
          <span>
            Letra, capa, áudio ou aviso de entrega precisam de atenção.{' '}
            <Link to="/admin/pedidos?attention=failures">Ver pedidos com falhas em etapas</Link>
          </span>
        </li>
      )}
      {alerts.failed > 0 && (
        <li>
          <b>{alerts.failed} com falha</b>
          <span>
            {nextActionPt('failed')} · <Link to="/admin/pedidos?status=failed">Abrir fila</Link>
          </span>
        </li>
      )}
      {alerts.reviewRequired > 0 && (
        <li>
          <b>{alerts.reviewRequired} aguardando revisão</b>
          <span>
            {nextActionPt('review_required')} ·{' '}
            <Link to="/admin/pedidos?status=review_required">Abrir revisão</Link>
          </span>
        </li>
      )}
      {alerts.audioQueued > 0 && (
        <li>
          <b>{alerts.audioQueued} com áudio na fila</b>
          <span>{nextActionPt('audio_queued')}</span>
        </li>
      )}
      {alerts.lyricsGenerating > 0 && (
        <li>
          <b>{alerts.lyricsGenerating} criando letra</b>
          <span>{nextActionPt('lyrics_generating')}</span>
        </li>
      )}
      {items.map((order) => (
        <li key={order.id}>
          <b>
            {statusPt(order.status)} · {orderAgePt(order.createdAt)}
          </b>
          <span>
            Verificar diagnóstico e ações disponíveis ·{' '}
            <Link to={`/admin/pedidos/${order.id}`}>Abrir pedido</Link>
          </span>
        </li>
      ))}
    </ul>
  );
}

function monthCostLine(month: AiUsageSummary['month'] | undefined): string {
  if (!month || month.calls <= 0) return '';
  return ` · ${month.calls} chamadas · letra ${formatUsdExact(month.lyricsUsd)} · áudio ${formatUsdExact(month.audioUsd)}`;
}

const paymentEnvironmentLabels: Record<string, string> = {
  live: 'Cobrança real',
  sandbox: 'Homologação sem cobrança',
  local: 'Teste local',
};
const paymentEnvironmentPt = (environment: string | null | undefined): string =>
  paymentEnvironmentLabels[environment ?? ''] ?? 'Ambiente desconhecido — conferir histórico';

function AdminFinancialEnvironments({ rows }: { rows: FinancialEnvironmentTotals[] }) {
  return (
    <section aria-label="Valores excluídos da receita real">
      <h2>Valores excluídos da receita real</h2>
      {rows
        .filter((row) => row.environment !== 'live')
        .map((row) => (
          <p key={row.environment}>
            {paymentEnvironmentPt(row.environment)}: {row.attempts} tentativas · {row.paid} pedidos
            com pagamento aprovado · {formatMoney(row.approvedCents)} aprovados ·{' '}
            {formatMoney(row.refundedCents)} reembolsados
          </p>
        ))}
    </section>
  );
}

function deliveryRateLine(funnel: Funnel | undefined): string {
  if (!funnel || stepOrdersOf(funnel, 'paid') <= 0) return '';
  const rate = (stepOrdersOf(funnel, 'delivered') / stepOrdersOf(funnel, 'paid')) * 100;
  return ` · ${rate.toFixed(1)}% de entrega`;
}

function AdminOverviewCards({
  totals,
  usage,
  funnel,
}: {
  totals: { orders: number; paid: number; revenueCents: number };
  usage: AiUsageSummary | undefined;
  funnel: Funnel | undefined;
}) {
  const month = usage?.month;
  const blocked = usage ? usage.byDay.slice(-7).reduce((sum, d) => sum + d.blocked, 0) : '—';
  const delivery = funnel
    ? `${stepOrdersOf(funnel, 'delivered')} / ${stepOrdersOf(funnel, 'paid')}`
    : '—';
  return (
    <div className="cards">
      <article className="card">
        <b>{totals.orders}</b>
        <p>Pedidos (total do servidor)</p>
      </article>
      <article className="card">
        <b>{totals.paid}</b>
        <p>Pedidos com pagamento real confirmado</p>
      </article>
      <article className="card">
        <b>{formatMoney(totals.revenueCents)}</b>
        <p>Receita real confirmada, descontados reembolsos</p>
      </article>
      <article className="card">
        <b>{month ? formatUsdExact(month.totalUsd) : '—'}</b>
        <p>
          Custo IA conhecido no mês, todos os pedidos (inclui homologação){monthCostLine(month)}
          {month &&
            ((month.unknownCostCalls ?? 0) > 0 || (month.estimatedCalls ?? 0) > 0) &&
            ` · ${month.estimatedCalls ?? 0} estimadas · ${month.unknownCostCalls ?? 0} sem custo conhecido`}
        </p>
      </article>
      <article className="card">
        <b>{delivery}</b>
        <p>Entregues / pagos operacionais (30d, inclui testes){deliveryRateLine(funnel)}</p>
      </article>
      <article className="card">
        <b>{blocked}</b>
        <p>Bloqueios do filtro (7d)</p>
      </article>
    </div>
  );
}

function AdminFunnel({ funnel, error }: { funnel: Funnel | undefined; error: boolean }) {
  return (
    <>
      <h2>Funil operacional (30 dias)</h2>
      <p>Inclui pedidos de teste e homologação. As etapas não representam receita real.</p>
      {error && (
        <p className="error">
          Funil indisponível (resumo de analytics falhou); pedidos seguem normais.
        </p>
      )}
      {funnel && (
        <>
          <p>
            Visitantes: landing {visitorsOf(funnel, 'landing_view')} · formulário{' '}
            {visitorsOf(funnel, 'form_started')} · concluíram {visitorsOf(funnel, 'form_completed')}
          </p>
          {funnel.steps.map((step) => (
            <p key={step.event}>
              {eventPt(step.event)}: {step.orders} pedidos
              {step.rateFromPrevious !== null
                ? ` · ${(step.rateFromPrevious * 100).toFixed(1)}% da etapa anterior`
                : ''}
            </p>
          ))}
          <p>
            Custo por entrega com pagamento real: {formatUsdExact(funnel.perSaleUsd)} (
            {funnel.salesWithCost} entregas com custo)
          </p>
        </>
      )}
    </>
  );
}

export function AdminDashboard() {
  const overview = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => api.adminOverview(),
  });
  const usage = useQuery({ queryKey: ['admin', 'ai-usage'], queryFn: () => api.aiUsageSummary() });
  const funnel = useQuery({
    queryKey: ['admin', 'funnel'],
    queryFn: () => api.analyticsFunnel(30),
  });
  const attention = useQuery({
    queryKey: ['admin', 'orders', 'attention'],
    queryFn: () => api.adminOrders('?attention=failures'),
  });
  if (overview.isLoading || usage.isLoading)
    return (
      <AdminShell section="overview" title="Visão geral">
        <Loading label="Carregando indicadores…" />
      </AdminShell>
    );
  if (overview.isError || !overview.data) return <AdminAuthError />;
  const attentionItems = (attention.data?.items ?? []).slice(0, 5);
  return (
    <AdminShell section="overview" title="Visão geral">
      <section aria-labelledby="admin-alerts-title">
        <h2 id="admin-alerts-title">Precisam de decisão</h2>
        <AdminAttentionStatus
          loading={attention.isLoading}
          error={attention.isError}
          empty={attentionItems.length === 0}
          onRetry={() => void attention.refetch()}
        />
        <AdminAttentionList alerts={overview.data.attention} items={attentionItems} />
      </section>
      {overview.data.queue && (
        <section aria-label="Fila de produção">
          <p>
            Fila: {overview.data.queue.pending} aguardando · {overview.data.queue.processing} em
            execução · {overview.data.queue.failed} com falha · {overview.data.queue.unknownCalls}{' '}
            chamadas sem resultado.
          </p>
          <p>
            Espera mais antiga:{' '}
            {overview.data.queue.oldestPendingAgeSeconds == null
              ? 'fila vazia'
              : `${Math.ceil(overview.data.queue.oldestPendingAgeSeconds / 60)} min`}{' '}
            · {overview.data.queue.expiredLeases} posses expiradas.
          </p>
        </section>
      )}
      <AdminOverviewCards totals={overview.data.totals} usage={usage.data} funnel={funnel.data} />
      <AdminFinancialEnvironments rows={overview.data.financialEnvironments ?? []} />
      {usage.isError && (
        <p className="error">
          Observabilidade de custo indisponível (resumo de IA falhou); pedidos seguem normais.
        </p>
      )}
      <AdminFunnel funnel={funnel.data} error={funnel.isError} />
      <Link className="button primary" to="/admin/pedidos">
        Ver pedidos
      </Link>
    </AdminShell>
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

function AdminOrderFilters({
  status,
  productType,
  q,
  from,
  to,
  onStatus,
  onProductType,
  onQuery,
  onFrom,
  onTo,
  onSubmit,
}: {
  status: string;
  productType: string;
  q: string;
  from: string;
  to: string;
  onStatus: (value: string) => void;
  onProductType: (value: string) => void;
  onQuery: (value: string) => void;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="form-grid admin-filters"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label>
        Status
        <select value={status} onChange={(event) => onStatus(event.target.value)}>
          <option value="">Todos</option>
          {orderStatuses.map((value) => (
            <option key={value} value={value}>
              {statusPt(value)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Produto
        <select value={productType} onChange={(event) => onProductType(event.target.value)}>
          <option value="">Todos</option>
          <option value="custom_song">Sua música original</option>
        </select>
      </label>
      <label>
        Buscar pedido
        <input
          value={q}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="referência do pedido"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label>
        De
        <input type="date" value={from} onChange={(event) => onFrom(event.target.value)} />
      </label>
      <label>
        Até
        <input type="date" value={to} onChange={(event) => onTo(event.target.value)} />
      </label>
      <button className="button secondary" type="submit">
        Filtrar
      </button>
    </form>
  );
}

function ordersStatusText(fetching: boolean, total: number): string {
  if (fetching) return 'Atualizando lista…';
  if (total === 0) return 'Nenhum pedido encontrado para os filtros atuais.';
  return `${total} pedido${total === 1 ? '' : 's'} no total.`;
}

function AdminOrderResults({
  items,
  attention,
  fetching,
  total,
  current,
  totalPages,
  onPrev,
  onNext,
}: {
  items: AdminOrder[];
  attention: boolean;
  fetching: boolean;
  total: number;
  current: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <p role="status">{ordersStatusText(fetching, total)}</p>
      <ul className="admin-table">
        {items.map((order) => (
          <li key={order.id}>
            <Link to={`/admin/pedidos/${order.id}`}>
              <span>
                <b>{order.subjectName?.trim() || 'Pedido sem homenagem'}</b>
              </span>
              <span>
                {statusPt(order.status)} · {orderAgePt(order.createdAt)}
              </span>
              <span>{attention ? 'Verificar etapa com falha' : nextActionPt(order.status)}</span>
              <span>{formatMoney(order.priceCents)}</span>
            </Link>
          </li>
        ))}
        {!items.length && !fetching && (
          <li>
            <p>Nenhum pedido encontrado. Ajuste os filtros ou volte à página 1.</p>
          </li>
        )}
      </ul>
      <nav className="actions" aria-label="Paginação de pedidos">
        <button type="button" className="button secondary" disabled={current <= 1} onClick={onPrev}>
          Página anterior
        </button>
        <span role="status">
          Página {current} de {totalPages}
        </span>
        <button
          type="button"
          className="button secondary"
          disabled={current >= totalPages}
          onClick={onNext}
        >
          Próxima página
        </button>
      </nav>
    </>
  );
}

export function AdminOrders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const attention = searchParams.get('attention') === 'failures';
  const [status, setStatus] = useState(() => searchParams.get('status') ?? '');
  const [productType, setProductType] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);
  const [committedFilters, setCommittedFilters] = useState({
    status: searchParams.get('status') ?? '',
    productType: '',
    from: '',
    to: '',
  });
  const params = new URLSearchParams();
  const trimmed = applied.trim();
  if (attention) params.set('attention', 'failures');
  if (committedFilters.status) params.set('status', committedFilters.status);
  if (committedFilters.productType) params.set('productType', committedFilters.productType);
  if (trimmed) params.set('q', trimmed);
  if (committedFilters.from) params.set('from', committedFilters.from);
  if (committedFilters.to) params.set('to', committedFilters.to);
  params.set('page', String(page));
  const filters = `?${params}`;
  const orders = useQuery({
    queryKey: [
      'admin',
      'orders',
      attention,
      committedFilters.status,
      committedFilters.productType,
      applied,
      committedFilters.from,
      committedFilters.to,
      page,
    ],
    queryFn: () => api.adminOrders(filters),
  });
  if (orders.isLoading)
    return (
      <AdminShell section="orders" title="Pedidos">
        <Loading label="Carregando pedidos…" />
      </AdminShell>
    );
  if (orders.isError) return <AdminAuthError />;
  const total = orders.data?.total ?? 0;
  const pageSize = orders.data?.pageSize ?? 30;
  const current = orders.data?.page ?? page;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <AdminShell section="orders" title="Pedidos">
      {attention && (
        <p className="notice">
          Filtro ativo: pedidos com falhas em etapas.{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('attention');
              setPage(1);
              setSearchParams(next);
            }}
          >
            Remover filtro de falhas
          </button>
        </p>
      )}
      <AdminOrderFilters
        status={status}
        productType={productType}
        q={q}
        from={from}
        to={to}
        onStatus={setStatus}
        onProductType={setProductType}
        onQuery={setQ}
        onFrom={setFrom}
        onTo={setTo}
        onSubmit={() => {
          setPage(1);
          setApplied(q);
          setCommittedFilters({ status, productType, from, to });
        }}
      />
      <AdminOrderResults
        attention={attention}
        items={orders.data?.items ?? []}
        fetching={orders.isFetching}
        total={total}
        current={current}
        totalPages={totalPages}
        onPrev={() => setPage((value) => Math.max(1, value - 1))}
        onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
      />
    </AdminShell>
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
function adminSessionExpired(error: Error | null) {
  return Boolean(error && 'status' in error && (error.status === 401 || error.status === 403));
}

function adminDetailPollingInterval(value: AdminDetail | undefined, error: Error | null) {
  if (adminSessionExpired(error) || !value) return false;
  const activeJob = value.jobs.some((job) => ['pending', 'processing'].includes(job.status));
  const automaticState = [
    'lyrics_generating',
    'payment_pending',
    'paid',
    'audio_queued',
    'audio_generating',
  ].includes(value.order.status);
  return activeJob || automaticState ? 5000 : false;
}

function adminDetailNeedsLogin(error: Error | null, value: AdminDetail | undefined) {
  return Boolean(error && (!value || adminSessionExpired(error)));
}

function AdminDetailRefreshNotice({ error }: { error: boolean }) {
  if (!error) return null;
  return (
    <p className="error" role="alert">
      Não foi possível atualizar o pedido. Os dados exibidos são da última consulta concluída.
    </p>
  );
}

function AdminLyricsSection({
  value,
  approved,
  draftLyrics,
  onDraft,
  saving,
  onSave,
  error,
  saved,
}: {
  value: AdminDetail;
  approved: AdminDetail['lyrics'][number] | undefined;
  draftLyrics: string | null;
  onDraft: (value: string | null) => void;
  saving: boolean;
  onSave: (content: Parameters<typeof api.adminUpdateLyrics>[1]) => void;
  error: string | undefined;
  saved: boolean;
}) {
  const paid = value.payments.some((payment) => payment.status === 'approved');
  const title = paid ? 'Letra aprovada' : 'Letra para revisão';
  if (!approved)
    return (
      <>
        <h2>{title}</h2>
        <p>Sem letra registrada.</p>
      </>
    );
  return (
    <>
      <h2>{title}</h2>

      <p>{approved.content.title}</p>
      <p className="sub">Versão {approved.number} · edições criam nova versão histórica.</p>
      <textarea
        className="lyrics-editor"
        rows={8}
        aria-label={paid ? 'Texto da letra aprovada' : 'Texto da letra para revisão'}
        value={draftLyrics ?? approved.content.fullLyrics}
        disabled={saving || !value.recovery?.lyrics.canEdit}
        onChange={(event) => onDraft(event.target.value)}
      />
      <button
        className="button primary"
        type="button"
        disabled={saving || draftLyrics === null || !value.recovery?.lyrics.canEdit}
        onClick={() => onSave({ ...approved.content, fullLyrics: draftLyrics ?? '' })}
      >
        {saving ? 'Salvando…' : paid ? 'Salvar nova versão aprovada' : 'Salvar letra revisada'}
      </button>
      {draftLyrics !== null && (
        <button
          className="button secondary"
          type="button"
          disabled={saving}
          onClick={() => onDraft(null)}
        >
          Descartar edição da letra
        </button>
      )}
      {!value.recovery?.lyrics.canEdit && (
        <p className="notice">
          {value.recovery?.lyrics.editBlockedReason ?? 'Edição indisponível nesta etapa.'}
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {saved && <p role="status">Nova versão da letra salva.</p>}
    </>
  );
}
export function AdminOrderDetail() {
  const { orderId = '' } = useParams();
  const client = useQueryClient();
  const detail = useQuery({
    queryKey: ['admin', 'order', orderId],
    queryFn: () => api.adminOrder(orderId),
    refetchInterval: ({ state }) => adminDetailPollingInterval(state.data, state.error),
  });
  const revoke = useMutation({
    mutationFn: () => api.revokeAccess(orderId),
    onSuccess: () => {
      toast.success('Acessos anteriores revogados.');
      void client.invalidateQueries({ queryKey: ['admin', 'order', orderId] });
    },
    onError: (error) => toast.error(error.message),
  });
  const [draftLyrics, setDraftLyrics] = useState<string | null>(null);
  const invalidate = () => client.invalidateQueries({ queryKey: ['admin', 'order', orderId] });
  const saveLyrics = useMutation({
    mutationFn: (content: Parameters<typeof api.adminUpdateLyrics>[1]) =>
      api.adminUpdateLyrics(orderId, content),
    onSuccess: () => {
      setDraftLyrics(null);
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
  if (detail.isLoading)
    return (
      <AdminShell section="orders" title="Pedido">
        <Loading label="Carregando pedido…" />
      </AdminShell>
    );
  if (adminDetailNeedsLogin(detail.error, detail.data)) return <AdminAuthError />;
  if (!detail.data)
    return (
      <AdminShell section="orders" title="Pedido">
        <p className="error">Pedido não encontrado.</p>
      </AdminShell>
    );
  const value = detail.data;
  const approved = value.lyrics.find((lyric) => lyric.approvedAt) ?? value.lyrics[0];
  const storyRows = storyText(value.story);
  const completedAudio = value.audio.filter((a) => a.fileId && a.status === 'completed');
  return (
    <AdminShell section="orders" title={`Pedido · ${statusPt(value.order.status)}`}>
      <AdminDetailRefreshNotice error={detail.isError} />
      <p className="sub">
        {orderAgePt(value.order.createdAt)} · {nextActionPt(value.order.status)} ·{' '}
        {formatMoney(value.order.priceCents)}
      </p>
      <Link to="/admin/pedidos">← Pedidos</Link>
      <AdminOrderOperations detail={value} unsavedLyrics={draftLyrics !== null} />
      <div className="admin-columns">
        <section aria-labelledby="admin-story-title">
          <h2 id="admin-story-title">História (resumo operacional)</h2>
          {storyRows.length === 0 && <p>Formulário ainda não enviado ou indisponível.</p>}
          <dl className="summary-list">
            {storyRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <AdminLyricsSection
            value={value}
            approved={approved}
            draftLyrics={draftLyrics}
            onDraft={setDraftLyrics}
            saving={saveLyrics.isPending}
            onSave={(content) => saveLyrics.mutate(content)}
            error={saveLyrics.error?.message}
            saved={saveLyrics.isSuccess}
          />
          <h2>Pagamento</h2>
          <p>
            {value.payments
              .map(
                (x) =>
                  `${paymentEnvironmentPt(x.environment)} · ${paymentStatusPt(x.status)} · ${formatMoney(x.amountCents)}`,
              )
              .join(', ') || 'Ainda não iniciado'}
          </p>
          <UnknownAiCalls detail={value} />
          <h2>Custo de IA</h2>
          <p>
            Total conhecido {formatUsdExact(value.aiCost.totalUsd)} · letra{' '}
            {formatUsdExact(value.aiCost.lyricsUsd)} · áudio {formatUsdExact(value.aiCost.audioUsd)}{' '}
            · {value.aiCost.calls} chamadas · {value.aiCost.inputTokens + value.aiCost.outputTokens}{' '}
            tokens
          </p>
          {value.aiUsage.map((row) => (
            <p key={row.id}>
              {row.kind} · {statusPt(row.status)} · {row.model ?? 'modelo desconhecido'} ·{' '}
              {row.inputTokens + row.outputTokens} tokens ·{' '}
              {row.costUsd
                ? `${formatUsdExact(row.costUsd)} (${row.costSource === 'estimated' ? 'estimado' : 'informado'})`
                : 'custo desconhecido'}{' '}
              · {row.latencyMs !== null ? `${row.latencyMs}ms` : 'sem latência'} · tentativa{' '}
              {row.attempt} {row.error && <small className="error">{row.error}</small>}
            </p>
          ))}
        </section>
        <section aria-label="Entrega e acesso">
          {value.productionHistory?.length ? (
            <>
              <h2>Histórico de produção</h2>
              <ul>
                {value.productionHistory.map((production) => (
                  <li key={production.id}>
                    Produção {production.number} · {statusPt(production.status)} ·{' '}
                    {production.provenance === 'legacy_unverified'
                      ? 'origem da letra não comprovada'
                      : `letra ${value.lyrics.find((lyric) => lyric.id === production.lyricVersionId)?.number ?? 'registrada'}`}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <h2>Solicitações de ajuste</h2>
          {value.revisionRequests?.length ? (
            <ul className="revision-requests">
              {value.revisionRequests.map((request) => (
                <li key={`${request.createdAt}-${request.message}`}>
                  <p>{request.message}</p>
                  <small>
                    {new Date(request.createdAt).toLocaleString('pt-BR')} ·{' '}
                    {request.status === 'pending' ? 'Aguardando avaliação' : request.status}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhuma solicitação registrada.</p>
          )}
          <h2>Acesso privado</h2>
          <ConfirmAction
            label="Revogar acessos anteriores"
            effect="Efeito: invalida sessões e links privados anteriores deste pedido. O cliente precisará receber um novo acesso pelo suporte."
            pendingLabel="Revogando…"
            pending={revoke.isPending}
            onConfirm={() => revoke.mutate()}
          />
          {revoke.isSuccess && (
            <p className="notice" role="status">
              Acessos anteriores revogados.
            </p>
          )}
          <h2>Áudios (faixas e conjunto)</h2>
          {completedAudio.length === 0 && <p>Nenhuma versão disponível ainda.</p>}
          {completedAudio.map((a) => (
            <div key={a.id} className="price-card">
              <span>Versão {a.variant} (uma faixa)</span>
              <audio
                controls
                preload="none"
                src={api.adminAssetStreamUrl(value.order.id, a.fileId as string)}
              />
              <a
                className="button secondary"
                href={api.adminAssetStreamUrl(value.order.id, a.fileId as string)}
                download
              >
                Baixar faixa {a.variant}
              </a>
              <AudioVariantRecovery
                orderId={value.order.id}
                audio={a}
                unsavedLyrics={draftLyrics !== null}
              />
              {value.order.status === 'review_required' && (
                <ConfirmAction
                  label={`Aprovar faixa ${a.variant} e entregar pedido`}
                  effect="Efeito: aprova esta faixa e marca o pedido inteiro como entregue, liberando as duas versões. Afeta o conjunto, não só esta faixa."
                  pendingLabel="Entregando…"
                  pending={approveAudio.isPending}
                  onConfirm={() => approveAudio.mutate(a.id)}
                />
              )}
            </div>
          ))}
        </section>
      </div>
    </AdminShell>
  );
}
