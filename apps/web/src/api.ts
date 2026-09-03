import type {
  AdminAudio,
  Audio,
  Lyrics,
  LyricsContent,
  OrderDetail,
  ProductType,
  Story,
} from './types';

/** Em dev, usa URL relativa e o proxy do Vite (funciona via Tailscale/IP). Produção exige VITE_API_URL no build. */
const baseUrl =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : 'http://localhost:3001');
const url = (path: string) => `${baseUrl}/api/v1${path}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** UUID v4 sem depender de `crypto.randomUUID` (ausente em HTTP não-seguro). */
const newVisitorId = (): string => {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    const part = (): string =>
      Math.floor(Math.random() * 0xffff)
        .toString(16)
        .padStart(4, '0');
    return `${part()}${part()}-${part()}-4${part().slice(1)}-8${part().slice(1)}-${part()}${part()}${part()}`;
  }
};

/** Random per-browser id (localStorage, no PII); links pre-order beacons to the order. */
export const visitorId = (): string => {
  const key = 'resenha:visitor';
  try {
    const stored = localStorage.getItem(key);
    if (stored && UUID_RE.test(stored)) return stored;
    const id = newVisitorId();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return newVisitorId();
  }
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body != null) headers['content-type'] = 'application/json';
  const response = await fetch(url(path), {
    credentials: 'include',
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });
  const body = (await response.json().catch(() => undefined)) as
    { error?: { message?: string } } | T | undefined;
  if (!response.ok)
    throw new ApiError(
      (body as { error?: { message?: string } })?.error?.message ??
        'Não foi possível concluir essa ação.',
      response.status,
    );
  return body as T;
}

export const api = {
  createOrder: (productType: ProductType, visitorId?: string) =>
    request<{ publicId: string }>(`/orders`, {
      method: 'POST',
      body: JSON.stringify(
        visitorId && UUID_RE.test(visitorId) ? { productType, visitorId } : { productType },
      ),
    }),
  saveStory: (publicId: string, story: Story) =>
    request<{ saved: true }>(`/orders/${publicId}/story`, {
      method: 'PATCH',
      body: JSON.stringify(story),
    }),
  getOrder: (publicId: string) => request<OrderDetail>(`/orders/${publicId}`),
  editLyrics: (publicId: string, versionNumber: number, content: LyricsContent) =>
    request(`/orders/${publicId}/lyrics/${versionNumber}`, {
      method: 'PATCH',
      body: JSON.stringify(content),
    }),
  approveLyrics: (publicId: string, versionNumber: number, content?: LyricsContent) =>
    request(`/orders/${publicId}/lyrics/${versionNumber}/approve`, {
      method: 'POST',
      ...(content ? { body: JSON.stringify({ content }) } : {}),
    }),
  generateLyrics: (publicId: string) =>
    request(`/orders/${publicId}/lyrics/generate`, { method: 'POST' }),
  checkout: (publicId: string) =>
    request<{ paymentId: string; checkoutUrl: string; dev?: boolean }>(
      `/orders/${publicId}/checkout`,
      { method: 'POST' },
    ),
  approveDevPayment: (paymentId: string) =>
    request<{ approved: true }>(`/dev/payments/${paymentId}/approve`, { method: 'POST' }),
  delivery: (token: string) =>
    request<{
      publicOrderId: string;
      lyrics: Lyrics[];
      audio: Audio[];
    }>(`/deliveries/${token}`),
  deliveryDownloadUrl: (token: string, variant: number) =>
    url(`/deliveries/${token}/files/${variant}/download`),
  exchangeAccess: (publicId: string, token: string) =>
    request<{ ok: true }>(`/orders/${publicId}/access/exchange`, {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  /** Recovery: link de entrega válido vira sessão limitada de leitura neste navegador. */
  recoverViaDelivery: (token: string) =>
    request<{ publicId: string }>(`/deliveries/${token}/access`, { method: 'POST' }),
  requestRevision: (publicId: string, message: string) =>
    request<{ received: true }>(`/orders/${publicId}/revision-requests`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  downloadUrl: (publicId: string, variant: number) =>
    url(`/orders/${publicId}/assets/${variant}/download`),
  adminLogin: (email: string, password: string) =>
    request<{ authenticated: true; expiresAt: string }>('/admin/session', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  adminUpdateLyrics: (id: string, content: LyricsContent) =>
    request<{ id: string }>(`/admin/orders/${id}/lyrics`, {
      method: 'PATCH',
      body: JSON.stringify(content),
    }),
  adminRebuildAudio: (id: string) =>
    request<{ queued: true }>(`/admin/orders/${id}/audio/rebuild`, { method: 'POST' }),
  adminApproveAudio: (id: string, audioId: string) =>
    request<{ delivered: true; deliveryToken: string }>(
      `/admin/orders/${id}/audio/${audioId}/approve`,
      { method: 'POST' },
    ),
  adminLogout: () => request<void>('/admin/session', { method: 'DELETE' }),
  adminOrders: (filters = '') =>
    request<{ items: AdminOrder[]; page: number }>(`/admin/orders${filters}`),
  adminOrder: (id: string) => request<AdminOrderDetail>(`/admin/orders/${id}`),
  adminAssetStreamUrl: (orderId: string, assetId: string) =>
    url(`/admin/orders/${orderId}/assets/${assetId}/stream`),
  retryJob: (id: string) =>
    request<{ queued: true }>(`/admin/jobs/${id}/retry`, { method: 'POST' }),
  addAdminNote: (id: string, message: string) =>
    request<{ created: true }>(`/admin/orders/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  rotateAccess: (id: string) =>
    request<{ accessToken: string }>(`/admin/orders/${id}/access/rotate`, { method: 'POST' }),
  aiUsageSummary: () => request<AiUsageSummary>('/admin/ai-usage/summary'),
  analyticsFunnel: (days = 30) => request<Funnel>(`/admin/analytics/funnel?days=${days}`),
  /** Beacon de funil: fire-and-forget, nunca rejeita (não quebra o fluxo do cliente). */
  sendBeacon: (event: 'landing_view' | 'form_started' | 'form_completed'): void => {
    const id = visitorId();
    if (!UUID_RE.test(id)) return;
    void fetch(url('/analytics/beacon'), {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event, visitorId: id }),
    }).catch(() => undefined);
  },
};
export type FunnelStep = { event: string; orders: number; rateFromPrevious: number | null };
export type Funnel = {
  days: number;
  steps: FunnelStep[];
  preOrder: { event: string; visitors: number }[];
  perSaleUsd: string;
  salesWithCost: number;
};
export type AdminOrder = {
  id: string;
  publicId: string;
  productType: ProductType;
  status: string;
  priceCents: number;
  createdAt: string;
};
/** Admin-authenticated lyric rows keep addressing internal versions directly. */
export type AdminLyrics = Lyrics & { id: string };
export type AdminOrderDetail = {
  order: AdminOrder;
  story?: Story;
  lyrics: AdminLyrics[];
  payments: { id: string; status: string; amountCents: number }[];
  jobs: { id: string; status: string; type: string; lastError?: string | null }[];
  audio: AdminAudio[];
  notes: { id: string; message: string; createdAt: string }[];
  aiUsage: AiUsageRow[];
  aiCost: AiCost;
};
export type AiUsageRow = {
  id: string;
  kind: string;
  provider: string;
  model: string | null;
  externalId: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: string | null;
  latencyMs: number | null;
  status: string;
  error: string | null;
  attempt: number;
  createdAt: string;
};
export type AiCost = {
  /** Decimal USD strings summed exactly in PostgreSQL; format, never float-sum. */
  totalUsd: string;
  lyricsUsd: string;
  audioUsd: string;
  inputTokens: number;
  outputTokens: number;
  calls: number;
};
export type AiUsageSummary = {
  month: AiCost & { blocked: number };
  byDay: { day: string; totalUsd: string; calls: number; blocked: number }[];
  key: { usage: number; limit: number | null; remaining: number | null } | null;
};
