# Launch Remodel Tasks

> Registro histórico de um recorte anterior. O modelo vigente e a evidência atual estão em [docs/documentation-map.md](../../../docs/documentation-map.md) e [audit-remediation](../audit-remediation/spec.md). Este registro não autoriza publicação nem gasto com providers.

**Status**: Done

Autorização: pedido do usuário de executar geral local. Sem commits/push/deploy. Ownership exclusivo conforme design. Cada entrega inclui seus testes co-localizados.

## Test Coverage Matrix

Guidelines: AGENTS.md, package.json, suítes Vitest/fastify.inject e Playwright existentes.

| Code Layer                 | Required Test Type | Coverage Expectation                      | Location Pattern              | Run Command                                                         |
| -------------------------- | ------------------ | ----------------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| API/worker                 | integration        | Critérios e falhas da spec, banco isolado | src/*.test.ts                 | pnpm --filter @resenha/api test; pnpm --filter @resenha/worker test |
| Web                        | unit + e2e         | Etapas, erros, revisão e acessibilidade   | src/_.test.tsx, e2e/_.spec.ts | pnpm --filter @resenha/web test; pnpm test:e2e                      |
| Contracts/providers/domain | unit               | Validação e invariantes                   | src/*.test.ts                 | pnpm test -- --concurrency=1                                        |
| Runtime config             | none               | Inspeção e build                          | docker/                       | pnpm build                                                          |

## Gate Check Commands

| Gate Level | When to Use             | Command                                                                                |
| ---------- | ----------------------- | -------------------------------------------------------------------------------------- |
| Quick      | Unit                    | pnpm --filter <owner> test                                                             |
| Full       | Integration and browser | pnpm --filter <owner> test; pnpm test:e2e                                              |
| Build      | Final                   | pnpm format:check; pnpm lint; pnpm typecheck; pnpm test -- --concurrency=1; pnpm build |

## Execution Plan

### Phase 1: Implementação com ownership exclusivo

```text
T1
T1 → T2
T1 → T3
T1 → T4
T2 → T5
T5 → T6
T5 → T7
T8
T8 → T9
T7 → T10
T10 → T11
T12
T3 → T13
T4 → T13
T6 → T13
T9 → T13
T11 → T13
T12 → T13
```

## Task Breakdown

### T1: Contrato de criação livre

**What**: Contrato de criação livre, incluindo consumidores e regressões diretamente relacionados.
**Where**: `packages/contracts/src/index.ts`
**Depends on**: None
**Requirement**: CREATE-01
**Done when**:

- [x] Critérios CREATE-01 atendidos com evidência concreta.
- [x] Gate pertinente passa sem enfraquecer assertions.

**Tests**: unit
**Gate**: quick

### T2: Catálogo sem reprecificar histórico

**What**: Catálogo sem reprecificar histórico, incluindo consumidores e regressões diretamente relacionados.
**Where**: `packages/database/src/seed.ts`
**Depends on**: T1
**Requirement**: CREATE-01, PAY-02
**Done when**:

- [x] Critérios CREATE-01, PAY-02 atendidos com evidência concreta.
- [x] Gate pertinente passa sem enfraquecer assertions.

**Tests**: integration
**Gate**: full

### T3: Wizard de criação

**What**: Wizard de criação, incluindo consumidores e regressões diretamente relacionados.
**Where**: `apps/web/src/pages/create-story.tsx`
**Depends on**: T1
**Requirement**: CREATE-01, CREATE-02, CREATE-03
**Done when**:

- [x] Critérios CREATE-01, CREATE-02, CREATE-03 atendidos com evidência concreta.
- [x] Gate pertinente passa sem enfraquecer assertions.

**Tests**: unit + e2e
**Gate**: full

### T4: Landing por intenção

**What**: Landing por intenção, incluindo consumidores e regressões diretamente relacionados.
**Where**: `apps/web/src/pages/landing.tsx`
**Depends on**: T1
**Requirement**: UX-01
**Done when**:

- [x] Critérios UX-01 atendidos com evidência concreta.
- [x] Gate pertinente passa sem enfraquecer assertions.

**Tests**: unit + e2e
**Gate**: full

### T5: Configuração pública comercial

**What**: Configuração pública comercial, incluindo consumidores e regressões diretamente relacionados.
**Where**: `apps/api/src/app.ts`
**Depends on**: T2
**Requirement**: PAY-01, PAY-02
**Done when**:

- [x] Critérios PAY-01, PAY-02 atendidos com evidência concreta.
- [x] Gate pertinente passa sem enfraquecer assertions.

**Tests**: integration
**Gate**: full

### T6: Checkout configurável

**What**: Checkout configurável, incluindo consumidores e regressões diretamente relacionados.
**Where**: `apps/web/src/pages/public.tsx`
**Depends on**: T5
**Requirement**: PAY-01, PAY-02
**Done when**:

- [x] Critérios PAY-01, PAY-02 atendidos com evidência concreta.
- [x] Gate pertinente passa sem enfraquecer assertions.

**Tests**: unit + e2e
**Gate**: full

### T7: Confirmação de pagamento retomável

**What**: Confirmação de pagamento retomável, incluindo consumidores e regressões diretamente relacionados.
**Where**: `apps/api/src/app.ts`
**Depends on**: T5
**Requirement**: PAY-03
**Done when**:

- [x] Critérios PAY-03 atendidos com evidência concreta.
- [x] Gate pertinente passa sem enfraquecer assertions.

**Tests**: integration
**Gate**: full

### T8: Adapter de email

**What**: Adapter de email, incluindo consumidores e regressões diretamente relacionados.
**Where**: `packages/providers/src/email.ts`
**Depends on**: None
**Requirement**: MAIL-02
**Done when**:

- [x] Critérios MAIL-02 atendidos com evidência concreta.
- [x] Gate pertinente passa sem enfraquecer assertions.

**Tests**: unit
**Gate**: quick

### T9: Intenção estável de entrega

**What**: Intenção estável de entrega, incluindo consumidores e regressões diretamente relacionados.
**Where**: `apps/worker/src/worker.ts`
**Depends on**: T8
**Requirement**: MAIL-01
**Done when**:

- [x] Critérios MAIL-01 atendidos com evidência concreta.
- [x] Gate pertinente passa sem enfraquecer assertions.

**Tests**: integration
**Gate**: full

### T10: Revogação de acesso e downloads

**What**: Revogação de acesso e downloads, incluindo consumidores e regressões diretamente relacionados.
**Where**: `apps/api/src/app.ts`
**Depends on**: T7
**Requirement**: ACCESS-01, ACCESS-02
**Done when**:

- [x] Critérios ACCESS-01, ACCESS-02 atendidos com evidência concreta.
- [x] Gate pertinente passa sem enfraquecer assertions.

**Tests**: integration
**Gate**: full

### T11: Solicitação de ajuste operável

**What**: Solicitação de ajuste operável, incluindo consumidores e regressões diretamente relacionados.
**Where**: `apps/api/src/app.ts`
**Depends on**: T10
**Requirement**: SUPPORT-01
**Done when**:

- [x] Critérios SUPPORT-01 atendidos com evidência concreta.
- [x] Gate pertinente passa sem enfraquecer assertions.

**Tests**: integration + e2e
**Gate**: full

### T12: Privacidade do runtime web

**What**: Privacidade do runtime web, incluindo consumidores e regressões diretamente relacionados.
**Where**: `docker/web/nginx.conf`
**Depends on**: None
**Requirement**: OPS-01
**Done when**:

- [x] Critérios OPS-01 atendidos com evidência concreta.
- [x] Gate pertinente passa sem enfraquecer assertions.

**Tests**: none
**Gate**: build

### T13: Verificação integrada e documentação

**What**: Verificação integrada e documentação, incluindo consumidores e regressões diretamente relacionados.
**Where**: `docs/launch-remodel-report.md`
**Depends on**: T3, T4, T6, T9, T11, T12
**Requirement**: QA-01
**Done when**:

- [x] Critérios QA-01 atendidos com evidência concreta.
- [x] Gate pertinente passa sem enfraquecer assertions.

**Tests**: integration + e2e
**Gate**: build

## Evidência de fechamento

Todos os gates locais passaram em Node 22.22.2: pnpm check com 185 testes, E2E 43, React Doctor full 100/100, migrations fresh/upgrade, seed replay, restore isolado e Nginx. Logs em output/launch-remodel; verificador independente em validation.md com 7/7 mutantes detectados. Sem commit/push/deploy.
