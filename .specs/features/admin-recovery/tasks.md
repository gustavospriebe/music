# Tarefas de recuperação administrativa

**Status**: Complete (local validation)

## Test Coverage Matrix

| Code Layer | Required Test Type | Coverage Expectation                                           | Location Pattern                    | Run Command                                                         |
| ---------- | ------------------ | -------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| API/worker | integration        | Estados, concorrência, recuperação e histórico OPS-01 a OPS-06 | src/*.test.ts                       | pnpm --filter @resenha/api test; pnpm --filter @resenha/worker test |
| Web        | unit + e2e         | Ações, bloqueios, feedback e acompanhamento OPS-01/OPS-07      | src/admin/_.test.tsx, e2e/_.spec.ts | pnpm --filter @resenha/web test; pnpm test:e2e                      |

## Gate Check Commands

| Gate Level | When to Use | Command                    |
| ---------- | ----------- | -------------------------- |
| Quick      | Unit        | pnpm --filter <owner> test |
| Full       | Integration | pnpm --filter <owner> test |
| Build      | Final       | pnpm check; pnpm test:e2e  |

## Execution Plan

### Phase 1: Contratos e recuperação

```text
T1
T1 → T2
T1 → T3
T1 → T4
T1 → T5
T2 → T6
T3 → T6
T4 → T6
T5 → T6
T6 → T7
```

## Task Breakdown

### T1: Diagnóstico e contrato de ações

**What**: Expor estado das quatro etapas, capabilities, histórico sanitizado e descoberta de falhas atuais no resumo e na lista.
**Where**: apps/api/src/app.ts e helpers/testes administrativos
**Depends on**: None
**Requirement**: OPS-01
**Done when**:

- [x] DTO informa estados, tentativas, motivos e ações coerentes, sem secrets; contador e filtro encontram falhas atuais, excluindo histórico resolvido.

**Tests**: integration
**Gate**: full

### T2: Recuperação de áudio

**What**: Serializar retries e regeneração com gates financeiros e preservação de variantes.
**Where**: apps/api/src/app.ts, apps/worker/src/worker.ts e testes
**Depends on**: T1
**Requirement**: OPS-02, OPS-03
**Done when**:

- [x] Retry recupera faltantes; regeneração explícita respeita escopo; ações inválidas/concorrrentes são rejeitadas.

**Tests**: integration
**Gate**: full

### T3: Recuperação de letra

**What**: Compartilhar geração segura e corrigir edição administrativa por etapa.
**Where**: apps/api/src/app.ts, domínio e testes
**Depends on**: T1
**Requirement**: OPS-04
**Done when**:

- [x] Letra pode ser retomada sem aprovação implícita antes do pagamento nem perda de histórico.

**Tests**: integration
**Gate**: full

### T4: Recuperação de capa

**What**: Reenfileirar tentativa falhada com referência válida ou exigir reenvio.
**Where**: apps/api/src/app.ts, apps/worker/src/worker.ts e testes
**Depends on**: T1
**Requirement**: OPS-05
**Done when**:

- [x] Retry processável; foto ausente/expirada nunca vira geração textual silenciosa.

**Tests**: integration
**Gate**: full

### T5: Recuperação do aviso de entrega

**What**: Retomar notificação exclusivamente, preservando idempotência e revogação.
**Where**: apps/api/src/app.ts, apps/worker/src/worker.ts e testes
**Depends on**: T1
**Requirement**: OPS-06
**Done when**:

- [x] Retry não gera áudio, não duplica envio concluído e não reativa acesso inválido.

**Tests**: integration
**Gate**: full

### T6: Painel de operação

**What**: Integrar diagnóstico e ações explícitas com feedback e atualização.
**Where**: apps/web/src/admin, api.ts, tipos e testes
**Depends on**: T2, T3, T4, T5
**Requirement**: OPS-01, OPS-07
**Done when**:

- [x] Admin encontra pedidos com falhas pelo resumo e filtro, resolve ações pelo painel e vê impactos, motivos, andamento e histórico.

**Tests**: unit + e2e
**Gate**: full

### T7: Verificação independente e documentação

**What**: Confrontar critérios com efeitos reais isolados e browser; registrar limites e operação.
**Where**: .specs/features/admin-recovery/validation.md, docs/admin-recovery.md, README.md
**Depends on**: T6
**Requirement**: OPS-01, OPS-02, OPS-03, OPS-04, OPS-05, OPS-06, OPS-07
**Done when**:

- [x] Gates pertinentes e sensor passam; documentação permite operar sem terminal.

**Tests**: integration + e2e
**Gate**: build
