# MVP Operável Validation

**Verdict**: FAIL ❌ — os 45/45 critérios de aceitação têm prova spec-anchored e o sensor matou 10/10 mutações, mas T8 continua parcial: a documentação ainda promete `method` no log HTTP após F1 removê-lo para cumprir SAFE-04.
**Date**: 2026-09-04
**Spec**: `.specs/features/mvp-operavel/spec.md`
**Diff range**: `cd487b771e2f0ecbc85105454ccd86004bcd1f32..5a944f0`
**Verifier**: independent fresh sub-agent `mvp_operavel_verifier_round2` (author ≠ verifier)
**Round**: 2 of at most 3 fix→reverify iterations

---

## Previous Round

A rodada 1, em `e0873f5`, ficou em FAIL com 36/45 ACs e nove gaps de evidence-or-zero: FLOW-02, LYRIC-01, ASYNC-01/02/04, A11Y-02/05 e SAFE-03/04. F1–F3 adicionaram as provas faltantes. Esta rodada rederivou todos os 45 critérios e confirmou que os nove gaps foram fechados.

## Task Completion

| Task | Status     | Independent evidence                                                                                                                                                                |
| ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | ✅ Done    | Contratos fechados e rejeição de campos/status em `packages/contracts/src/index.test.ts:70-139`.                                                                                    |
| T2   | ✅ Done    | Um hash/pedido/evento por tentativa em `apps/api/src/flow.test.ts:174-210`; sensor M8.                                                                                              |
| T3   | ✅ Done    | Cookie assinado, checkout sem UUID e job único em `apps/api/src/flow.test.ts:213-288,708-766`.                                                                                      |
| T4   | ✅ Done    | Claim temporal e versões append-only em `apps/api/src/flow.test.ts:291-387,598-693`; sensor M9.                                                                                     |
| T5   | ✅ Done    | Draft, validação completa, retry e preço em `apps/web/src/public-form.test.tsx:38-105` e `apps/web/e2e/mvp-operable-t5.spec.ts:3-118`.                                              |
| T6   | ✅ Done    | Polling, falhas, entrega e recovery em `apps/web/e2e/mvp-operable-t6.spec.ts:22-261` e `apps/web/e2e/mvp-flows.spec.ts:162-185`.                                                    |
| T7   | ✅ Done    | Foco, contraste, headings, 390 px e motion em `apps/web/e2e/mvp-operable-t7.spec.ts:24-204`.                                                                                        |
| T8   | ❌ Partial | Gates e UAT passam, mas `README.md:66` e `docs/runbook.md:25` ainda dizem que o log HTTP inclui método; o runtime permitido não inclui esse campo em `apps/api/src/app.ts:120-144`. |
| F1   | ✅ Done    | DTO de entrega e contexto HTTP exatos em `apps/api/src/flow.test.ts:449-476` e `apps/api/src/app.test.ts:24-29`.                                                                    |
| F2   | ✅ Done    | Os cinco gaps funcionais têm asserções em `public-form.test.tsx:54-80`, `mvp-operable-t6.spec.ts:88-207` e `mvp-flows.spec.ts:179-185`.                                             |
| F3   | ✅ Done    | Contraste calculado e matriz de rotas em `mvp-operable-t7.spec.ts:58-147`.                                                                                                          |

## Spec-Anchored Acceptance Criteria

