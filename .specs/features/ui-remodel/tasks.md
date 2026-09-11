# UI Remodel Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/ui-remodel/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `AGENTS.md`, `apps/web` RTL/Vitest co-locados (`*.test.tsx`), Playwright `apps/web/e2e/*.spec.ts`, API `fastify.inject` (`apps/api/src/*.test.ts`).

| Code Layer                 | Required Test Type | Coverage Expectation                                        | Location Pattern             | Run Command                           |
| -------------------------- | ------------------ | ----------------------------------------------------------- | ---------------------------- | ------------------------------------- |
| Web component/hook (React) | unit               | Happy + edge + error por comportamento; 1:1 com ACs da task | `apps/web/src/**/*.test.tsx` | `pnpm --filter @resenha/web test`     |
| Web jornada/E2E            | e2e                | Toda rota tocada: happy + edge + erro                       | `apps/web/e2e/*.spec.ts`     | `pnpm --filter @resenha/web test:e2e` |
| API rota/contrato          | integration        | Happy + edge + erro via `fastify.inject`; sem provider real | `apps/api/src/*.test.ts`     | `pnpm --filter @resenha/api test`     |
| Contrato/schema            | none               | Build gate only                                             | `packages/contracts/src/*`   | build gate only                       |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use                                        | Command                                                                  |
| ---------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| Quick      | After tasks with unit tests only                   | `pnpm --filter @resenha/web test` ou `pnpm --filter @resenha/api test`   |
| Full       | After tasks with e2e/integration tests             | `pnpm --filter @resenha/web test && pnpm --filter @resenha/web test:e2e` |
| Build      | After phase completion or config/entity-only tasks | `pnpm format:check && pnpm lint && pnpm typecheck && pnpm build`         |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Fundação acessível

Menu contido e utilitários admin compartilhados. Tarefas independentes, executadas nesta ordem.

```
T1
T2
T3
```

### Phase 2: Jornada pública

Cinco etapas, formulário, preparação, checkout e biblioteca/landing.

```
T1 → T4
T3 → T4 → T5
```

### Phase 3: Cockpit administrativo

Shell, dashboard, lista e detalhe.

```
T2 → T6 → T7
T6 → T8
```

### Phase 4: Fechamento e QA

Acessibilidade final, E2E/visual e docs/estado.

```
T5 → T9
T7 → T9
T8 → T9 → T10 → T11
```

---

## Task Breakdown

### T1: Menu mobile com foco contido

**What**: Evoluir `Header` para `dialog` modal com `inert` no fundo, ciclo de foco e `Escape` com restauração.
**Where**: `apps/web/src/components.tsx`
**Depends on**: None
**Reuses**: Estilos `.site-header nav.open` e teste de Escape existentes
**Requirement**: A11Y-02, A11Y-03, A11Y-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Menu aberto usa `role="dialog"` + `aria-modal="true"` com rótulo
- [ ] Fundo recebe `inert` enquanto aberto (com fallback)
- [ ] Tab/Shift+Tab ciclam só dentro do menu; Escape fecha e devolve foco ao botão
- [ ] Gate check passes: `pnpm --filter @resenha/web test`
- [ ] Test count: sem redução; novos casos de contenção passam

**Tests**: unit
**Gate**: quick

---

### T2: Agregados admin no servidor

**What**: Criar `GET /api/v1/admin/overview` agregado e devolver `total`/`pageSize` em `GET /api/v1/admin/orders`.
**Where**: `apps/api/src/app.ts`
**Depends on**: None
**Reuses**: Filtros de data fuso SP, `ai-usage/summary` e `analytics/funnel` como padrão
**Requirement**: ADMIN-03, ADMIN-04, ADMIN-05, ADMIN-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `GET /api/v1/admin/overview` devolve `totals`, `attention` e `funnel` via SQL sem carregar todos os pedidos
- [ ] `GET /api/v1/admin/orders` devolve `total` e `pageSize: 30` com os mesmos filtros
- [ ] Sem sessão admin ambos respondem 401
- [ ] Gate check passes: `pnpm --filter @resenha/api test`
- [ ] Test count: sem redução; novos casos passam

**Tests**: integration
**Gate**: quick

---

### T3: Sinal de pagamento antes do clique

**What**: Expor `payment: { configured, devFallback }` em `GET /api/v1/orders/:publicId` e no client web.
**Where**: `apps/api/src/app.ts`
**Depends on**: None
**Reuses**: Lógica existente de token ausente fora de produção
**Requirement**: CHECK-01, CHECK-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Resposta inclui `payment.configured` e `payment.devFallback` corretos por ambiente
- [ ] Client web tipa o campo sem quebrar respostas antigas
- [ ] Gate check passes: `pnpm --filter @resenha/api test`
- [ ] Test count: sem redução

