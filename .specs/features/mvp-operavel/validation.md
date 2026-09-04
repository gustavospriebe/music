# MVP Operável Validation

## Verdict

**PASS local.** Os 45 requisitos têm evidência direta abaixo. A prova usa PostgreSQL real, Fastify `inject`, Vitest e Chromium/Playwright com providers controlados. Não houve chamada paga, push ou deploy.

## Requirement evidence

| ID       | Resultado | Evidência direta                                                                                                                                                                    |
| -------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FLOW-01  | PASS      | `apps/api/src/flow.test.ts:173-210` prova create concorrente/retry único; `apps/web/e2e/mvp-operable-t5.spec.ts:3-58` mantém a mesma UUID.                                          |
| FLOW-02  | PASS      | `apps/web/src/public-form.test.tsx` e `apps/web/e2e/mvp-operable-t5.spec.ts:41-51` provam foco, mensagem, `aria-invalid` e retenção.                                                |
| FLOW-03  | PASS      | `apps/web/src/hooks/use-draft.ts:23-37` expõe saving/saved/error; teste RTL e E2E em `mvp-operable-t5.spec.ts:34-39`.                                                               |
| FLOW-04  | PASS      | `apps/web/e2e/mvp-operable-t5.spec.ts:34-39` preenche, recarrega e restaura.                                                                                                        |
| FLOW-05  | PASS      | `apps/web/e2e/mvp-operable-t5.spec.ts:52-58` repete create/story após 503 com a mesma chave.                                                                                        |
| GEN-01   | PASS      | `apps/api/src/flow.test.ts:570-589` mantém uma chamada e devolve 409 ao concorrente.                                                                                                |
| GEN-02   | PASS      | `apps/web/src/pages/public.tsx:336-375` faz polling e anuncia “Criando sua letra”; E2E em `mvp-operable-t6.spec.ts:22-49`.                                                          |
| GEN-03   | PASS      | `apps/web/e2e/mvp-operable-t6.spec.ts:22-49` recarrega, chega ao editor e conta zero POSTs.                                                                                         |
| GEN-04   | PASS      | `apps/api/src/app.ts:424-438` limita claim a cinco minutos; `flow.test.ts:618-655` cobre fresco/expirado.                                                                           |
| GEN-05   | PASS      | `apps/api/src/flow.test.ts:537-567` e `apps/web/e2e/mvp-operable-t6.spec.ts:52-85` provam falha e retry real.                                                                       |
| GEN-06   | PASS      | `apps/web/src/order-journey.ts:162-166` escolhe a maior versão sem mutar; teste unitário co-localizado.                                                                             |
| LYRIC-01 | PASS      | `apps/api/src/flow.test.ts:341-387` compara todas as versões e conteúdos históricos.                                                                                                |
| LYRIC-02 | PASS      | `apps/api/src/flow.test.ts:291-338` aprova exatamente a edição visível e anexa versão.                                                                                              |
| LYRIC-03 | PASS      | `apps/web/e2e/mvp-operable-t6.spec.ts:52-85,156-198` mantém texto e mostra alerta em falha.                                                                                         |
| LYRIC-04 | PASS      | `apps/web/e2e/mvp-operable-t6.spec.ts:188-197` nomeia a operação e desabilita as duas ações.                                                                                        |
| PAY-01   | PASS      | `apps/web/e2e/mvp-operable-t5.spec.ts:61-90` usa 6789 centavos nas duas telas e fallback sem número.                                                                                |
| PAY-02   | PASS      | `apps/api/src/flow.test.ts:229-249` repete checkout com a mesma resposta e um pagamento.                                                                                            |
| PAY-03   | PASS      | `apps/api/src/flow.test.ts:266-288` confirma por `publicId` e mantém um job; E2E `mvp-operable-t5.spec.ts:92-118`.                                                                  |
| PAY-04   | PASS      | `apps/api/src/flow.test.ts:250-265` retorna 401 e compara pedido/pagamento/fila sem mutação.                                                                                        |
| PAY-05   | PASS      | `apps/web/e2e/mvp-operable-t5.spec.ts:112-117` valida status textual e CTA desabilitado.                                                                                            |
| ASYNC-01 | PASS      | `apps/web/src/pages/public.tsx:549-561` faz polling só nos estados ativos; matriz unitária em `order-journey.test.ts`.                                                              |
| ASYNC-02 | PASS      | `apps/web/e2e/mvp-operable-t6.spec.ts:120-143` rejeita uma variante e conclui cinco etapas com duas.                                                                                |
| ASYNC-03 | PASS      | `apps/web/src/order-journey.ts:75-96` separa falha paga; E2E `mvp-operable-t6.spec.ts:88-117` rejeita promessa automática.                                                          |
| ASYNC-04 | PASS      | `apps/api/src/app.ts:989-991` emite capability de visão; `apps/web/src/pages/public.tsx:759-764` registra histórico; E2E legado cobre troca.                                        |
| ASYNC-05 | PASS      | `apps/web/src/order-journey.ts:1-160` deriva título/etapa/ação da união fechada; matriz cobre todos os grupos.                                                                      |
| ASYNC-06 | PASS      | `apps/web/src/order-journey.test.ts:37-50` e E2E `mvp-operable-t6.spec.ts:88-110` rejeitam ausente/futuro.                                                                          |
| ASYNC-07 | PASS      | `apps/web/src/pages/public.tsx:693-703` e E2E `mvp-operable-t6.spec.ts:146-153` explicam histórico local e oferecem criação.                                                        |
| A11Y-01  | PASS      | `apps/web/src/components.tsx:74-83` foca/rola; RTL e E2E `mvp-operable-t7.spec.ts:23-34`.                                                                                           |
| A11Y-02  | PASS      | `apps/web/src/styles.css:538-540` usa outline verde 3 px, com contraste acima de 3:1 contra papel/branco.                                                                           |
| A11Y-03  | PASS      | `apps/web/src/components.tsx:19-69`; RTL e `mvp-operable-t7.spec.ts:3-20` cobrem nome, expansão, scroll lock e Escape.                                                              |
| A11Y-04  | PASS      | `apps/web/src/styles.css` fixa alvo mínimo 44 px; `mvp-operable-t7.spec.ts:37-58` prova 390 px sem overflow.                                                                        |
| A11Y-05  | PASS      | `apps/web/src/styles.css` define escala/tracking/line-height; `mvp-operable-t7.spec.ts:52-58,85-92` mede 1.05 e um `h1`.                                                            |
| A11Y-06  | PASS      | Loading/erro/vazio/sucesso têm texto e roles em `components.tsx`/`pages/public.tsx`; E2E T5-T7 cobre cada estado.                                                                   |
| A11Y-07  | PASS      | `apps/web/src/styles.css:602-613` remove motion; `mvp-operable-t7.spec.ts:61-82` compara normal/reduce.                                                                             |
| SAFE-01  | PASS      | `packages/contracts/src/index.test.ts:92-125` rejeita campos internos; rota compara DTO exato em `apps/api/src/flow.test.ts`.                                                       |
| SAFE-02  | PASS      | `packages/contracts/src/index.test.ts:127-139` rejeita `paymentId`; checkout público retorna só URL/dev.                                                                            |
| SAFE-03  | PASS      | Schemas `.strict()` e testes de chaves em contratos/API; respostas usam `publicId`, número e variante.                                                                              |
| SAFE-04  | PASS      | `apps/api/src/app.ts:124-141` loga request ID implícito, template, método, status e duração; `apps/worker/src/worker.ts:79-94` omite IDs internos; teste exato em `worker.test.ts`. |
| SAFE-05  | PASS      | `apps/api/src/flow.test.ts:537-554` prova erro sem detalhe privado, uma linha e limite de 500 caracteres.                                                                           |
| SAFE-06  | PASS      | `apps/api/src/env.ts:32-38`, `env.test.ts:21-39` e `apps/worker/src/worker.test.ts:10-36` falham sem chaves de produção.                                                            |
| SAFE-07  | PASS      | Helpers em `apps/api/src/app.ts:238-263`; integração rejeita cookies literais e aceita emitidos pelo servidor.                                                                      |
| TEST-01  | PASS      | `apps/web/e2e/mvp-flows.spec.ts:27-88` exige estados conhecidos ao longo do fluxo; T6 prova produção/entrega.                                                                       |
| TEST-02  | PASS      | API/PostgreSQL injeta repetição/concorrência em create, lyrics, checkout e dev payment; worker prova job/variantes.                                                                 |
| TEST-03  | PASS      | `apps/web/e2e/mvp-operable-t7.spec.ts:3-93` falha para regressões de menu, foco, overflow, alvo e motion.                                                                           |
| TEST-04  | PASS      | Gate final documentado abaixo: check, E2E, replay DB, React Doctor e UAT nos dois viewports saíram com código 0.                                                                    |

## Operational evidence

- Migration `0004` adiciona hash nullable + índice único em `packages/database/drizzle/0004_mvp_operavel.sql:1-2`.
- `db:migrate` e `db:seed` passaram duas vezes em `resenha` e duas vezes em `resenha_test`.
- `pnpm check` saiu com código 0: format, lint e typecheck passaram; Vitest executou 95 testes (7 contracts, 7 domain, 29 API, 13 worker e 39 web); todos os builds passaram.
- `pnpm test:e2e` saiu com código 0: 24 testes Chromium cobriram fluxo feliz, falhas, retomada, teclado, 390 × 844 e capturas finais.
- API (`/api/v1/health/live`), web e worker responderam/estavam ativos na prova local.
- React Doctor changed: 71/100, quatro avisos sem erro; reduziu de oito para quatro após correções. Três são complexidade e um é falso positivo de cache: create salva e navega para um `publicId` novo, sem query anterior para invalidar.
- React Doctor design: zero achados.
- Auditoria visual: `docs/audits/mvp-operavel/final.md` e quatro capturas finais nos viewports originais.
- O warning conhecido do build é o chunk público de ~671 kB; está no backlog P2 e não invalida correção/execução.
