# MVP Operável Validation

**Verdict**: FAIL ❌ — 36/45 critérios têm prova spec-anchored completa; nove têm implementação aparente, mas não têm a asserção precisa exigida por evidence-or-zero.
**Date**: 2026-09-04
**Spec**: `.specs/features/mvp-operavel/spec.md`
**Diff range**: `cd487b771e2f0ecbc85105454ccd86004bcd1f32..e0873f5`
**Verifier**: independent sub-agent `mvp_operavel_verifier` (author ≠ verifier)

---

## Task Completion

| Task | Status     | Notes                                                                                                      |
| ---- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| T1   | ✅ Done    | Contratos fechados têm testes exatos.                                                                      |
| T2   | ✅ Done    | Idempotência de criação foi provada e o mutant morreu.                                                     |
| T3   | ✅ Done    | Cookie assinado e pagamento por referência pública foram provados.                                         |
| T4   | ✅ Done    | Claim e histórico append-only foram provados.                                                              |
| T5   | ⚠️ Partial | FLOW-02 não prova associação específica para todos os controles enumerados.                                |
| T6   | ⚠️ Partial | Faltam asserções de polling de produção, players/downloads, histórico após recovery e confirmação de save. |
| T7   | ⚠️ Partial | Contraste de foco e regra de `h1` em todas as rotas não têm prova automatizada completa.                   |
| T8   | ⚠️ Partial | SAFE-04 não tem teste exato do log HTTP; SAFE-03 não cobre o DTO de entrega.                               |

## Spec-Anchored Acceptance Criteria

