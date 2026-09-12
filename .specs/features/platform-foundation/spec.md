# Platform Foundation Specification

> Registro histórico de um recorte anterior. O modelo vigente e a evidência atual estão em [docs/documentation-map.md](../../../docs/documentation-map.md) e [audit-remediation](../audit-remediation/spec.md). Este registro não autoriza publicação nem gasto com providers.

## Problem Statement

A carcaça do monólito ainda trata letra como chamada síncrona na API, varre a fila sem índice composto e duplica contratos públicos na web. Sem Redis, framework de IA ou cadastro, o sistema precisa da mesma fila PostgreSQL do áudio, fronteiras de módulo e um contrato único, para aguentar features novas sem timeout de proxy nem drift de DTO.

## Goals

- [x] `POST /lyrics/generate` valida, enfileira `generate_lyrics` e responde `accepted` sem esperar o provedor.
- [x] O worker executa gerar → `validateLyrics` (até 3 tentativas) → `ai_usage`, com falha inicial em `failed` e falha de refinamento em `lyrics_ready`.
- [x] Claim da letra usa `releaseStaleJobs`; não há CAS de 5 minutos em `orders.updatedAt`.
- [x] Índice `(status, run_at)` na fila e índices de `order_id` nas tabelas de detalhe listadas.
- [x] API e worker importam o mesmo adapter de letra em `packages/providers`.
- [x] `apps/web` importa `orderStatus`, `generatedLyrics`, `productType` e generate/refine de `@resenha/contracts`.
- [x] `pnpm check` passa sem chamada a provider pago.

## Out of Scope

| Feature                                           | Reason                                                      |
| ------------------------------------------------- | ----------------------------------------------------------- |
| Redis, BullMQ ou segunda fila                     | PostgreSQL já é a fila durável.                             |
| LangGraph, Mastra, LangChain, Vercel AI SDK       | Fora da decisão desta fatia.                                |
| Cadastro, tabela de usuários, hash da senha admin | Admin permanece `ADMIN_EMAIL`/`ADMIN_PASSWORD` no ambiente. |
| PIX/preço/textos comerciais, `AUDIO_REVIEW_MODE`  | Ativação comercial, não carcaça.                            |
| Variantes de áudio em paralelo                    | Só depois do índice da fila.                                |
| Isolamento de PII do JSONB / uso de `leads`       | Feature seguinte.                                           |
| CSP na API JSON, WAF, deploy, push                | Borda Railway / operação.                                   |

---

## User Stories

### P1: Enfileirar letra e acompanhar por poll ⭐ MVP

**User Story**: Como comprador, quero que gerar/refinar a letra devolva rápido e a página continue consultando o pedido até `lyrics_ready` ou `failed`.

**Why P1**: O request HTTP hoje segura até 3×60s; a UI já faz poll em `lyrics_generating`.

**Acceptance Criteria**:

1. **PF-01** WHEN o cliente envia `POST /api/v1/orders/:publicId/lyrics/generate` válido THEN o sistema SHALL transicionar para `lyrics_generating`, inserir job `generate_lyrics` e responder HTTP 202 com `{ accepted: true, status: "lyrics_generating" }` sem chamar o provedor no request.
2. **PF-02** WHEN o body é vazio ou omitido THEN o sistema SHALL enfileirar primeira geração (ou regeneração) com payload `{}`.
3. **PF-03** WHEN o body é `{ instructions, baseVersion }` válido THEN o sistema SHALL enfileirar refinamento com payload `{ refinement: { instructions, baseVersion } }` e SHALL NOT incluir briefing, e-mail ou letra no payload.
4. **PF-04** WHEN o mesmo `POST` é repetido com a mesma chave `lyrics:{orderId}:{nextVersion}` e job pendente/processando com o mesmo payload THEN o sistema SHALL devolver 202 accepted sem duplicar job.
5. **PF-05** WHEN um segundo `POST` com payload diferente chega enquanto `generate_lyrics` está `pending`/`processing` THEN o sistema SHALL responder 409.
6. **PF-06** WHILE o pedido estiver em `lyrics_generating` THEN GET do pedido SHALL permanecer a fonte de verdade e a UI existente SHALL continuar o poll de 1,5s.

**Independent Test**: `fastify.inject` no POST (sem letra no mesmo request) + GET; worker `processLyricsJob` com provider injetado.

---

### P1: Worker gera, valida e registra custo ⭐ MVP

**User Story**: Como operador, quero que a letra rode na mesma fila SKIP LOCKED do áudio, com retomada por lock da fila.

**Why P1**: Uma política de claim só; impossível retomar letra travada no HTTP.

**Acceptance Criteria**:

1. **PF-07** WHEN o worker reivindica `generate_lyrics` THEN o sistema SHALL ler `story_sessions`, chamar o adapter, aplicar `validateLyrics` e repetir até 3 vezes com feedback; cada chamada SHALL gravar `ai_usage` com `job_id`.
2. **PF-08** WHEN a geração inicial falhar (provedor ou validação esgotada) THEN o pedido SHALL ir para `failed` e o job SHALL terminar em `failed` (terminal).
3. **PF-09** WHEN o refinamento falhar THEN o pedido SHALL voltar para `lyrics_ready`, versões existentes SHALL permanecer e o job SHALL terminar em `failed`.
4. **PF-10** WHEN o worker ou o lock expirar THEN `releaseStaleJobs` SHALL devolver o job a `pending`; o sistema SHALL NOT usar timeout de 5 minutos em `orders.updatedAt` para novo claim HTTP.
5. **PF-11** WHEN a primeira geração falhou e o cliente gera de novo com a mesma `nextVersion` THEN o sistema SHALL repor o job `failed` para `pending` (não deixar órfão pela chave idempotente).
6. **PF-12** WHEN `PREVIEW_AI=lyrics` THEN `scripts/local-preview.sh worker` SHALL habilitar o worker com chave/modelo de texto, não só a API.