| ID       | Spec-defined outcome                                                                                | `file:line` + assertion expression                                                                                                                                                                                     | Result    |
| -------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FLOW-01  | Uma tentativa cria/reutiliza um pedido e abre revisão.                                              | `apps/api/src/flow.test.ts:183-202` — `expect(new Set(publicIds).size).toBe(1)` e um evento; `apps/web/e2e/mvp-operable-t5.spec.ts:55-58` — URL de revisão e chaves iguais.                                            | ✅ PASS   |
| FLOW-02  | Campos enumerados permanecem, primeiro inválido recebe foco e cada controle tem mensagem associada. | `apps/web/src/public-form.test.tsx:38-51` — valor restaurado/foco; `:54-80` — loop afirma `aria-invalid='true'` e `toHaveAccessibleDescription(message)` para homenageado, ocasião, nome, e-mail, lembranças e termos. | ✅ PASS   |
| FLOW-03  | Autosave anuncia status sem bloquear edição.                                                        | `apps/web/e2e/mvp-operable-t5.spec.ts:34-50` — `role=status` contém `Rascunho salvo` e preenchimento prossegue.                                                                                                        | ✅ PASS   |
| FLOW-04  | Reload restaura draft local.                                                                        | `apps/web/e2e/mvp-operable-t5.spec.ts:34-39` — após `page.reload()`, `expect(subject).toHaveValue('Bia')`.                                                                                                             | ✅ PASS   |
| FLOW-05  | Falha remota preserva a tentativa e reutiliza o pedido.                                             | `apps/web/e2e/mvp-operable-t5.spec.ts:52-58` — falha/retry, duas chaves e `creationKeys[1] === creationKeys[0]`; API prova um pedido em `flow.test.ts:189`.                                                            | ✅ PASS   |
| GEN-01   | Concorrência concede um claim e uma chamada.                                                        | `apps/api/src/flow.test.ts:598-617` — primeiro 200, concorrente 409 e `calls.count === 1`.                                                                                                                             | ✅ PASS   |
| GEN-02   | `lyrics_generating` anuncia, bloqueia POST e polla até terminal.                                    | `apps/web/e2e/mvp-operable-t6.spec.ts:22-49` — texto vivo, editor após polling e `generates === 0`.                                                                                                                    | ✅ PASS   |
| GEN-03   | Reload retoma polling sem chamar provider.                                                          | `apps/web/e2e/mvp-operable-t6.spec.ts:43-49` — `page.reload()`, editor aparece e `generates === 0`.                                                                                                                    | ✅ PASS   |
| GEN-04   | Claim fresco bloqueia; após cinco minutos só um reclaim prossegue.                                  | `apps/api/src/flow.test.ts:663-693` — fresco 409, seis minutos 200 e uma versão; sensor M9 remove o limite e é morto.                                                                                                  | ✅ PASS   |
| GEN-05   | Falha pré-pagamento explica e oferece retry real.                                                   | `apps/web/e2e/mvp-operable-t6.spec.ts:52-81` — clique em `Tentar gerar novamente` torna editor visível; `apps/api/src/flow.test.ts:565-595` termina `lyrics_ready`.                                                    | ✅ PASS   |
| GEN-06   | Maior versão é atual e histórico não muda.                                                          | `apps/web/src/order-journey.test.ts:53-60` — retorna título da versão 7 e preserva `[2,7,4]`; `apps/api/src/flow.test.ts:380-387` compara três conteúdos/versões.                                                      | ✅ PASS   |
| LYRIC-01 | Save anexa versão, confirma e preserva anteriores.                                                  | `apps/api/src/flow.test.ts:341-387` — nova versão e histórico exato; `apps/web/e2e/mvp-operable-t6.spec.ts:88-103` — `role=status` é `Nova versão salva.`                                                              | ✅ PASS   |
| LYRIC-02 | Aprovação de texto não salvo anexa e aprova exatamente o visível.                                   | `apps/api/src/flow.test.ts:291-338` — conteúdo exato, número `+1`, kind `approved` e original intacto.                                                                                                                 | ✅ PASS   |
| LYRIC-03 | Erro preserva texto, rota e alerta acionável.                                                       | `apps/web/e2e/mvp-operable-t6.spec.ts:82-85,247-261` — alertas e editor mantém o texto em save/approve.                                                                                                                | ✅ PASS   |
| LYRIC-04 | Save/approve pendentes nomeiam e desabilitam ambas as ações.                                        | `apps/web/e2e/mvp-operable-t6.spec.ts:251-259` — quatro botões nomeados usam `toBeDisabled()`.                                                                                                                         | ✅ PASS   |
| PAY-01   | Landing/checkout usam o mesmo preço da API; falha não inventa valor.                                | `apps/web/e2e/mvp-operable-t5.spec.ts:64-89` — ambos mostram `R$ 67,89`; falha mostra `Preço indisponível` e main não contém `R$`.                                                                                     | ✅ PASS   |
| PAY-02   | Checkout repetido reutiliza uma preferência/pagamento.                                              | `apps/api/src/flow.test.ts:239-249` — respostas iguais e contagem de pagamentos `1`.                                                                                                                                   | ✅ PASS   |
| PAY-03   | Fallback dev autorizado por cookie/publicId cria um job em retries.                                 | `apps/api/src/flow.test.ts:266-288` — duas confirmações 200, status `audio_queued`, jobs `1`; sensor M10.                                                                                                              | ✅ PASS   |
| PAY-04   | Sem cookie retorna 401 e não muda pagamento/pedido/fila.                                            | `apps/api/src/flow.test.ts:250-265` — 401 e objeto exato `payment_pending/pending/jobs:0`.                                                                                                                             | ✅ PASS   |
| PAY-05   | Confirmação pendente anuncia e desabilita CTA.                                                      | `apps/web/e2e/mvp-operable-t5.spec.ts:112-116` — status `Confirmando pagamento` e botão desabilitado.                                                                                                                  | ✅ PASS   |
| ASYNC-01 | Estados ativos destacam produção e atualizam por polling.                                           | `apps/web/src/order-journey.test.ts:5-22` — paid/queued/generating/review/revision são etapa 4 `production`; `apps/web/e2e/mvp-operable-t6.spec.ts:106-137` — seis leituras até delivered e nenhuma após 2,2 s.        | ✅ PASS   |
| ASYNC-02 | Delivered com duas variantes conclui cinco etapas e oferece dois players/downloads.                 | `apps/web/e2e/mvp-operable-t6.spec.ts:172-206` — cinco `Concluído`, dois `<audio>`, dois downloads e hrefs das variantes 1/2.                                                                                          | ✅ PASS   |
| ASYNC-03 | Falha paga é honesta e não promete retry automático.                                                | `apps/web/e2e/mvp-operable-t6.spec.ts:164-169` — heading/orientação e ausência de `automatic                                                                                                                           | sem custo | vamos regerar`; regra pura em `order-journey.test.ts:29-34`. | ✅ PASS |
| ASYNC-04 | Exchange registra histórico e remove token da URL.                                                  | `apps/web/e2e/mvp-flows.spec.ts:179-185` — pathname exato `/pedido/order-recovered-1` e localStorage exato `['order-recovered-1']`; sensor M5.                                                                         | ✅ PASS   |
| ASYNC-05 | Reload deriva saída exclusivamente de status conhecido.                                             | `apps/web/src/order-journey.test.ts:5-22` — matriz fechada de 13 estados não delivered; `:37-50` cobre delivered/invalid; E2E recarrega em `mvp-operable-t6.spec.ts:160-167`.                                          | ✅ PASS   |
| ASYNC-06 | Status ausente/desconhecido mostra inconsistência, não produção.                                    | `apps/web/src/order-journey.test.ts:44-50` — ambos retornam `{valid:false,reason:'unknown_status'}`; `apps/web/e2e/mvp-operable-t6.spec.ts:140-162` — alerta e zero botões.                                            | ✅ PASS   |
| ASYNC-07 | Histórico vazio explica navegador e oferece criação.                                                | `apps/web/e2e/mvp-operable-t6.spec.ts:209-216` — título, texto `neste navegador` e link `/criar`.                                                                                                                      | ✅ PASS   |
| A11Y-01  | Pathname novo rola a zero e foca main fora do Tab normal.                                           | `apps/web/e2e/mvp-operable-t7.spec.ts:44-55` — main focado, `tabindex=-1`, `scrollY=0`.                                                                                                                                | ✅ PASS   |
| A11Y-02  | Foco por teclado tem contraste de contorno ≥3:1.                                                    | `apps/web/e2e/mvp-operable-t7.spec.ts:58-74` — estilo/3 px e `expect(contrast(...)).toBeGreaterThanOrEqual(3)`; sensor M6.                                                                                             | ✅ PASS   |
| A11Y-03  | Menu sincroniza nome/expansão/visibilidade; Escape fecha e restaura foco.                           | `apps/web/e2e/mvp-operable-t7.spec.ts:24-41` — nomes Abrir/Fechar, `aria-expanded`, nav/overflow e foco após Escape.                                                                                                   | ✅ PASS   |
| A11Y-04  | 390 px sem overflow e CTA ≥44×44.                                                                   | `apps/web/e2e/mvp-operable-t7.spec.ts:149-163` — `{clientWidth:390,scrollWidth:390}` e box ≥44 nas duas dimensões.                                                                                                     | ✅ PASS   |
| A11Y-05  | Cada rota pública tem um h1, line-height ≥1.05 e tracking legível.                                  | `apps/web/e2e/mvp-operable-t7.spec.ts:77-147` — 12 rotas; `toHaveCount(1)`, visível, line-height ratio ≥1.05, tracking ≥−0.04em e sem palavra contínua de 45 chars; sensor M7.                                         | ✅ PASS   |
| A11Y-06  | Loading, erro, vazio e sucesso usam texto explícito.                                                | `apps/web/e2e/mvp-operable-t6.spec.ts:44,157-169,186-206,209-216` — texto em status/alert/entrega/vazio, não apenas cor/ícone.                                                                                         | ✅ PASS   |
| A11Y-07  | Reduced motion remove animação decorativa.                                                          | `apps/web/e2e/mvp-operable-t7.spec.ts:173-194` — animationName ativo e depois `none` sob reduce.                                                                                                                       | ✅ PASS   |
| SAFE-01  | Produto público contém só type/name/priceCents/active.                                              | `apps/api/src/flow.test.ts:739-742` — chaves exatas; `packages/contracts/src/index.test.ts:92-114` — projeção e rejeição de `id`.                                                                                      | ✅ PASS   |
| SAFE-02  | Checkout omite UUID/IDs/hashes/tokens.                                                              | `apps/api/src/flow.test.ts:234-238` — resposta exata `{checkoutUrl,dev}`; `packages/contracts/src/index.test.ts:127-139` rejeita `paymentId`.                                                                          | ✅ PASS   |
| SAFE-03  | Pedido, letra, áudio e entrega omitem internos/PII.                                                 | `apps/api/src/flow.test.ts:729-766` — chaves exatas create/order/lyrics/audio; `:449-476` — chaves exatas delivery/lyrics/content/audio; sensor M2 injeta `internalOrderId`.                                           | ✅ PASS   |
| SAFE-04  | Logs HTTP/worker usam somente contexto operacional permitido.                                       | `apps/api/src/app.test.ts:24-29` — HTTP exato `{route,statusCode,latencyMs}`; `apps/worker/src/worker.test.ts:41-64` — worker exato e sem IDs; `apps/api/src/app.ts:136-145` usa somente o helper; sensor M1.          | ✅ PASS   |
| SAFE-05  | Falha externa persiste erro sanitizado ≤500 sem detalhe privado.                                    | `apps/api/src/flow.test.ts:573-582` — body sem detalhe, erro sem newline e `toHaveLength(500)`.                                                                                                                        | ✅ PASS   |
| SAFE-06  | Produção falha na inicialização sem credenciais obrigatórias.                                       | `apps/api/src/env.test.ts:23-38` — OpenRouter/Mercado Pago; `apps/worker/src/worker.test.ts:20-36` — pepper/OpenRouter/Resend com `toThrow`.                                                                           | ✅ PASS   |
| SAFE-07  | Cookie literal forjado recebe 401; assinado funciona.                                               | `apps/api/src/flow.test.ts:203-210` — cookie emitido permite mutação; `:708-726` — full/view literais retornam 401.                                                                                                    | ✅ PASS   |
| TEST-01  | E2E afirma história, letra, preço, produção e entrega sob status conhecidos.                        | `apps/web/e2e/mvp-flows.spec.ts:67-88` — jornada até produção/preço; `apps/web/e2e/mvp-operable-t6.spec.ts:172-206` — entrega completa/partial.                                                                        | ✅ PASS   |
| TEST-02  | Regressões de criação, geração, checkout e job único fazem testes falhar.                           | Sensor M8 (`flow.test.ts:189`), M9 (`:616,673`) e M10 (`:288`) matou criação, claim e pagamento/job; checkout repetido tem igualdade/contagem em `:239-249`.                                                           | ✅ PASS   |
| TEST-03  | Regressões de scroll, foco, menu e estados acessíveis falham.                                       | Sensores M3/M6/M7 e assertions `mvp-operable-t7.spec.ts:24-74,77-147`; scroll/menu têm valores exatos em `:28-55`.                                                                                                     | ✅ PASS   |
| TEST-04  | Gate final cobre check, E2E, DB, Doctor e UAT nos viewports.                                        | `package.json:11-23` define check/test:E2E/migrate/seed; execução independente abaixo passou 97+28; `mvp-operable-t7.spec.ts:149-232` prova mobile/desktop; evidência operacional anterior registra DB/Doctor.         | ✅ PASS   |