| ID       | Spec-defined outcome                                                                                   | `file:line` + assertion expression                                                                                                                                                                                                                                            | Result  |
| -------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| FLOW-01  | Uma chave de tentativa cria/reutiliza um pedido e abre revisão.                                        | `apps/api/src/flow.test.ts:189` — `expect(new Set(publicIds).size).toBe(1)`; `apps/web/e2e/mvp-operable-t5.spec.ts:55` — `expect(page).toHaveURL(/\/criar\/letra\?pedido=order-retry-123/)`                                                                                   | ✅ PASS |
| FLOW-02  | Todos os campos enumerados retêm valor, focam o primeiro inválido e têm mensagem específica associada. | `apps/web/src/public-form.test.tsx:48` — `expect(occasion).toHaveFocus()`; `:49` — `toHaveAttribute('aria-invalid', 'true')`; `:50` — `toHaveAccessibleDescription('Conte a ocasião')`. Não há asserção equivalente para nome, e-mail, homenageado, duas lembranças e aceite. | ❌ GAP  |
| FLOW-03  | Autosave anuncia estado em `role=status` sem bloquear edição.                                          | `apps/web/e2e/mvp-operable-t5.spec.ts:37` — `expect(page.getByRole('status')).toContainText('Rascunho salvo')`; o preenchimento continua em `:45-51`.                                                                                                                         | ✅ PASS |
| FLOW-04  | Reload restaura o rascunho local.                                                                      | `apps/web/e2e/mvp-operable-t5.spec.ts:39` — `expect(subject).toHaveValue('Bia')` após `page.reload()`.                                                                                                                                                                        | ✅ PASS |
| FLOW-05  | Falha após create preserva e reutiliza a tentativa.                                                    | `apps/web/e2e/mvp-operable-t5.spec.ts:56` — `expect(creationKeys).toHaveLength(2)`; `:58` — `expect(creationKeys[1]).toBe(creationKeys[0])`.                                                                                                                                  | ✅ PASS |
| GEN-01   | Duas gerações concorrentes executam uma chamada e uma recebe 409.                                      | `apps/api/src/flow.test.ts:588` — `expect(concurrent.statusCode).toBe(409)`; `:589` — `expect(control.calls.count).toBe(1)`.                                                                                                                                                  | ✅ PASS |
| GEN-02   | `lyrics_generating` anuncia “Criando sua letra”, acompanha até terminal e não permite novo POST.       | `apps/web/e2e/mvp-operable-t6.spec.ts:44` — `getByRole('status').toContainText('Criando sua letra')`; `:46` — editor se torna visível após polling; `:49` — `expect(generates).toBe(0)`.                                                                                      | ✅ PASS |
| GEN-03   | Reload em geração retoma polling sem chamar provider.                                                  | `apps/web/e2e/mvp-operable-t6.spec.ts:45` — `page.reload()`; `:49` — `expect(generates).toBe(0)`.                                                                                                                                                                             | ✅ PASS |
| GEN-04   | Claim fresco bloqueia; após cinco minutos um único claim retoma via transição válida.                  | `apps/api/src/flow.test.ts:645` — `expect(fresh.statusCode).toBe(409)`; `:655` — `expect(recovered.statusCode).toBe(200)`; `:665` — contagem de versões `toBe(1)`.                                                                                                            | ✅ PASS |
| GEN-05   | Falha pré-pagamento explica e oferece retry real.                                                      | `apps/web/e2e/mvp-operable-t6.spec.ts:79` — clique em `Tentar gerar novamente`; `:81` — editor visível; `apps/api/src/flow.test.ts:567` — status `toBe('lyrics_ready')`.                                                                                                      | ✅ PASS |
| GEN-06   | Renderiza maior versão sem mutar histórico.                                                            | `apps/web/src/order-journey.test.ts:59` — `expect(latestLyrics(...).title).toBe('Sete')`; `:60` — ordem original permanece `[2, 7, 4]`; `apps/api/src/flow.test.ts:380` — versões históricas exatas.                                                                          | ✅ PASS |
| LYRIC-01 | Save anexa versão, confirma sucesso e não muta anteriores.                                             | `apps/api/src/flow.test.ts:357` — resposta `{ number: generatedNumber + 1, kind: 'edited' }`; `:380-387` prova histórico. A UI contém `Nova versão salva`, mas nenhuma suíte a afirma após save bem-sucedido.                                                                 | ❌ GAP  |
| LYRIC-02 | Aprovar texto alterado anexa e aprova exatamente o texto visível.                                      | `apps/api/src/flow.test.ts:331` — `expect(approvedLyric?.content.fullLyrics).toBe('Versão editada...')`; `:334` — número seguinte e `kind: 'approved'`.                                                                                                                       | ✅ PASS |
| LYRIC-03 | Falha preserva texto, mantém revisão e mostra `role=alert`.                                            | `apps/web/e2e/mvp-operable-t6.spec.ts:84` — alerta contém falha; `:85` — editor mantém `Texto que não pode sumir`; `:197-198` cobre aprovação.                                                                                                                                | ✅ PASS |
| LYRIC-04 | Durante save/approve, ambas ações ficam desabilitadas e nomeadas.                                      | `apps/web/e2e/mvp-operable-t6.spec.ts:189-190` — ambos botões desabilitados no save; `:195-196` — ambos desabilitados na aprovação.                                                                                                                                           | ✅ PASS |
| PAY-01   | Landing e checkout usam o mesmo preço em centavos da API; falha não inventa preço.                     | `apps/web/e2e/mvp-operable-t5.spec.ts:79` e `:81` — ambas exibem `R$ 67,89`; `:89` — main não contém `R$` em falha.                                                                                                                                                           | ✅ PASS |
| PAY-02   | Repetir checkout reutiliza preferência e mantém um pagamento pendente.                                 | `apps/api/src/flow.test.ts:244` — respostas iguais; `:249` — contagem `toBe(1)`.                                                                                                                                                                                              | ✅ PASS |
| PAY-03   | Fallback local autorizado por cookie/publicId cria um job em retries.                                  | `apps/api/src/flow.test.ts:271,277` — duas confirmações retornam 200; `:283` — status `audio_queued`; `:288` — jobs `toBe(1)`.                                                                                                                                                | ✅ PASS |
| PAY-04   | Sem cookie, confirmação retorna 401 e não altera pedido, pagamento ou fila.                            | `apps/api/src/flow.test.ts:254` — status 401; `:261-265` — estado exato `payment_pending/pending/jobs:0`.                                                                                                                                                                     | ✅ PASS |
| PAY-05   | Confirmação pendente anuncia texto e desabilita CTA.                                                   | `apps/web/e2e/mvp-operable-t5.spec.ts:115` — status `Confirmando pagamento`; `:116` — CTA `toBeDisabled()`.                                                                                                                                                                   | ✅ PASS |
| ASYNC-01 | Cada status de produção destaca etapa 4 e atualiza por polling.                                        | `apps/web/src/order-journey.test.ts:12-16` + `:22` provam etapa/kind dos cinco estados. Não há asserção de requisições repetidas de polling em `OrderStatus` para esses estados.                                                                                              | ❌ GAP  |
| ASYNC-02 | `delivered` com duas variantes conclui cinco etapas e oferece dois players e downloads.                | `apps/web/e2e/mvp-operable-t6.spec.ts:142` — cinco `Concluído`; `:143` — link `Ouvir versões`. Nenhum E2E abre o player e afirma dois `<audio>` e dois links de download.                                                                                                     | ❌ GAP  |
| ASYNC-03 | Falha paga informa falha, não promete auto-regeneração e orienta acompanhar.                           | `apps/web/e2e/mvp-operable-t6.spec.ts:115-117` — título, orientação e ausência de `automatic\|sem custo\|vamos regerar`.                                                                                                                                                      | ✅ PASS |
| ASYNC-04 | Troca de link registra `publicId` no histórico e remove token da URL.                                  | `apps/web/e2e/mvp-flows.spec.ts:181` — URL final `/pedido/order-recovered-1` prova remoção do token. Não há asserção de `localStorage['resenha:my-orders']` após a troca.                                                                                                     | ❌ GAP  |
| ASYNC-05 | Reload deriva conteúdo e ação apenas de status conhecido.                                              | `apps/web/src/order-journey.test.ts:5-23` — matriz fechada de status/etapa/kind; `apps/web/e2e/mvp-operable-t6.spec.ts:115-117` prova saída observável.                                                                                                                       | ✅ PASS |
| ASYNC-06 | Status ausente/desconhecido mostra inconsistência e não vira produção.                                 | `apps/web/src/order-journey.test.ts:45-50` — ambos retornam `unknown_status`; `apps/web/e2e/mvp-operable-t6.spec.ts:105-110` — alerta e zero botões.                                                                                                                          | ✅ PASS |
| ASYNC-07 | Histórico vazio explica escopo do navegador e oferece criação.                                         | `apps/web/e2e/mvp-operable-t6.spec.ts:148-152` — título, texto `neste navegador` e link `/criar`.                                                                                                                                                                             | ✅ PASS |
| A11Y-01  | Troca de pathname rola a zero e foca `main[tabIndex=-1]`.                                              | `apps/web/e2e/mvp-operable-t7.spec.ts:32-34` — foco, tabindex e `scrollY` zero.                                                                                                                                                                                               | ✅ PASS |
| A11Y-02  | Foco por teclado tem contorno com contraste ≥3:1.                                                      | `apps/web/src/styles.css:538-540` declara outline verde de 3 px, mas não existe asserção de `getComputedStyle`/razão de contraste.                                                                                                                                            | ❌ GAP  |
| A11Y-03  | Menu sincroniza nome/expansão/visibilidade; Escape fecha e restaura foco.                              | `apps/web/e2e/mvp-operable-t7.spec.ts:7-20` — `aria-expanded`, nomes, navegação, overflow, Escape e foco.                                                                                                                                                                     | ✅ PASS |
| A11Y-04  | Em 390 px não há overflow e CTAs medem ao menos 44 × 44.                                               | `apps/web/e2e/mvp-operable-t7.spec.ts:47` — `{ clientWidth:390, scrollWidth:390 }`; `:50-51` — altura/largura ≥44.                                                                                                                                                            | ✅ PASS |
| A11Y-05  | Toda rota tem um `h1`, line-height ≥1.05 e tracking legível.                                           | `apps/web/e2e/mvp-operable-t7.spec.ts:55-58` mede line-height apenas na landing; `:91-92` conta `main/h1` apenas em uma rota de erro. Não há matriz de todas as rotas nem asserção de tracking/espaços.                                                                       | ❌ GAP  |
| A11Y-06  | Loading, erro, vazio e sucesso têm texto explícito, não só cor/ícone.                                  | `apps/web/e2e/mvp-operable-t6.spec.ts:44` — loading textual; `:105` — erro em alert; `:148-152` — vazio; `:140-143` — sucesso textual.                                                                                                                                        | ✅ PASS |
| A11Y-07  | Reduced motion remove animação decorativa.                                                             | `apps/web/e2e/mvp-operable-t7.spec.ts:77-82` — animationName difere de `none` e vira `none` em reduce.                                                                                                                                                                        | ✅ PASS |
| SAFE-01  | Produtos públicos contêm só `type,name,priceCents,active`.                                             | `apps/api/src/flow.test.ts:713-714` — `expect(Object.keys(product).sort()).toEqual([...])`; `packages/contracts/src/index.test.ts:107-114` rejeita `id`.                                                                                                                      | ✅ PASS |
| SAFE-02  | Checkout omite payment UUID, IDs, hashes e tokens.                                                     | `apps/api/src/flow.test.ts:235-238` — igualdade exata `{checkoutUrl,dev}`; `packages/contracts/src/index.test.ts:135-139` rejeita `paymentId`.                                                                                                                                | ✅ PASS |
| SAFE-03  | Todas as respostas públicas de pedido, letra, áudio e entrega omitem internos/PII.                     | `apps/api/src/flow.test.ts:710,732-738` prova create, order, lyrics e audio com chaves exatas. Não há teste de chaves exatas de `GET /deliveries/:token` nem de seu payload de letra/áudio.                                                                                   | ❌ GAP  |
| SAFE-04  | Logs HTTP/assíncronos contêm somente contexto operacional permitido.                                   | `apps/worker/src/worker.test.ts:56-64` prova objeto exato e ausência de IDs internos no worker. Não há captura/asserção equivalente do log HTTP; `apps/api/src/app.ts:133-138` inclui `method` além da lista fechada da spec.                                                 | ❌ GAP  |
| SAFE-05  | Falha externa persiste erro sanitizado ≤500 sem detalhe privado.                                       | `apps/api/src/flow.test.ts:546` — resposta não contém detalhe; `:553` — sem newline; `:554` — comprimento 500.                                                                                                                                                                | ✅ PASS |
| SAFE-06  | Produção falha ao iniciar sem credenciais obrigatórias por processo.                                   | `apps/api/src/env.test.ts:24-26` — OpenRouter; `:30-38` — Mercado Pago; `apps/worker/src/worker.test.ts:30-36` — Resend em produção; `:21-26` — pepper/OpenRouter.                                                                                                            | ✅ PASS |
| SAFE-07  | Cookies literais forjados retornam 401; só assinatura válida concede acesso.                           | `apps/api/src/flow.test.ts:691,697` — cookies forjados 401; `:210` — cookie emitido permite mutação.                                                                                                                                                                          | ✅ PASS |
| TEST-01  | E2E afirma história, letra, preço, produção e entrega sob status conhecidos.                           | `apps/web/e2e/mvp-flows.spec.ts:72-88` afirma história→produção com status conhecidos; `apps/web/e2e/mvp-operable-t6.spec.ts:134-143` afirma entrega parcial/completa.                                                                                                        | ✅ PASS |
| TEST-02  | Regressões de criação, geração, checkout/job falham testes.                                            | Sensor M2/M3/M4 abaixo falhou respectivamente em `flow.test.ts:189`, `:645` e `:288`; checkout repetido também é afirmado em `:244-249`.                                                                                                                                      | ✅ PASS |
| TEST-03  | Regressões de scroll, foco, menu e estados acessíveis falham.                                          | `apps/web/e2e/mvp-operable-t7.spec.ts:7-20,32-34` tem valores exatos; `apps/web/e2e/mvp-operable-t6.spec.ts:105-110` rejeita estado inválido.                                                                                                                                 | ✅ PASS |
| TEST-04  | Gate final inclui check, migrations/seed, E2E, Doctor e UAT nos dois viewports.                        | Execução independente: Build gate exit 0, 95 Vitest + 24 Playwright; migrate/seed 2× em dev e test, todos exit 0; React Doctor exit 0 com 71/100 e quatro warnings; `mvp-operable-t7.spec.ts:37-120` cobre 390×844/1280×720.                                                  | ✅ PASS |

