> HISTÓRICO — leitura anterior à remediação de 12/09/2026. Alegações de schema, providers, status e prontidão abaixo podem estar superadas. Este documento não autoriza implementação, gastos ou publicação. Use o [modelo vigente](../../docs/project-context.md) e sua validação.

# Integrations

**Analyzed:** 2026-09-11

## OpenRouter

- Letra: `packages/providers/src/lyrics.ts` → Chat Completions JSON, executada no worker.
- Áudio: `apps/worker/src/worker.ts` `createOpenRouterMusicProvider` → SSE `modalities: text+audio`.
- Capa: mesmo worker, Images API.
- Ledger: `ai_usage`. Modelos via `OPENROUTER_*`.

## Google Lyria 3.5

- `MUSIC_PROVIDER=google` no worker. Interactions API. Não é default.
- Evidência: `.specs/features/google-lyria-integration/`.

## AbacatePay

- `apps/api/src/providers.ts` + `apps/api/src/payment.ts`.
- Checkout PIX, webhook com secret em query ou header, reconciliação no retorno do pedido.

## Resend

- `packages/providers/src/email.ts`. Produção exige remetente de domínio verificado.
- Worker persiste `email_deliveries.message` antes de enviar.

## Storage

- `packages/providers` S3 SDK. Dev: disco absoluto compartilhado. Produção: Bucket Railway privado; API faz proxy.

## Railway

- Projeto `musica`, env `production`: web, api, worker, Postgres, Bucket.
- Health: `/` (web), `/api/v1/health/ready` (api). Worker sem HTTP.