**Tests**: integration
**Gate**: quick

---

### T4: Jornada pública em cinco etapas

**What**: Criar `JourneySteps`, corrigir "Etapa N de 5", CTA fiel, autocomplete, rascunho explicado com apagar e preparação de letra informativa.
**Where**: `apps/web/src/pages/public.tsx`
**Depends on**: T1, T3
**Reuses**: `ProductionRail`, `deriveOrderJourney`, `LyricEditor`, `useDraft`/`clearDraft`
**Requirement**: JOURNEY-01, JOURNEY-02, JOURNEY-03, JOURNEY-04, FORM-01, FORM-02, A11Y-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `/criar`, `/criar/letra` e `/criar/checkout` exibem "Etapa 1/2/3 de 5" com `progressbar` programático
- [ ] CTA do formulário é "Salvar história e continuar"
- [ ] Tela pré-geração explica o que será gerado, tempo, persistência e recuperação
- [ ] Edição/versionamento/aprovação preservados; `autocomplete` nome/e-mail presente
- [ ] Rascunho explica navegador/dispositivo e oferece "Apagar rascunho"
- [ ] Gate check passes: `pnpm --filter @resenha/web test`
- [ ] Test count: sem redução; novos casos passam

**Tests**: unit
**Gate**: quick

---

### T5: Checkout, biblioteca e landing honesta

**What**: Resumo reconhecível, aviso de redirecionamento, estado desabilitado motivado, pendências sem política inventada; Minhas músicas com homenageado/título, ocasião, data, progresso e ação; landing sem player falso.
**Where**: `apps/web/src/pages/public.tsx`
**Depends on**: T4
**Reuses**: `formatMoney`, `latestLyrics`, `deriveOrderJourney`, `readMyOrders`
**Requirement**: LIB-01, DEMO-01, CHECK-01, CHECK-02, CHECK-03, CHECK-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Checkout exibe produto, homenageado/título, preço, conteúdo, próxima etapa e redirecionamento
- [ ] Sem provider e sem fallback o botão nasce desabilitado com motivo acessível
- [ ] Seção "A definir antes do lançamento" lista prazo/suporte/ajustes/reembolso sem inventar regra
- [ ] Minhas músicas prioriza título/homenageado, ocasião, data, progresso e ação
- [ ] Landing não renderiza `<audio>` nem botão de reprodução demo
- [ ] Gate check passes: `pnpm --filter @resenha/web test`
- [ ] Test count: sem redução

**Tests**: unit
**Gate**: quick

**Commit**: `feat(web): remodelar jornada publica e checkout`

---

### T6: Shell admin e dashboard por exceções

**What**: Criar `AdminShell` persistente, utilitários PT-BR/máscara e dashboard com alertas primeiro via overview.
**Where**: `apps/web/src/admin/routes.tsx`
**Depends on**: T2
**Reuses**: `AdminOverview`, `Funnel`, estilos `.admin`
**Requirement**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Shell com navegação Visão geral/Pedidos, contexto e saída em `/admin`, `/admin/pedidos` e detalhe
- [ ] Dashboard usa `GET /admin/overview`; alertas e próxima decisão antes de métricas
- [ ] Eventos/status em português; sem moeda mista sem referência
- [ ] Nenhum total derivado só da primeira página
- [ ] Gate check passes: `pnpm --filter @resenha/web test`
- [ ] Test count: sem redução

**Tests**: unit
**Gate**: quick

---

### T7: Lista admin com paginação e filtros explícitos

**What**: Paginação com total, estado vazio/erro e aplicação explícita de filtros a partir da página 1.
**Where**: `apps/web/src/admin/routes.tsx`
**Depends on**: T6
**Reuses**: `api.adminOrders`, `adminOrdersQuerySchema`
**Requirement**: ADMIN-05, ADMIN-06, ADMIN-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Lista exibe página atual, total e navegação; sem refetch por tecla
- [ ] "Filtrar" aplica e volta à página 1; linhas mostram idade, cliente/homenagem e próxima ação em PT-BR
- [ ] Sem expor ID interno como chave visual principal
- [ ] Gate check passes: `pnpm --filter @resenha/web test`
- [ ] Test count: sem redução

**Tests**: unit
**Gate**: quick

---

### T8: Detalhe admin seccionado e seguro

**What**: Seções legíveis, PII mascarada, confirmações com efeito e escopo faixa/conjunto inequívoco.
**Where**: `apps/web/src/admin/routes.tsx`
**Depends on**: T6
**Reuses**: Tipos admin e ações retry/rebuild/approve existentes
**Requirement**: ADMIN-07, ADMIN-08, ADMIN-09, ADMIN-10, ADMIN-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Sem `JSON.stringify` de história; seções para história, letra, pagamento, custos, fila e áudios
- [ ] E-mail mascarado; sem IDs internos, tokens, `externalId` ou payloads desnecessários
- [ ] Retry/rebuild/aprovação exigem armar + confirmar com efeito descrito
- [ ] Rebuild declara as duas versões; aprovação declara escopo por faixa vs pedido
- [ ] Gate check passes: `pnpm --filter @resenha/web test`
- [ ] Test count: sem redução