**Acceptance status**: ✅ 45/45 matched; 0 uncovered; 0 spec-precision gaps.

## Edge Cases

- [x] Storage indisponível: `apps/web/src/submission-attempt.test.ts:28-37` preserva chave/sem throw; `apps/web/src/my-orders.test.ts:47-56` degrada para vazio.
- [x] Catálogo falha: `apps/web/e2e/mvp-operable-t5.spec.ts:83-89` mostra fallback e nenhum preço numérico.
- [x] Uma variante não entrega: `apps/worker/src/flow.test.ts:242-277` mantém `audio_generating` e zero deliveries; E2E bloqueia em `mvp-operable-t6.spec.ts:172-186`.
- [x] Cookie alheio/sem acesso: `apps/api/src/flow.test.ts:708-725` retorna 401 sem conteúdo privado.
- [x] Versões decrescentes/maior atual: `apps/api/src/flow.test.ts:380-387` e `apps/web/src/order-journey.test.ts:53-60`.

## Gate Check

- **Exact command**: `corepack pnpm check && corepack pnpm test:e2e`, com o PATH solicitado.
- **Result**: exit 0 em 2026-09-04; format, lint, typecheck, testes, build e E2E passaram.
- **Vitest**: 97/97, 0 failed, 0 skipped: contracts 7, domain 7, API 30, worker 13, web 40.
- **Playwright**: 28/28, 0 failed, 0 skipped, Chromium, 33.5 s.
- **Before feature**: 62 Vitest + 8 Playwright. **Delta**: +35 Vitest e +20 Playwright; nenhuma suíte perdeu testes.
- **Integrity**: nenhuma ocorrência de `.skip`; asserções foram adicionadas/estreitadas. `git diff --check` aponta somente dois espaços finais deliberados para hard breaks Markdown em artefatos; o gate Prettier passa.
- **Operational evidence retained**: migrate/seed 2× em dev e test, React Doctor exit 0 (71/100), API/web/worker ativos e UAT nos dois viewports estão registrados na rodada 1 e em `docs/audits/mvp-operavel/final.md:7-47`.
- **Non-blocking debt**: bundle público ~671 kB; quatro warnings do Doctor; Fastify 6; browsers/leitor de tela real/providers externos não validados.

