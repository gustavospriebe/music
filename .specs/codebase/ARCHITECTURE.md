> HISTÓRICO — leitura anterior à remediação de 12/09/2026. Alegações de schema, providers, status e prontidão abaixo podem estar superadas. Este documento não autoriza implementação, gastos ou publicação. Use o [modelo vigente](../../docs/project-context.md) e sua validação.

# Architecture

**Analyzed:** 2026-09-11

Documento agente. A versão humana está em `docs/architecture.md` e `ARCHITECTURE.md`.

## System Overview

Três runtimes (`apps/web`, `apps/api`, `apps/worker`) compartilham `packages/{contracts,domain,database}` e parte de `packages/providers`. Um PostgreSQL é dados e fila.

## Layers

```
web (UI) → API (HTTP + enqueue) → PostgreSQL
                              → AbacatePay / S3
worker (poll) → PostgreSQL claim → OpenRouter letra, OpenRouter/Google áudio, OpenRouter capa, Resend, S3
```

Regras: rota valida HTTP; `packages/domain` guarda invariantes (`assertTransition`, `validateLyrics`, `makeMusicPrompt`); repositório persiste; provider encapsula rede.

## Key Abstractions

- `orders` + `order_events`: agregado e histórico.
- `order_contacts`: contato do comprador.
- `lyric_versions`: append-only.
- `generation_jobs`: fila retomável; tipos `generate_lyrics`, `generate_audio`, `generate_cover`, `deliver_notify`.
- `LyricsProvider` / `MusicProvider` / `CoverProvider`: adapters de `fetch`, sem SDK de agente.
- Capabilities assinadas: cookie de pedido vs visualização.

## Data Flow

1. Cliente confirma briefing → `order_contacts` + `story_sessions.data` (criativo, sem PII).
2. API enfileira `generate_lyrics`; worker gera a letra (`lyrics_generating` → `lyrics_ready`/`failed`).
3. Aprovação + pagamento → job na mesma transação.
4. Worker gera duas faixas e capa opcional; e-mail com intenção persistida.
5. Download só via API + capability.

## Patterns in Use

- Idempotência: `creation_key_hash`, `idempotency_key`, webhook `provider+external_event_id`.
- Letra na fila `generation_jobs` + `releaseStaleJobs` (AD-013; supersede AD-002 para letra).
- Capa fora de `orders.status` (AD-003).
- Fallback local só para pagamento e e-mail fora de produção.

## Entry Points

- Web: `apps/web/src/main.tsx`
- API: `apps/api/src/server.ts` → `app.ts` (compose) → `routes/`
- Worker: `apps/worker/src/index.ts` → `worker.ts` (dispatch) → `lyrics`/`audio`/`cover`/`notify`
- Fila: `packages/database/src/jobs.ts`

## External Integrations

Ver `.specs/codebase/INTEGRATIONS.md` e `docs/providers.md`.