**Tests**: unit
**Gate**: quick

**Commit**: `feat(admin): cockpit operacional com overview e detalhe seguro`

---

### T9: Acessibilidade, estilos e E2E

**What**: Cobrir 44px, `progressbar`, erros associados, reflow 390×844 e fluxos E2E atualizados (incluindo navegação só por teclado onde aplicável).
**Where**: `apps/web/src/styles.css`
**Depends on**: T5, T7, T8
**Reuses**: Tokens creme/coral/preto e padrões RTL/Playwright existentes
**Requirement**: A11Y-01, A11Y-05, A11Y-06, A11Y-07, GUARD-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Alvos auditados com mínimo 44×44; foco visível preservado
- [ ] E2E cobre jornada, checkout indisponível, admin e menu por teclado
- [ ] Nenhum overflow horizontal a 390×844 nas rotas auditadas
- [ ] Gate check passes: `pnpm --filter @resenha/web test && pnpm --filter @resenha/web test:e2e`
- [ ] Test count: sem redução

**Tests**: e2e
**Gate**: full

---

### T10: Validação local completa e Browser QA

**What**: Rodar gates, banco descartável, build, E2E, Browser QA desktop/mobile, screenshots inspecionadas e `git diff --check` sem provider real.
**Where**: `.specs/features/ui-remodel/local-validation.md`
**Depends on**: T9
**Reuses**: Baseline e limites de `local-readiness-ui-audit`
**Requirement**: GUARD-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `pnpm format:check`, `lint`, `typecheck`, testes serializados, `build`, `test:e2e` e `git diff --check` passam
- [ ] Browser QA cobre jornada, login admin, dashboard, lista e detalhe a 1280×720 e 390×844
- [ ] Screenshots atuais salvas e inspecionadas; `worker.ts` intocado
- [ ] Evidência escrita em `local-validation.md` com separação local/remoto/providers

**Tests**: none
**Gate**: build

---

### T11: Docs, estado e relatório pós-remodelagem

**What**: Atualizar README, project-context, auditoria/relatório e STATE com entrega, pendências e separação de gates.
**Where**: `docs/ui-remodel-report.md`
**Depends on**: T10
**Reuses**: `docs/ui-ux-audit.md` como baseline, sem reescrevê-la como se fosse nova auditoria
**Requirement**: GUARD-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Relatório lista implementado, arquivos, testes exatos, problemas, pendências jurídico-comerciais e separação local/CI/providers/Railway/produção
- [ ] README, project-context e STATE apontam para a entrega sem declarar gate externo
- [ ] Gate check passes: `pnpm format:check`
- [ ] Nenhum secret, PII ou ID interno registrado

**Tests**: none
**Gate**: build

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1
          T2
          T3
Phase 2:  T1 → T4
          T3 → T4 → T5
Phase 3:  T2 → T6 → T7
          T6 → T8
Phase 4:  T5 → T9
          T7 → T9
          T8 → T9 → T10 → T11
