# Platform Foundation Tasks

> Registro histórico de um recorte anterior. O modelo vigente e a evidência atual estão em [docs/documentation-map.md](../../../docs/documentation-map.md) e [audit-remediation](../audit-remediation/spec.md). Este registro não autoriza publicação nem gasto com providers.

**Design**: `.specs/features/platform-foundation/design.md`
**Status**: Approved (execução do plano)

---

## Execution Plan

### Phase 1: Spec + banco

```text
T1 → T2
```

### Phase 2: Adapter + job de letra

```text
T2 ──→ T3 ──→ T4
```

### Phase 3: Carcaça

```text
T4 ──→ T5 ──→ T6 ──→ T7
```

---

## Task Breakdown

### T1: Spec/design/tasks da fatia

**What**: Documentar requisitos PF-01–PF-20, arquitetura e tarefas nesta pasta.
**Where**: `.specs/features/platform-foundation/{spec,design,tasks}.md`
**Depends on**: None
**Reuses**: Plano aprovado; `docs/architecture.md`; `.specs/codebase/CONCERNS.md`
**Requirement**: (docs da fatia)

**Done when**:

- [x] spec.md com IDs WHEN/THEN
- [x] design.md com fila, payload e índices
- [x] tasks.md atômico com verificação

**Tests**: none
**Gate**: none

---

### T2: Índices e Postgres 18 local

**What**: Schema Drizzle + migration `0009` e imagem Postgres 18 no compose.
**Where**: `packages/database/src/schema.ts`, `packages/database/drizzle/`, `docker-compose.yml`
**Depends on**: T1
**Reuses**: Padrão `index()` em `ai_usage`; journal Drizzle
**Requirement**: PF-16, PF-17

**Done when**:

- [x] Índices listados no design existem no schema e na SQL versionada
- [x] `docker-compose.yml` usa `postgres:18-alpine`
- [x] Migration aplicada no Postgres local se o serviço estiver no ar

**Tests**: none (schema; verificação SQL)
**Gate**: `pnpm --filter @resenha/database typecheck`

---

### T3: Adapter de letra em packages/providers

**What**: Mover `createOpenRouterLyricsProvider` e `musicalStory`; API/worker reexportam/importam o mesmo.
**Where**: `packages/providers/src/lyrics.ts`, `packages/providers/src/index.ts`, `apps/api/src/providers.ts`
**Depends on**: T2
**Reuses**: Prompt e tipos atuais; testes em `apps/api/src/providers.test.ts` (migrar o que for de letra)
**Requirement**: (adapter compartilhado; PF-07)

**Done when**:

- [x] Nenhum adapter OpenRouter de letra permanece só na API
- [x] Testes de `musicalStory` / completions passam no pacote providers
- [x] Sem pacote npm novo; sem SDK de IA

**Tests**: unit (`packages/providers`)
**Gate**: `pnpm --filter @resenha/providers test`

---

### T4: Job generate_lyrics + testes

**What**: Enqueue na API, `processLyricsJob` no worker, recovery/admin/preview, migrar testes de generate/refine/limite/claim.
**Where**: `apps/api/src/app.ts` (enqueue), `apps/worker/src/lyrics.ts`, `apps/api/src/recovery.ts`, `apps/web/src/admin/labels.ts`, `scripts/local-preview.sh`, testes API/worker
**Depends on**: T3
**Reuses**: `enqueueJob`/`claimNextJob`, loop de `validateLyrics`, `jobNamePt` já tem `generate_lyrics`
**Requirement**: PF-01–PF-15

**Done when**:

- [x] POST devolve 202 accepted + job; não espera letra
- [x] Worker: sucesso, 3 validações, falha inicial → `failed`, refino falho → `lyrics_ready`
- [x] Idempotência `lyrics:{orderId}:{nextVersion}`; stale via `releaseStaleJobs`
- [x] Worker config tem modelo/tokens de texto; preview lyrics liga o worker
- [x] Admin recovery trata `generate_lyrics`
- [x] Testes inject + `processLyricsJob` com provider injetado

**Tests**: integration (`apps/api`, `apps/worker`)
**Gate**: `pnpm --filter @resenha/api test && pnpm --filter @resenha/worker test`

---

### T5: Split de módulos API e worker