**Status**: ❌ 36/45 matched; 9 gaps; 0 spec-precision gaps (a spec é precisa, a prova está incompleta).

## Discrimination Sensor

O sensor P0-full rodou no worktree temporário `/tmp/music-verifier.9vUAC5/sensor`, criado em `e0873f5` e removido após restauração. O status real antes e depois permaneceu idêntico: somente `apps/web/src/admin/routes.tsx`, screenshots `before/04`, `before/06`, `before/09` e `var/logs/{api,web,worker}.log` modificados.

| Mutation         | File:line                             | Fault injected                                                | Target assertion/result                                                            | Killed?   |
| ---------------- | ------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------- |
| M1 auth          | `apps/api/src/app.ts:254`             | Aceitar cookie literal `value === '1'`.                       | `flow.test.ts:691`: esperado 401, recebeu 200.                                     | ✅ Killed |
| M2 criação       | `apps/api/src/app.ts:335`             | Salgar cada hash com `nanoid()`, quebrando reuse.             | `flow.test.ts:189`: esperado 1 `publicId`, recebeu 3.                              | ✅ Killed |
| M3 claim         | `apps/api/src/app.ts:434`             | Remover limite temporal do reclaim fresco.                    | `flow.test.ts:645`: esperado 409, recebeu 200.                                     | ✅ Killed |
| M4 pagamento/job | `apps/api/src/app.ts:772,776,789`     | Reprocessar pagamento aprovado e usar chave de job aleatória. | `flow.test.ts:288`: esperado 1 job, recebeu 2.                                     | ✅ Killed |
| M5 entrega UI    | `apps/web/src/order-journey.ts:63`    | Aceitar entrega com uma variante.                             | `order-journey.test.ts:41`: esperado `inconsistent_delivery`, recebeu `delivered`. | ✅ Killed |
| M6 estado UI     | `apps/web/src/order-journey.ts:42-43` | Aceitar qualquer string como status.                          | `order-journey.test.ts:46`: esperado `unknown_status`, recebeu `production`.       | ✅ Killed |

