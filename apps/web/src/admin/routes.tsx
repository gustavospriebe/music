import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../api';
import { Loading } from '../components';
import { formatMoney, products } from '../types';

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
export function AdminDashboard() {
  const orders = useQuery({ queryKey: ['admin', 'orders'], queryFn: () => api.adminOrders() });
  if (orders.isLoading) return <Loading label="Carregando indicadores…" />;
  if (orders.isError) return <AdminAuthError />;
  const items = orders.data?.items ?? [];
  const paid = items.filter((x) => ['paid', 'audio_generating', 'delivered'].includes(x.status));
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
      </div>
      <Link className="button primary" to="/admin/pedidos">
        Ver pedidos
      </Link>
    </main>
  );
}
export function AdminOrders() {
  const orders = useQuery({ queryKey: ['admin', 'orders'], queryFn: () => api.adminOrders() });
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
  const canRebuild = [
    'failed',
    'review_required',
    'delivered',
    'audio_queued',
  ].includes(value.order.status);
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