## Discrimination Sensor

Worktree temporário em `/tmp/music-verifier2.ta3cip/sensor`, detached em `5a944f0`, removido ao final. Cada mutação válida foi restaurada antes da seguinte. O baseline real antes/depois permaneceu exatamente nos sete grupos autorizados: `apps/web/src/admin/routes.tsx`, screenshots before 04/06/09 e `var/logs/{api,web,worker}.log`.

| ID  | Fault injected in scratch                                           | Killing assertion                                                                     | Result    |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------- |
| M1  | Adicionou `method` a `httpLogContext`.                              | `apps/api/src/app.test.ts:25-29` esperava três chaves; 1/30 API falhou.               | ✅ Killed |
| M2  | Vazou `internalOrderId` no DTO de delivery.                         | `apps/api/src/flow.test.ts:459` rejeitou a quarta chave; 1/30 API falhou.             | ✅ Killed |
| M3  | Removeu `aria-describedby` das lembranças.                          | `apps/web/src/public-form.test.tsx:79` recebeu descrição vazia; 1/40 web falhou.      | ✅ Killed |
| M4  | Removeu `review_required` dos estados que pollam.                   | `apps/web/e2e/mvp-operable-t6.spec.ts:134` não encontrou `Ouvir versões` em 15 s.     | ✅ Killed |
| M5  | Removeu `rememberMyOrder` do exchange.                              | `apps/web/e2e/mvp-flows.spec.ts:183-185` esperava JSON e recebeu `null`.              | ✅ Killed |
| M6  | Trocou outline por cor igual ao papel.                              | `apps/web/e2e/mvp-operable-t7.spec.ts:74` esperava contraste ≥3 e recebeu 1.          | ✅ Killed |
| M7  | Reduziu line-height global de h1/h2 para 0.9.                       | `apps/web/e2e/mvp-operable-t7.spec.ts:139-145` falhou em `/criar`, 0.9 < 1.05.        | ✅ Killed |
| M8  | Salgou cada creation hash com `nanoid()`.                           | `apps/api/src/flow.test.ts:189` esperava um publicId e recebeu três; 1/30 API falhou. | ✅ Killed |
| M9  | Removeu a janela temporal do reclaim de letra.                      | `apps/api/src/flow.test.ts:616,673` inverteu 200/409; 2/30 API falharam.              | ✅ Killed |
| M10 | Reprocessou pagamento aprovado e randomizou idempotency key do job. | `apps/api/src/flow.test.ts:288` esperava um job e recebeu dois; 1/30 API falhou.      | ✅ Killed |

