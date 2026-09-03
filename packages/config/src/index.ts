export const brand = {
  name: 'Música da Resenha',
  supportEmail: 'suporte@musicadaresenha.example',
  currency: 'BRL',
  defaultPriceCents: 4990,
} as const;
export const environmentNames = ['development', 'test', 'production'] as const;
export type EnvironmentName = (typeof environmentNames)[number];
