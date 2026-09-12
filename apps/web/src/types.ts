import { type GeneratedLyrics, type ProductType, voiceSchema } from '@resenha/contracts';
import type { z } from 'zod';

export type { ProductType };
export type Voice = z.infer<typeof voiceSchema>;
export type Story = Record<string, unknown> & {
  productType: ProductType;
  buyerEmail: string;
  subjectName: string;
  facts: string[];
};
export type Lyrics = {
  number: number;
  kind: string;
  approvedAt?: string | null;
  content: LyricsContent;
};
export type LyricsContent = GeneratedLyrics;
export type Order = {
  publicId: string;
  productType: ProductType;
  status?: string;
  priceCents: number;
  createdAt?: string;
};
export type OrderDetail = {
  remainingGenerations?: number;
  order: Order;
  story?: Story;
  lyrics: Lyrics[];
  audio: Audio[];
  privateAccess: boolean;
  /** Sinal legível de disponibilidade de pagamento; ausente em respostas antigas/mockadas. */
  payment?: {
    provider?: 'abacatepay' | 'disabled';
    label?: string;
    configured: boolean;
    devFallback: boolean;
    checkoutAllowed?: boolean;
    unavailableReason?: string | null;
  };
};
export type AlbumCover = {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempt: 1 | 2;
  canRegenerate: boolean;
  hasReference: boolean;
  createdAt: string;
  downloadUrl?: string;
};
export type AlbumCoverResponse = { available: boolean; cover: AlbumCover | null };
export type Audio = {
  variant: number;
  status: string;
};
/** Admin-authenticated views keep addressing internal rows directly. */
export type AdminAudio = Audio & { id: string; fileId: string };
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatUsd = (value: number): string => usdFormatter.format(value);
/** Formats an exact decimal USD string (from PostgreSQL `numeric`) without float math. */
export const formatUsdExact = (value: string): string => {
  const [int = '0', frac = ''] = value.split('.');
  const digits = `${frac}000`;
  let cents = Number(digits.slice(0, 2)) + (Number(digits[2]) >= 5 ? 1 : 0);
  let dollars = Number(int);
  if (cents >= 100) {
    cents -= 100;
    dollars += 1;
  }
  return `$${dollars}.${String(cents).padStart(2, '0')}`;
};
export const products: Record<
  'custom_song',
  { title: string; eyebrow: string; description: string; accent: string; bullets: string[] }
> = {
  custom_song: {
    title: 'Sua música original',
    eyebrow: 'Qualquer história pode virar música',
    description: 'Uma criação livre, com a sua história e o seu som.',
    accent: 'laranja',
    bullets: ['Criação livre', 'Letra revisável', 'Duas versões privadas'],
  },
};

export const formatMoney = (cents: number) => brlFormatter.format(cents / 100);
