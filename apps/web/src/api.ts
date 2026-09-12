import type { LyricsGenerateAccepted } from '@resenha/contracts';
import type {
  AdminAudio,
  AlbumCover,
  AlbumCoverResponse,
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
export type PublicProduct = {
  type: ProductType;
  name: string;
  priceCents: number;
  active: boolean;
};
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body != null && !(init.body instanceof FormData))
    headers['content-type'] = 'application/json';
  const response = await fetch(url(path), {
    credentials: 'include',
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      { error?: { message?: string } } | undefined;
    throw new ApiError(
      body?.error?.message ?? 'Não foi possível concluir essa ação.',
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export type PublicConfiguration = {
  generation: { lyricsAvailable: boolean };
  brandName: string;
  supportEmail: string | null;
  commercial: {
    ready: boolean;
    deliveryEstimate: string | null;
    revisionPolicy: string | null;
    refundPolicy: string | null;
    usageLicense: string | null;
    termsUrl: string | null;
    privacyUrl: string | null;
    policyVersion: string | null;
  };
  payment: {
    provider: 'abacatepay' | 'disabled';
    label: string;
    configured: boolean;
    devFallback: boolean;
  };
};
export const api = {
  configuration: () => request<PublicConfiguration>('/configuration'),
  products: () => request<PublicProduct[]>('/products'),
  createOrder: (productType: 'custom_song', creationKey: string, visitorId?: string) =>
    request<{ publicId: string }>(`/orders`, {
      method: 'POST',
      body: JSON.stringify({
        productType,
        creationKey,
        ...(visitorId && UUID_RE.test(visitorId) ? { visitorId } : {}),
      }),
    }),
  saveStory: (publicId: string, story: Story) =>
    request<{ saved: true }>(`/orders/${publicId}/story`, {
      method: 'PATCH',
      body: JSON.stringify(story),
    }),
  getOrder: (publicId: string) => request<OrderDetail>(`/orders/${publicId}`),
  cover: (publicId: string) => request<AlbumCoverResponse>(`/orders/${publicId}/cover`),
  createCover: (publicId: string, reference?: File, consent = false, policyVersion?: string) => {
    if (!reference)
      return request<AlbumCover>(`/orders/${publicId}/cover`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    const body = new FormData();
    body.append('consent', String(consent));
    body.append('policyVersion', policyVersion ?? '');
    body.append('reference', reference);
    return request<AlbumCover>(`/orders/${publicId}/cover`, { method: 'POST', body });
  },
  coverDownloadUrl: (publicId: string) => url(`/orders/${publicId}/cover/download`),
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
  generateLyrics: (publicId: string, refinement?: { instructions: string; baseVersion: number }) =>
    request<LyricsGenerateAccepted>(`/orders/${publicId}/lyrics/generate`, {
      method: 'POST',
      ...(refinement ? { body: JSON.stringify(refinement) } : {}),
    }),
  checkout: (publicId: string) =>
    request<{ checkoutUrl: string; dev?: boolean }>(`/orders/${publicId}/checkout`, {
      method: 'POST',
    }),
  approveDevPayment: (publicId: string) =>
    request<{ approved: true }>(`/orders/${publicId}/dev-payment/approve`, { method: 'POST' }),
  delivery: (token: string) =>
    request<{
      publicOrderId: string;
      lyrics: Lyrics[];
      audio: Audio[];
    }>(`/deliveries/${token}`),
  deliveryDownloadUrl: (token: string, variant: number) =>
    url(`/deliveries/${token}/files/${variant}/download`),
  deliveryCover: (token: string) => request<AlbumCoverResponse>(`/deliveries/${token}/cover`),
  deliveryCoverDownloadUrl: (token: string) => url(`/deliveries/${token}/cover/download`),
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
  adminGenerateLyrics: (id: string) =>
    request<LyricsGenerateAccepted>(`/admin/orders/${id}/lyrics/generate`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  adminRetryEmail: (id: string) =>
    request<{ queued: true }>(`/admin/orders/${id}/email/retry`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  adminRegenerateAudio: (id: string, audioId: string) =>
    request<{ queued: true }>(`/admin/orders/${id}/audio/${audioId}/regenerate`, {
      method: 'POST',
      body: JSON.stringify({}),
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
    request<{ items: AdminOrder[]; page: number; total: number; pageSize: number }>(
      `/admin/orders${filters}`,
    ),
  adminOverview: () =>
    request<{
      totals: { orders: number; paid: number; revenueCents: number; refundedCents: number };
      financialEnvironments: FinancialEnvironmentTotals[];
      queue: {
        pending: number;
        processing: number;
        failed: number;
        oldestPendingAgeSeconds: number | null;
        expiredLeases: number;
        unknownCalls: number;
      };
      attention: {
        failed: number;
        failedOperationalOrders?: number;
        reviewRequired: number;
        audioQueued: number;
        lyricsGenerating: number;
      };
    }>('/admin/overview'),
  adminOrder: (id: string) => request<AdminOrderDetail>(`/admin/orders/${id}`),
  adminAssetStreamUrl: (orderId: string, assetId: string) =>
    url(`/admin/orders/${orderId}/assets/${assetId}/stream`),
  resolveAiCall: (orderId: string, callId: string, note: string) =>
    request<{ resolved: true }>(`/admin/orders/${orderId}/ai-calls/${callId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ acknowledgeDuplicateCost: true, note }),
    }),
  retryJob: (id: string, reference?: { file: File; consent: boolean; policyVersion: string }) => {
    const body = reference ? new FormData() : JSON.stringify({});
    if (body instanceof FormData && reference) {
      body.append('consent', String(reference.consent));
      body.append('policyVersion', reference.policyVersion);
      body.append('reference', reference.file);
    }
    return request<{ queued: true }>(`/admin/jobs/${id}/retry`, { method: 'POST', body });
  },
  addAdminNote: (id: string, message: string) =>
    request<{ created: true }>(`/admin/orders/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  revokeAccess: (id: string) =>
    request<{ revoked: true }>(`/admin/orders/${id}/access/revoke`, { method: 'POST' }),
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
export type PaymentEnvironment = 'live' | 'sandbox' | 'local';
export type FinancialEnvironmentTotals = {
  environment: PaymentEnvironment | 'unclassified';
  attempts: number;
  paid: number;
  approvedCents: number;
  refundedCents: number;
};
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
  subjectName?: string | null;
};
/** Admin-authenticated lyric rows keep addressing internal versions directly. */
export type AdminLyrics = Lyrics & { id: string };
export type AdminOrderDetail = {
  unknownCalls?: {
    id: string;
    kind: string;
    provider: string;
    status: string;
    createdAt: string;
  }[];
  productionHistory?: {
    id: string;
    number: number;
    lyricVersionId: string | null;
    status: string;
    provenance: string;
  }[];
  events?: { type: string; createdAt: string }[];
  order: AdminOrder;
  story?: Story;
  lyrics: AdminLyrics[];
  payments: {
    id: string;
    status: string;
    amountCents: number;
    environment: PaymentEnvironment | null;
  }[];
  jobs: {
    id: string;
    status: string;
    type: string;
    lastError?: string | null;
    errorCode?: string | null;
    attempts?: number;
    maxAttempts?: number;
    runAt?: string;
    updatedAt?: string;
    canRetry?: boolean;
    retryBlockedReason?: string | null;
    requiresReference?: boolean;
  }[];
  audio: (AdminAudio & { canRegenerate?: boolean; regenerateBlockedReason?: string | null })[];
  recovery?: {
    lyrics: {
      canGenerate: boolean;
      canEdit: boolean;
      reason: string | null;
      remainingGenerations?: number;
      generateBlockedReason?: string | null;
      editBlockedReason?: string | null;
    };
    audio: { canRebuild: boolean; reason: string | null };
    cover: {
      canRetry: boolean;
      requiresReference: boolean;
      jobId: string | null;
      reason: string | null;
    };
    email: { canRetry: boolean; reason: string | null };
  };
  covers?: {
    id: string;
    attempt: number;
    status: string;
    hasReference: boolean;
    referenceAvailable: boolean;
    lastError: string | null;
    errorCode?: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
  notifications?: {
    id: string;
    status: string;
    provider: string;
    createdAt: string;
    updatedAt: string;
  }[];
  notes: { id: string; message: string; createdAt: string }[];
  revisionRequests?: { message: string; createdAt: string; status: string }[];
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
  costSource?: 'reported' | 'estimated' | 'unknown';
  latencyMs: number | null;
  status: string;
  error: string | null;
  errorCode?: string | null;
  attempt: number;
  createdAt: string;
};
export type AiCost = {
  estimatedCalls?: number;
  unknownCostCalls?: number;
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
};
