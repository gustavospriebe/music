/** Stable provider boundary; concrete adapters are selected by environment. */
export type ProviderMode = 'fake' | 'openrouter' | 'abacate-pay' | 'resend' | 's3';
export interface ProviderDescriptor {
  readonly name: string;
  readonly mode: ProviderMode;
  readonly validatedInProduction: false;
}
export * from './storage.js';
export * from './email.js';
