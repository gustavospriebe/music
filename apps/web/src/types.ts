export type ProductType = 'friend_roast' | 'team_anthem' | 'emotional_tribute';
export type Voice = 'male' | 'female' | 'duet' | 'either';
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
export type LyricsContent = {
  title: string;
  summary: string;
  fullLyrics: string;
  sections: { type: string; label: string; lyrics: string }[];
  musicalDirection: {
    genre: string;
    mood: string;
    tempo: string;
    voice: string;
    instrumentation: string[];
  };
};
export type Order = {
  publicId: string;
  productType: ProductType;
  status: string;
  priceCents: number;
  createdAt?: string;
};
export type OrderDetail = { order: Order; story?: Story; lyrics: Lyrics[]; audio: Audio[] };
export type Audio = {
  variant: number;
  status: string;
};
/** Admin-authenticated views keep addressing internal rows directly. */
export type AdminAudio = Audio & { id: string; assetId: string };
export const formatUsd = (value: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
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
  ProductType,
  { title: string; eyebrow: string; description: string; accent: string; bullets: string[] }
> = {
  friend_roast: {
    title: 'Música da Resenha',
    eyebrow: 'Pra quem faz a turma inteira rir',
    description:
      'Transforme as histórias, apelidos e bordões da galera numa música que ninguém esquece.',
    accent: 'laranja',
    bullets: [
      'Zoação na medida',
      'Letra para aprovar antes de pagar',
      '2 versões para tocar e compartilhar',
    ],
  },
  team_anthem: {
    title: 'Hino da Pelada',
    eyebrow: 'Seu time merece um refrão próprio',
    description:
      'Do gol no último minuto ao maior vexame: uma música com a identidade do seu time.',
    accent: 'azul',
    bullets: [
      'Grito de torcida memorável',
      'Feita para o time amador',
      'Pronta para o vestiário e a resenha',
    ],
  },
  emotional_tribute: {
    title: 'Sua História em Música',
    eyebrow: 'Uma homenagem para guardar',
    description: 'Conte a história de alguém especial e transforme gratidão em uma canção única.',
    accent: 'rosa',
    bullets: [
      'Tom afetivo e verdadeiro',
      'Você revisa cada palavra',
      'Entrega privada e compartilhável',
    ],
  },
};

export const formatMoney = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
