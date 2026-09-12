# Audit remediation Tasks

## Execution Protocol

Use tlc-spec-driven. Execução local aprovada pelo dono; commits/publicação separados. Testes derivam dos critérios, preservam cenários existentes e acompanham cada tarefa. Root integra e fecha status somente após gate. Donos não editam o mesmo arquivo; dependências são respeitadas.

Status: Complete (local; external activation remains separately gated)

## Test Coverage Matrix

Gerada dos testes Vitest/Fastify/Playwright existentes, package.json e AGENTS.md.

| Code Layer       | Required Test Type | Coverage Expectation                                    | Location Pattern              | Run Command                                                         |
| ---------------- | ------------------ | ------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| Domínio/provider | unit               | Critérios e falhas da spec                              | src/*.test.ts                 | corepack pnpm exec vitest run <arquivo>                             |
| API/worker/banco | integration        | Happy path, falhas, concorrência e resultado persistido | src/*.test.ts                 | DATABASE_URL_TEST=<isolado> corepack pnpm exec vitest run <arquivo> |
| Web              | integration        | Resultado e falhas do contrato visíveis                 | src/_.test.tsx; e2e/_.spec.ts | corepack pnpm --filter @resenha/web test; corepack pnpm test:e2e    |
| Docs             | none               | Evidência conferida + links                             | docs/*.md                     | corepack pnpm format:check                                          |

## Gate Check Commands

| Gate Level | When to Use      | Command                                                                                               |
| ---------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| Quick      | unidade          | corepack pnpm --filter <package> exec vitest run <arquivo>                                            |
| Full       | integração       | DATABASE_URL_TEST=<DB18 isolado por owner> corepack pnpm --filter <package> exec vitest run <arquivo> |
| Build      | integração final | corepack pnpm check && corepack pnpm test:e2e                                                         |

## Execution Plan

Frentes independentes dentro da fase rodam em paralelo sob AGENTS.md; cada owner segue suas dependências.

### Phase 1: Contratos e barreiras

T1, T2, T3, T6, T12

### Phase 2: Pagamento e produção

T4, T5, T7, T8, T9, T10, T11

### Phase 3: Integração e conclusão

T13, T14, T15, T16

## Task Breakdown

### T1: Schema e migration preservando histórico

**What**: Schema e migration preservando histórico.
**Where**: `packages/database/src/schema.ts`
**Depends on**: None
**Requirement**: DATA-01, DATA-02, PROD-01
**Reuses**: componentes existentes e design.md; arquivos de apoio e testes sob o mesmo owner.

**Done when**:

- [x] Banco limpo e upgrade até0011 chegam ao mesmo schema; constraints preservam dados válidos.

**Tests**: integration
**Gate**: full

### T2: Contratos criativos e consentimento

**What**: Contratos criativos e consentimento.
**Where**: `packages/contracts/src/index.ts`
**Depends on**: T1
**Requirement**: DATA-01, SEC-03, CLEAN-01
**Reuses**: componentes existentes e design.md; arquivos de apoio e testes sob o mesmo owner.

**Done when**:

- [x] Brief não contém contato; aceites ausentes seguem desconhecidos; testes de contrato passam.

**Tests**: unit
**Gate**: quick

### T3: Adapter PIX estrito

**What**: Adapter PIX estrito.
**Where**: `packages/providers/src/payment.ts`
**Depends on**: None
**Requirement**: PAY-01
**Reuses**: componentes existentes e design.md; arquivos de apoio e testes sob o mesmo owner.

**Done when**:

- [x] ID divergente e payload inválido são rejeitados; referência, valor e refund são preservados.

**Tests**: unit
**Gate**: quick

### T4: Checkout com tentativa durável

**What**: Checkout com tentativa durável.
**Where**: `apps/api/src/routes/payment.ts`
**Depends on**: T1, T3
**Requirement**: PAY-02, PAY-03
**Reuses**: componentes existentes e design.md; arquivos de apoio e testes sob o mesmo owner.

**Done when**:

- [x] Concorrência cria uma tentativa; timeout não cria segunda cobrança; resultado persistido é retornado.

**Tests**: integration
**Gate**: full

### T5: Liquidação e reconciliação financeira

**What**: Liquidação e reconciliação financeira.
**Where**: `packages/database/src/payment-settlement.ts`
**Depends on**: T4
**Requirement**: PAY-01, PAY-04, PAY-05
**Reuses**: componentes existentes e design.md; arquivos de apoio e testes sob o mesmo owner.

**Done when**:

- [x] Webhook/consulta aplicam regra única; refund revoga acesso e evento atrasado não regride estado.

**Tests**: integration
**Gate**: full

### T6: Erros públicos classificados

**What**: Erros públicos classificados.
**Where**: `apps/api/src/app.ts`
**Depends on**: None
**Requirement**: SEC-01
**Reuses**: componentes existentes e design.md; arquivos de apoio e testes sob o mesmo owner.

**Done when**:

- [x] 500 não inclui SQL/parâmetros; erros de negócio mantêm mensagem pública e requestId.

**Tests**: unit
**Gate**: quick

### T7: Submissão, edição e retry de letra

**What**: Submissão, edição e retry de letra.
**Where**: `apps/api/src/routes/orders.ts`
**Depends on**: T2, T6
**Requirement**: SEC-02, SEC-03, JOB-03
**Reuses**: componentes existentes e design.md; arquivos de apoio e testes sob o mesmo owner.

**Done when**:

- [x] Aceites explícitos persistem; conteúdo inválido não é aprovado; retry esgotado não fica preso.

**Tests**: integration
**Gate**: full

### T8: Posse renovável de jobs

**What**: Posse renovável de jobs.
**Where**: `packages/database/src/jobs.ts`
**Depends on**: T1
**Requirement**: JOB-01, JOB-02
**Reuses**: componentes existentes e design.md; arquivos de apoio e testes sob o mesmo owner.

**Done when**:

- [x] Lease vigente renova e finaliza; dono antigo não escreve; claim expirado não repete I/O desconhecido.

**Tests**: integration
**Gate**: full

### T9: Tentativa externa e custo duráveis

**What**: Tentativa externa e custo duráveis.
**Where**: `apps/worker/src/ai-call.ts`
**Depends on**: T8
**Requirement**: COST-01, JOB-02
**Reuses**: componentes existentes e design.md; arquivos de apoio e testes sob o mesmo owner.

**Done when**:

- [x] Tentativa existe antes deIO; uso inválido mantém custo; reported/estimated/unknown distinguíveis.

**Tests**: integration
**Gate**: full

### T10: Produção vinculada à letra

**What**: Produção vinculada à letra.
**Where**: `apps/worker/src/audio.ts`
**Depends on**: T2, T9
**Requirement**: PROD-01, PROD-02, PROD-03
**Reuses**: componentes existentes e design.md; arquivos de apoio e testes sob o mesmo owner.

**Done when**:

- [x] Par pertence à mesma letra; regeneration não apaga passado; áudio inválido é rejeitado.

**Tests**: integration
**Gate**: full

### T11: Notificação como job próprio

**What**: Notificação como job próprio.
**Where**: `apps/worker/src/notify.ts`
**Depends on**: T10
**Requirement**: MAIL-01
**Reuses**: componentes existentes e design.md; arquivos de apoio e testes sob o mesmo owner.

**Done when**:

- [x] Liberação cria notify atomicamente; retry preserva mensagem e não muda tipo do job áudio.

**Tests**: integration
**Gate**: full

### T12: Download privado com intervalo

**What**: Download privado com intervalo.
**Where**: `packages/providers/src/storage.ts`
**Depends on**: None
**Requirement**: FILE-01
**Reuses**: componentes existentes e design.md; arquivos de apoio e testes sob o mesmo owner.

**Done when**:

- [x] Range válido retorna206 e bytes corretos; inválido416; acesso negado continua sem arquivo.

**Tests**: integration
**Gate**: full

### T13: Jornada e cockpit consistentes

**What**: Jornada e cockpit consistentes.
**Where**: `apps/web/src/pages/public.tsx`
**Depends on**: T5, T7, T11, T12
**Requirement**: OPS-01, OPS-03, SEC-03
**Reuses**: componentes existentes e design.md; arquivos de apoio e testes sob o mesmo owner.

**Done when**:

- [x] DTO/UI apresentam consentimento e produção corretos; receita continua após falha de áudio.

**Tests**: integration
**Gate**: full

### T14: Ambiente reproduzível e gates operacionais

**What**: Ambiente reproduzível e gates operacionais.
**Where**: `docker-compose.yml`
**Depends on**: T1, T10
**Requirement**: DATA-02, OPS-02, OPS-03
**Reuses**: componentes existentes e design.md; arquivos de apoio e testes sob o mesmo owner.

**Done when**:

- [x] Node22/Postgres18/ffmpeg funcionam; configuração faltante falha; restore isolado tem procedimento testável.

**Tests**: integration
**Gate**: full

### T15: Mapa canônico e remoção de dívida

**What**: Mapa canônico e remoção de dívida.
**Where**: `docs/project-context.md`
**Depends on**: T13, T14
**Requirement**: CLEAN-01, DOC-01
**Reuses**: componentes existentes e design.md; arquivos de apoio e testes sob o mesmo owner.

**Done when**:

- [x] Docs têm um modelo vigente, histórico marcado e estado externo separado; estruturas mortas removidas.

**Tests**: none
**Gate**: build

### T16: Integração e verificação independente

**What**: Integração e verificação independente.
**Where**: `.specs/features/audit-remediation/validation.md`
**Depends on**: T15
**Requirement**: VERIFY-01
**Reuses**: componentes existentes e design.md; arquivos de apoio e testes sob o mesmo owner.

**Done when**:

- [x] Todos gates passam e verificador independente registra evidência e sensor discriminante.

**Tests**: integration
**Gate**: build

## Diagram-Definition Cross-Check

Dependências são representadas pela coluna Depends on do breakdown; sem diagrama separado duplicado.

## Test Co-location Validation

Todos os critérios funcionais têm teste unitário ou integração na própria tarefa; apenas documentação usa none. Dados/infra exigem PostgreSQL isolado.