**Sensor depth**: P0-full manual, dez mutações em segurança, idempotência, concorrência, pagamento, retomada e acessibilidade.
**Result**: 10/10 killed, 0 survived — PASS ✅.

## Interactive UAT Evidence

| Deliverable                            | Result | Evidence                                                                        |
| -------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| Jornada nominal + preço                | ✅     | `apps/web/e2e/mvp-flows.spec.ts:27-88`.                                         |
| Reload, retry, erro, polling e entrega | ✅     | `apps/web/e2e/mvp-operable-t5.spec.ts:3-118`; `mvp-operable-t6.spec.ts:22-261`. |
| Desktop 1280×720                       | ✅     | `mvp-operable-t7.spec.ts:207-226` e screenshots after 01/09.                    |
| Mobile 390×844 + teclado               | ✅     | `mvp-operable-t7.spec.ts:24-74,149-163,228-232` e screenshots after 13/14.      |

## Code Quality

| Principle                              | Status | Evidence                                                                                                                 |
| -------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| Minimum code / no needless abstraction | ✅     | Helpers locais, contratos Zod e funções puras; nenhuma camada service/DI nova.                                           |
| Surgical scope                         | ✅     | Diff mapeia T1–T8/F1–F3; capa por IA ficou em backlog.                                                                   |
| Existing patterns                      | ✅     | Fastify inject, PostgreSQL/Drizzle, React Query, RTL e Playwright seguem o repositório.                                  |
| Test integrity                         | ✅     | 62→97 Vitest e 8→28 Playwright; zero skip/deleção e 10/10 mutants mortos.                                                |
| Spec-anchored outcomes                 | ✅     | 45/45 com valor/estado exato; zero gap de precisão.                                                                      |
| Per-layer coverage                     | ✅     | Contratos/domain unitários; rotas PostgreSQL happy/error/retry; UI unit/E2E e borda exata.                               |
| Every in-scope test claimed            | ✅     | Novos testes mapeiam AC, edge case ou Done-when F1–F3.                                                                   |
| Project guidelines                     | ❌     | `AGENTS.md` exige atualizar README/docs quando comportamento muda; `README.md:66` e `docs/runbook.md:25` contradizem F1. |
| Senior approval                        | ❌     | Não aprovar artefato operacional com runbook divergente do runtime de segurança.                                         |

## Ranked Gaps and Fix Plan

1. **P1 validation blocker — T8 / documentação de SAFE-04**: remover “método” de `README.md:66` e `docs/runbook.md:25`, alinhando ambos ao contexto real `{requestId, route template, status, duration}`. Verificar com busca textual, `corepack pnpm check && corepack pnpm test:e2e`, então executar a terceira e última rodada fresca de Verifier.

## Lessons

Há sinal novo de divergência documental, mas ele não pertence às categorias aceitas pelo script de lessons (`ac_gap`, `surviving_mutant`, `spec_precision_gap`, `spec_deviation`, `gate_fail`). Nenhuma lição foi gravada. A inconsistência está explicitamente registrada como task/quality gap acima.

## Summary

**Overall**: ❌ Not Ready. O comportamento e os 45 critérios passam; o único blocker é a documentação operacional contradizer o logger após F1.

**Spec-anchored check**: 45/45 matched, 0 gaps, 0 spec-precision gaps.
**Gate**: 125 tests passed (97 Vitest + 28 Playwright), 0 failed, 0 skipped.
**Sensor**: 10/10 killed.
**Next step**: corrigir duas frases de documentação e executar a rodada 3.