```

Execution is strictly sequential - there is no intra-phase parallelism. A single agent (or batch worker) works one task at a time, in order.

**How phase-based execution works:**

At Execute, the agent counts total tasks and packs phases into **task-budgeted batches** (~7 tasks
per worker, whole phases - the benchmarked sweet spot is ~20 tasks → ~3 workers). A **phase** is the
semantic/dependency unit; a **batch** is one or more _consecutive whole phases_ assigned to one
worker. The cut only ever lands on a phase boundary - a phase is never split across workers. When
packing yields more than one batch (> ~8 tasks), the agent offers to dispatch batch sub-agents.
Batches run sequentially: each worker executes ALL its tasks in order, then reports a compact summary
before the next batch starts. This right-sizes the worker count by workload instead of by phase
count (one-per-phase is too fragmented; expensive and slow). See [sub-agents.md](sub-agents.md) for
the full model - packing algorithm, offer-then-confirm, worker payload, compact summary contract,
failure handling, and context sizing guidance.

When the whole feature fits a single batch (≤ ~8 tasks), execution happens inline in the main window
with no sub-agents spawned.

**The orchestrating agent's role during Execute:**

1. Count total tasks and pack phases into ~7-task batches - offer batch sub-agents if that yields more than one batch and the user accepts
2. Dispatch the next batch (to a worker, or execute inline)
3. Receive the compact batch summary
4. Update tasks.md with results
5. If the batch summary shows all tasks complete: proceed to the next batch
6. If a task failed: decide fix/escalate before dispatching the next batch

---

## Task Granularity Check

| Task                                   | Scope                                                    | Status      |
| -------------------------------------- | -------------------------------------------------------- | ----------- |
| T1: Menu mobile com foco contido       | 1 componente (`Header`)                                  | ✅ Granular |
| T2: Agregados admin no servidor        | 1 superfície (2 acréscimos aditivos na mesma rota admin) | ✅ Granular |
| T3: Sinal de pagamento antes do clique | 1 campo aditivo + client                                 | ✅ Granular |
| T4: Jornada pública em cinco etapas    | 1 página (`public.tsx` jornada)                          | ✅ Granular |
| T5: Checkout, biblioteca e landing     | 1 página + 1 ajuste landing                              | ✅ Granular |
| T6: Shell admin e dashboard            | 1 superfície admin                                       | ✅ Granular |
| T7: Lista admin paginada               | 1 componente (`AdminOrders`)                             | ✅ Granular |
| T8: Detalhe admin seccionado           | 1 componente (`AdminOrderDetail`)                        | ✅ Granular |
| T9: Acessibilidade, estilos e E2E      | 1 camada (css + e2e da feature)                          | ✅ Granular |
| T10: Validação local e Browser QA      | 1 artefato de evidência                                  | ✅ Granular |
| T11: Docs e relatório                  | docs + estado                                            | ✅ Granular |

**Granularity check:**

- ✅ 1 component / 1 function / 1 endpoint = Good
- ⚠️ 2-3 related things in same file = OK if cohesive
- ❌ Multiple components or files = MUST split

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows             | Status   |
| ---- | ---------------------- | ------------------------- | -------- |
| T1   | None                   | None                      | ✅ Match |
| T2   | None                   | None                      | ✅ Match |
| T3   | None                   | None                      | ✅ Match |
| T4   | T1, T3                 | T1 → T4, T3 → T4          | ✅ Match |
| T5   | T4                     | T4 → T5                   | ✅ Match |
| T6   | T2                     | T2 → T6                   | ✅ Match |
| T7   | T6                     | T6 → T7                   | ✅ Match |
| T8   | T6                     | T6 → T8                   | ✅ Match |
| T9   | T5, T7, T8             | T5 → T9, T7 → T9, T8 → T9 | ✅ Match |
| T10  | T9                     | T9 → T10                  | ✅ Match |
| T11  | T10                    | T10 → T11                 | ✅ Match |

**Rules:**

- Every `Depends on` in a task body must have a corresponding arrow in the diagram.
- Every arrow in the diagram must correspond to a `Depends on` in the target task's body.
- A task must never depend on a task in a later phase - dependencies point backward or within the same phase only.

---

## Test Co-location Validation

| Task                    | Code Layer Created/Modified | Matrix Requires | Task Says   | Status |
| ----------------------- | --------------------------- | --------------- | ----------- | ------ |
| T1: Menu                | Web component               | unit            | unit        | ✅ OK  |
| T2: Overview/total      | API rota                    | integration     | integration | ✅ OK  |
| T3: payment configured  | API rota                    | integration     | integration | ✅ OK  |
| T4: Jornada             | Web component               | unit            | unit        | ✅ OK  |
| T5: Checkout/biblioteca | Web component               | unit            | unit        | ✅ OK  |
| T6: Shell/dashboard     | Web component               | unit            | unit        | ✅ OK  |
| T7: Lista               | Web component               | unit            | unit        | ✅ OK  |
| T8: Detalhe             | Web component               | unit            | unit        | ✅ OK  |
| T9: A11y/E2E            | Web jornada/E2E             | e2e             | e2e         | ✅ OK  |
| T10: Evidência          | Nenhuma camada de código    | none            | none        | ✅ OK  |
| T11: Docs               | Nenhuma camada de código    | none            | none        | ✅ OK  |

**Rules:**

- "Tested in another task" is NOT a valid justification for `Tests: none`. That is test deferral - the exact anti-pattern this validation prevents.
- `Tests: none` is only valid when the coverage matrix says "none" for that code layer.
- If a task creates MULTIPLE code layers (e.g., service + controller), use the HIGHEST test type required by any of them.
- Any ❌ VIOLATION → restructure the task to include its required tests before proceeding.

---

## Tips

- **Phases are ordered** - Each phase completes before the next; tasks run in order within a phase
- **Reuses = Token saver** - Always reference existing code
- **Tools per task** - MCPs and Skills prevent wrong approaches
- **Dependencies are gates** - Clear what blocks what
- **Done when = Testable** - If you can't verify it, rewrite it
- **Requirement ID = Traceable** - Every task traces back to a spec requirement
- **One commit per task** - Plan the commit message format in advance
