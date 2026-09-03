import type { Audio, Lyrics, LyricsContent, OrderDetail, ProductType, Story } from './types';

/** Em dev, usa URL relativa e o proxy do Vite (funciona via Tailscale/IP). Produção exige VITE_API_URL no build. */
const baseUrl =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : 'http://localhost:3001');
const url = (path: string) => `${baseUrl}/api/v1${path}`;

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
  createOrder: (productType: ProductType) =>
    request<{ publicId: string; accessToken: string }>(`/orders`, {
      method: 'POST',
      body: JSON.stringify({ productType }),
    }),
  saveStory: (publicId: string, story: Story) =>
    request<{ saved: true }>(`/orders/${publicId}/story`, {
      method: 'PATCH',
      body: JSON.stringify(story),
    }),
  getOrder: (publicId: string) => request<OrderDetail>(`/orders/${publicId}`),
  generateLyrics: (publicId: string) =>
    request(`/orders/${publicId}/lyrics/generate`, { method: 'POST' }),
  editLyrics: (publicId: string, versionId: string, content: LyricsContent) =>
    request(`/orders/${publicId}/lyrics/${versionId}`, {
      method: 'PATCH',
      body: JSON.stringify(content),
    }),
  approveLyrics: (publicId: string, versionId: string) =>
    request(`/orders/${publicId}/lyrics/${versionId}/approve`, { method: 'POST' }),
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
  deliveryDownloadUrl: (token: string, assetId: string) =>
    url(`/deliveries/${token}/files/${assetId}/download`),
  exchangeAccess: (publicId: string, token: string) =>
    request<{ ok: true }>(`/orders/${publicId}/access/exchange`, {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  requestRevision: (publicId: string, message: string) =>
    request<{ received: true }>(`/orders/${publicId}/revision-requests`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  downloadUrl: (publicId: string, assetId: string) =>
    url(`/orders/${publicId}/assets/${assetId}/download`),
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
};

export type AdminOrder = {
  id: string;
  publicId: string;
  productType: ProductType;
  status: string;
  priceCents: number;
  createdAt: string;
};
export type AdminOrderDetail = {
  order: AdminOrder;
  story?: Story;
  lyrics: import('./types').Lyrics[];
  payments: { id: string; status: string; amountCents: number }[];
  jobs: { id: string; status: string; type: string; lastError?: string | null }[];
  audio: import('./types').Audio[];
  notes: { id: string; message: string; createdAt: string }[];
};