**Sensor depth**: P0-full manual, seis mutações cobrindo auth, criação, claim, pagamento/job e estado/entrega UI.
**Result**: 6/6 killed, 0 survived — PASS ✅

## Edge Cases

- [x] Storage indisponível: `apps/web/src/submission-attempt.test.ts:36-37` mantém chave e não lança; `apps/web/src/my-orders.test.ts:52-56` degrada com segurança.
- [x] Catálogo falha: `apps/web/e2e/mvp-operable-t5.spec.ts:88-89` mostra fallback e nenhum preço numérico.
- [x] Uma variante não entrega: `apps/worker/src/flow.test.ts:265-277` mantém `audio_generating`, sem delivery; E2E mostra entrega incompleta.
- [x] Cookie de outro/sem acesso: `apps/api/src/flow.test.ts:684-697` retorna 401 sem revelar conteúdo.
- [x] Versões em ordem decrescente e maior como atual: `apps/api/src/flow.test.ts:380-387` e `apps/web/src/order-journey.test.ts:59-60`.

## Gate Check

- **Gate command**: `corepack pnpm check && corepack pnpm test:e2e`
- **Result**: exit 0; format, lint, typecheck, tests e builds passaram; 95/95 Vitest e 24/24 Playwright passaram; 0 failed; 0 skipped.
- **Vitest atual**: contracts 7, domain 7, API 29, worker 13, web 39 = 95.
- **Test count before feature**: 62 Vitest (contracts 3, domain 7, API 26, worker 12, web 14) e 8 Playwright.
- **Test count after feature**: 95 Vitest e 24 Playwright.
- **Delta**: +33 Vitest, +16 Playwright. Nenhuma suíte/package perdeu testes.
- **Integrity**: diff das suítes substitui expectativas por contratos mais estritos; não há `.skip`, exclusão de teste ou asserção enfraquecida detectada.
- **DB replay**: `db:migrate` 2× + `db:seed` 2× em `resenha`, e o mesmo em `resenha_test`, todos exit 0.
- **React Doctor**: exit 0, score 71/100, três warnings de complexidade e um warning de invalidação. A invalidação é falso positivo: create não possui query anterior e navega para um `publicId` novo. Complexidade de `LyricsReview`/`OrderStatus` fica como dívida P2.
- **Known non-blocking warning**: bundle público 671.33 kB (192.28 kB gzip).