**What**: Rotas por área; dispatch no worker; schemas Zod de payload em contracts.
**Where**: `apps/api/src/routes/`, `apps/worker/src/{config,audio,cover,notify,lyrics}.ts`, `packages/contracts/src/index.ts`
**Depends on**: T4
**Reuses**: handlers atuais; sem DI/classes
**Requirement**: PF-18, PF-19

**Done when**:

- [x] `app.ts` só registra plugins e chama `register*`
- [x] `createWorker` despacha para processadores em arquivos
- [x] Payloads de job parseados por Zod
- [x] Testes existentes continuam importando reexports estáveis

**Tests**: integration (mesmas suítes)
**Gate**: `pnpm --filter @resenha/api test && pnpm --filter @resenha/worker test`

---

### T6: Contratos na web

**What**: `@resenha/web` depende de `@resenha/contracts` para status/letra/produto/generate-refine.
**Where**: `apps/web/package.json`, `apps/web/src/types.ts`, `apps/web/src/order-journey.ts`
**Depends on**: T5
**Reuses**: schemas Zod públicos; DTOs de UI ficam locais
**Requirement**: PF-20

**Done when**:

- [x] `types.ts` não duplica unions de status/produto/letra gerada
- [x] Typecheck/testes da web passam

**Tests**: unit (`apps/web`)
**Gate**: `pnpm --filter @resenha/web typecheck && pnpm --filter @resenha/web test`

---

### T7: Docs, STATE, pnpm check

**What**: Atualizar architecture, providers, CONCERNS, STATE; `pnpm check`. Sem provider pago.
**Where**: `docs/architecture.md`, `docs/providers.md`, `.specs/codebase/CONCERNS.md`, `.specs/STATE.md`, `docs/project-context.md`
**Depends on**: T6
**Reuses**: evidência de check; não inventar validação paga
**Requirement**: PF-06 (poll já existe), docs

**Done when**:

- [x] Docs dizem que letra corre no worker
- [x] CONCERNS marca o que esta fatia fechou
- [x] STATE: AD-013, handoff
- [x] `pnpm check` verde

**Tests**: full gate
**Gate**: `pnpm check`

---

## Parallel Execution Map

```text
Phase 1 (Sequential):
  T1 ──→ T2

Phase 2 (Sequential):
  T3 ──→ T4

Phase 3 (Sequential):
  T5 ──→ T6 ──→ T7
```

Nenhuma tarefa `[P]`: suítes API/worker truncam o mesmo Postgres (`TESTING.md`, Parallel-Safe: No).

---

## Task Granularity Check

| Task                | Scope                  | Status                   |
| ------------------- | ---------------------- | ------------------------ |
| T1 Spec docs        | pasta da feature       | ✅ cohesivo              |
| T2 Schema + compose | migration + 1 compose  | ✅                       |
| T3 Adapter          | 1 pacote + reexports   | ✅                       |
| T4 Job + testes     | comportamento da fatia | ⚠️ cohesivo (API+worker) |
| T5 Split            | fronteiras combinadas  | ⚠️ cohesivo              |
| T6 Web contracts    | 1 app                  | ✅                       |
| T7 Docs + check     | fechamento             | ✅                       |

---

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| ---- | ----------------- | ------------- | ------ |
| T1   | None              | start         | ✅     |
| T2   | T1                | T1 → T2       | ✅     |
| T3   | T2                | T2 → T3       | ✅     |
| T4   | T3                | T3 → T4       | ✅     |
| T5   | T4                | T4 → T5       | ✅     |
| T6   | T5                | T5 → T6       | ✅     |
| T7   | T6                | T6 → T7       | ✅     |

---

## Test Co-location Validation

| Task | Code Layer          | Matrix Requires      | Task Says    | Status |
| ---- | ------------------- | -------------------- | ------------ | ------ |
| T1   | docs                | none                 | none         | ✅     |
| T2   | schema              | none (migration SQL) | none         | ✅     |
| T3   | providers           | unit                 | unit         | ✅     |
| T4   | API inject + worker | integration          | integration  | ✅     |
| T5   | API/worker modules  | integration          | integration  | ✅     |
| T6   | web types           | unit                 | unit         | ✅     |
| T7   | docs + gate         | build                | `pnpm check` | ✅     |