**Independent Test**: `processLyricsJob` com provider injetado (sucesso, 3 rejeições, throw, refino falho); preview `--check`.

---

### P1: Admin retoma `generate_lyrics` sem PII ⭐ MVP

**User Story**: Como admin, quero ver e retomar o job de letra como os demais, sem detalhe de provedor no erro.

**Why P1**: Recovery já existe para áudio/capa/e-mail; letra na fila precisa da mesma superfície.

**Acceptance Criteria**:

1. **PF-13** WHEN houver job `generate_lyrics` THEN labels e recovery SHALL tratá-lo (retomada visível, erro sanitizado via `sanitizeAiError` / `publicFailure`).
2. **PF-14** WHEN o admin solicita geração THEN o sistema SHALL enfileirar e responder accepted; a nota SHALL registrar solicitação, não conclusão da letra.
3. **PF-15** WHEN o limite de gerações ou pagamento já ocorrido impedir THEN o sistema SHALL responder 409 sem chamar o provedor.

**Independent Test**: inject admin generate/retry; labels `jobNamePt('generate_lyrics')`.

---

### P1: Índices e Postgres local 18 ⭐ MVP

**User Story**: Como o sistema, quero que o claim da fila e os FKs de `order_id` tenham índice, e que o Postgres local acompanhe o 18 do Railway.

**Why P1**: Sem índice a fila degrada com histórico; divergência 16 vs 18 esconde incompatibilidade.

**Acceptance Criteria**:

1. **PF-16** WHEN a migration rodar THEN `generation_jobs` SHALL ter índice `(status, run_at)` e `order_id`; `payments`, `order_events`, `revision_requests`, `admin_notes` e `stored_files` SHALL ter índice em `order_id`.
2. **PF-17** WHEN `docker-compose.yml` subir Postgres THEN a imagem SHALL ser 18, alinhada ao Railway.

**Independent Test**: SQL da migration + compose; migration no Postgres local se disponível.

---

### P2: Fronteiras de código e contratos na web

**User Story**: Como quem altera checkout ou IA, quero arquivos por área e um único schema público, sem DI.

**Why P2**: Carcaça para features novas; não muda o funil sozinho.

**Acceptance Criteria**:

1. **PF-18** WHEN `app.ts` registrar HTTP THEN handlers SHALL viver em módulos por área (pedido/letra, pagamento, admin, webhook); `app.ts` SHALL só compor plugins e rotas, com funções e imports explícitos (sem services/classes/DI).
2. **PF-19** WHEN o worker disparar um job THEN o payload SHALL ser validado por schema Zod em `@resenha/contracts`; dispatch em `worker.ts` e processadores em módulos.
3. **PF-20** WHEN a web tipar status, letra gerada, produto ou generate/refine THEN SHALL importar de `@resenha/contracts` e `apps/web/src/types.ts` SHALL NOT duplicar esses schemas.

**Independent Test**: typecheck web/api/worker; testes existentes de payload de job.

---

## Edge Cases

- WHEN o pedido está em `draft` THEN generate SHALL 400 pedindo o formulário.
- WHEN letra indisponível (sem chave/modelo) THEN generate SHALL 503 e preservar a história.
- WHEN `lyrics_generating` órfão (sem job pendente/processando) THEN um novo POST SHALL poder enfileirar (sem esperar 5 minutos).
- WHEN o job já inseriu a versão alvo e o worker retoma THEN SHALL NÃO gerar de novo.
- WHEN o conteúdo de `instructions` falha `evaluateContent` THEN SHALL 400 antes de enfileirar.

---

## Requirement Traceability

| Requirement ID | Story                | Phase | Status  |
| -------------- | -------------------- | ----- | ------- |
| PF-01          | P1: Enfileirar letra | Tasks | Pending |
| PF-02          | P1: Enfileirar letra | Tasks | Pending |
| PF-03          | P1: Enfileirar letra | Tasks | Pending |
| PF-04          | P1: Enfileirar letra | Tasks | Pending |
| PF-05          | P1: Enfileirar letra | Tasks | Pending |
| PF-06          | P1: Enfileirar letra | Tasks | Pending |
| PF-07          | P1: Worker gera      | Tasks | Pending |
| PF-08          | P1: Worker gera      | Tasks | Pending |
| PF-09          | P1: Worker gera      | Tasks | Pending |
| PF-10          | P1: Worker gera      | Tasks | Pending |
| PF-11          | P1: Worker gera      | Tasks | Pending |
| PF-12          | P1: Worker gera      | Tasks | Pending |
| PF-13          | P1: Admin            | Tasks | Pending |
| PF-14          | P1: Admin            | Tasks | Pending |
| PF-15          | P1: Admin            | Tasks | Pending |
| PF-16          | P1: Índices          | Tasks | Pending |
| PF-17          | P1: Índices          | Tasks | Pending |
| PF-18          | P2: Fronteiras       | Tasks | Pending |
| PF-19          | P2: Fronteiras       | Tasks | Pending |
| PF-20          | P2: Contratos web    | Tasks | Pending |

**ID format:** `PF-NN`

**Coverage:** 20 total, 0 mapped to tasks, 20 unmapped ⚠️ (tasks.md preenche)

---

## Success Criteria

- [ ] Letra não bloqueia o request HTTP; poll GET cobre o resultado.
- [ ] Uma política de lock: fila Postgres + `releaseStaleJobs`.
- [ ] Adapter de letra único em `packages/providers`.
- [ ] `pnpm check` verde; nenhum provider pago chamado nesta entrega.