## Interactive UAT Evidence

| #   | Test                                  | Result  | Details                                                                                               |
| --- | ------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| 1   | Jornada nominal controlada            | ✅ Pass | `mvp-flows.spec.ts:72-88`, Chromium.                                                                  |
| 2   | Erro, retry, reload e estado inválido | ✅ Pass | `mvp-operable-t6.spec.ts:22-198`.                                                                     |
| 3   | Desktop 1280 × 720                    | ✅ Pass | Capturas em `docs/audits/mvp-operavel/after/01-entrada-desktop.png` e `09-processamento-desktop.png`. |
| 4   | Mobile 390 × 844 e teclado            | ✅ Pass | `mvp-operable-t7.spec.ts:3-58,95-120`.                                                                |

## Code Quality

| Principle                                   | Status | Evidence                                                                                                                               |
| ------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Minimum code / no needless abstraction      | ✅     | Funções e helpers locais; nenhuma camada service/DI nova.                                                                              |
| Surgical changes / no unrelated improvement | ✅     | Diff acompanha as oito tarefas; capa por IA ficou somente em backlog solicitado.                                                       |
| Matches project patterns                    | ✅     | Zod, Fastify inject, Drizzle, React Query e funções puras existentes.                                                                  |
| Test integrity                              | ✅     | Contagem cresceu 62→95 e 8→24; nenhuma exclusão/skip; assertions ficaram mais exatas.                                                  |
| Spec-anchored outcomes                      | ❌     | Nove critérios não têm expressão assertiva completa.                                                                                   |
| Per-layer coverage expectation              | ❌     | DTO de delivery e logger HTTP não têm testes de chaves/contexto exatos; há quatro lacunas UI funcionais.                               |
| Every in-scope test claimed                 | ✅     | Novos testes mapeiam ACs, edge cases ou Done-when.                                                                                     |
| Guidelines                                  | ✅     | `AGENTS.md`, `README.md`, `.github/workflows/ci.yml` e matriz de `tasks.md` seguidos.                                                  |
| Senior approval                             | ⚠️     | Comportamento crítico está bem protegido, mas os nove gaps impedem aprovação final; Doctor mantém dois componentes públicos complexos. |

