/** Stable provider boundary; concrete adapters are selected by environment. */
export type ProviderMode = 'fake' | 'openrouter' | 'mercado-pago' | 'resend' | 's3';
export interface ProviderDescriptor {
  readonly name: string;
  readonly mode: ProviderMode;
  readonly validatedInProduction: false;
}
