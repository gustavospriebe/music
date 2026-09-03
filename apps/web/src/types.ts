export type ProductType = 'friend_roast' | 'team_anthem' | 'emotional_tribute';
export type Voice = 'male' | 'female' | 'duet' | 'either';
export type Story = Record<string, unknown> & {
  productType: ProductType;
  buyerEmail: string;
  subjectName: string;
  facts: string[];
};
export type Lyrics = {
  id: string;
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
  id: string;
  publicId: string;
  productType: ProductType;
  status: string;
  priceCents: number;
  createdAt?: string;
};
export type OrderDetail = { order: Order; story?: Story; lyrics: Lyrics[]; audio: Audio[] };
export type Audio = {
  id: string;
  assetId?: string;
  variant: number;
  status: string;
  storage_key?: string;
  mime_type?: string;
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