`git diff --check` também sinaliza trailing spaces usados como quebras Markdown em artefatos de spec/auditoria. O gate Prettier aceita esses arquivos; é higiene não bloqueante.

## Ranked Gaps and Fix Plan

1. **P0 — SAFE-04**: capturar o logger Fastify em teste, afirmar conjunto exato de campos permitidos e remover/justificar `method` frente ao “apenas” da spec.
2. **P1 — SAFE-03**: criar integração de entrega válida que compare exatamente chaves do DTO de delivery, lyrics e audio.
3. **P1 — ASYNC-02**: abrir `/pedido/:id/entrega` no E2E e afirmar exatamente dois players e dois downloads.
4. **P1 — ASYNC-01**: contar GETs em polling para `paid/audio_queued/audio_generating/review_required` e provar parada no terminal.
5. **P1 — ASYNC-04**: após exchange, afirmar `resenha:my-orders` contém o `publicId` e a URL não contém token.
6. **P1 — FLOW-02**: parametrizar campos inválidos para provar mensagem/ARIA específica de cada controle enumerado.
7. **P1 — LYRIC-01**: adicionar caminho de save bem-sucedido e afirmar `role=status` com “Nova versão salva”.
8. **P1 — A11Y-02**: medir outline/background via `getComputedStyle` e afirmar razão WCAG ≥3:1 sob foco de teclado.
9. **P1 — A11Y-05**: percorrer todas as rotas públicas, afirmar um `h1`, line-height ≥1.05 e tracking sem colapsar espaços.

## Requirement Traceability Update

Recomendação ao autor: manter `Done` para 36 requisitos e mover `FLOW-02`, `LYRIC-01`, `ASYNC-01`, `ASYNC-02`, `ASYNC-04`, `A11Y-02`, `A11Y-05`, `SAFE-03` e `SAFE-04` para `Needs Fix` até revalidação.

## Summary

**Overall**: ❌ Not Ready. O runtime passou todos os gates e o sensor matou 6/6 regressões críticas, mas evidence-or-zero não permite PASS com nove resultados parcialmente testados.

**Spec-anchored check**: 36/45 ACs matched, 9 gaps, 0 spec-precision gaps.
**Sensor**: 6/6 killed.
**Gate**: 119 tests passed (95 Vitest + 24 Playwright), 0 failed, 0 skipped.
