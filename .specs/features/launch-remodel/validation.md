# Launch Remodel Validation

**Result**: PASS

PASS técnico local: 15/15 critérios de aceitação possuem evidência de resultado, 185 testes passaram no gate independente e 7/7 mutações comportamentais foram detectadas. Este resultado não autoriza lançamento comercial e não representa homologação de providers, CI remoto, deploy ou aceite humano.

**Date**: 2026-09-07
**Spec**: `.specs/features/launch-remodel/spec.md`
**Verifier**: subagente independente, sem autoria da implementação.
**Diff range**: estado local posterior ao inventário `output/launch-remodel/baseline-status.txt` e `baseline-tracked.patch`, sobre HEAD `c9f3d045e9cba1ef9965e4005882ade0dcc496bb`. O diff contra HEAD inclui WIP anterior; a revisão limitou-se às mudanças de launch-remodel e consumidores afetados.

## Task Completion

| Tarefa | Resultado verificado                                                                              |
| ------ | ------------------------------------------------------------------------------------------------- |
| T1     | PASS: contrato aditivo, limites e fatos opcionais.                                                |
| T2     | PASS: catálogo e snapshot; migration nova e upgrade registrados.                                  |
| T3     | PASS: quatro passos, retorno, resumo e rascunho.                                                  |
| T4     | PASS: cinco intenções e navegação.                                                                |
| T5     | PASS: DTO comercial explícito e condições obrigatórias.                                           |
| T6     | PASS: preço do pedido, bloqueio e simulação explícita.                                            |
| T7     | PASS: checkout concorrente, rejeição, retry e webhook transacional.                               |
| T8     | PASS: Resend/local-log e configuração que falha em produção.                                      |
| T9     | PASS: intenção persistida antes do envio, retry estável e revogação.                              |
| T10    | PASS: cookies antigos e links revogados perdem acesso; download exige entrega.                    |
| T11    | PASS: ajuste único, transição e apresentação no admin; acesso de leitura não oferece mutação.     |
| T12    | PASS: Nginx sem access log de capabilities, validação runtime.                                    |
| T13    | PASS técnico: gate independente, browser/E2E local e relatório; aceite humano permanece separado. |

## Spec-Anchored Acceptance Criteria

| Critério      | Resultado definido pela spec                                                                   | `file:line` e asserção/evidência                                                                                                                                                                                                                                                                                                                                         | Resultado |
| ------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| CREATE-01 AC1 | Persistir brief de 10–3000, assunto e direção musical, sem relações fabricadas.                | `packages/contracts/src/index.test.ts:189`: brief curto e 3001 caracteres têm `success=false`; `apps/api/src/launch-flow.test.ts:150`: `detail.story.toMatchObject({ brief, facts: [], subjectName, genre, mood })`; `apps/api/src/launch-flow.test.ts:160`: dado persistido `toEqual(detail.story)`; `apps/web/src/public-form.test.tsx:128`: ausência de `roastLevel`. | PASS      |
| CREATE-01 AC2 | Tema/brief podem ser interpretados; fatos explícitos são obrigatórios.                         | `packages/domain/src/index.test.ts:130`: `validateLyrics(lyrics, creative).toEqual([])` sem copiar tema/brief; `packages/domain/src/index.test.ts:151`: fato explícito de dois caracteres ausente produz erro; linha154: presença elimina erro.                                                                                                                          | PASS      |
| CREATE-02     | Quatro passos internos, retorno, validação, resumo editável e restauração.                     | `apps/web/src/pages/create-story.tsx:112`: grupos de campos por passo; `apps/web/src/public-form.test.tsx:51`: rascunho restaurado; linha54: erro focado; linha63: resumo visível; linha65: texto preservado ao editar; `apps/web/e2e/launch-remodel.spec.ts:27`: percurso por teclado até pagamento.                                                                    | PASS      |
| CREATE-03     | Apagar limpa formulário/storage e não ressuscita dados.                                        | `apps/web/src/public-form.test.tsx:78`: campo vazio; linha79: storage nulo; linha85: nova edição persistida; linha87: dado apagado ausente.                                                                                                                                                                                                                              | PASS      |
| UX-01         | Landing oferece amizade, romance, presente, homenagem e ideia livre.                           | `apps/web/e2e/launch-remodel.spec.ts:241`: verifica os cinco hrefs; linha245: navegação amor; linha246: radio selecionado; linha247: ocasião preservada.                                                                                                                                                                                                                 | PASS      |
| PAY-01        | Expor configuração comercial e disponibilidade sem segredos.                                   | `apps/api/src/launch-flow.test.ts:208`: DTO esperado; linha212: ausência de credenciais sintéticas; `apps/api/src/configuration.ts:3`: objeto público explícito, sem spread do ambiente.                                                                                                                                                                                 | PASS      |
| PAY-02        | Bloquear checkout real sem preço/condições, preservar snapshot e permitir simulação explícita. | `apps/api/src/launch-flow.test.ts:219` e linha227: 409 com motivo; linha229: provider não chamado; linha192: preço do pedido 12500 após catálogo29900; linha242: `{ dev: true }`; `apps/api/src/configuration.test.ts:33`: cada condição comercial ausente bloqueia; linha57: produção nunca usa fallback.                                                               | PASS      |
| PAY-03        | Repetições/concorrência não duplicam pagamento/produção; falha admite retry.                   | `apps/api/src/launch-flow.test.ts:265`: falha inicial; linha268: concorrentes200; linha270: chave estável; linha273: um pagamento; linha311: dois webhooks200; linhas315/318/325/333: audio_queued, um job, um pagamento aprovado e um evento paid.                                                                                                                      | PASS      |
| MAIL-01       | Falha após aceitação preserva intenção, mensagem e link no retry.                              | `apps/worker/src/flow.test.ts:803`: falha sintética entre aceitação e registro; linha843: `messages[1].toEqual(messages[0])`; linha844: token confere com hash persistido; linha851: sucesso e destinatário original; linha876: concorrência; linha885: uma intenção enviada.                                                                                            | PASS      |
| MAIL-02       | Adapter Resend/local e validação sem fallback silencioso em produção.                          | `packages/providers/src/email.test.ts:17`: fallback local; linha31: Resend explícito; linhas37–44: produção inválida lança erro; linha55: retry deixa um arquivo; linha58: permissão0600; linha72: request e chave idempotente esperados.                                                                                                                                | PASS      |
| ACCESS-01     | Revogar invalida cookies e links anteriores.                                                   | `apps/api/src/launch-flow.test.ts:443`: full/view antigos retornam401; linha446: link antigo404; linha463: novo cookie após revogação401; linha472: token revogado não reabre acesso.                                                                                                                                                                                    | PASS      |
| ACCESS-02     | Sem autorização ou entrega concluída, download nega acesso.                                    | `apps/api/src/launch-flow.test.ts:385`: rota privada sem cookie401; linhas414–417: variantes não concluídas404; o mesmo teste exercita review_required, revision_requested e refunded; sensor lifecycle exige404 e recebe200 no mutante.                                                                                                                                 | PASS      |
| SUPPORT-01    | Ajuste após entrega é único, visível no admin e muda estado via domínio.                       | `apps/api/src/launch-flow.test.ts:497`: antes da entrega409; linha500: concorrência200; linhas505–509: revision_requested e um pedido pending com mensagem; `apps/api/src/app.ts:1240`: assertTransition; `apps/web/e2e/launch-remodel.spec.ts:223`: cliente envia; linhas227–229: admin mostra pedido e estado.                                                         | PASS      |
| OPS-01        | Capabilities não aparecem em access log da web.                                                | `docker/web/nginx.conf:8`: `access_log off`; `output/launch-remodel/nginx-validation.txt:1`: nginx -t, rota SPA200 e capability sintética ausente dos logs do container.                                                                                                                                                                                                 | PASS      |
| QA-01         | Gates em Node22, browser Codex acessível e distinção de evidências.                            | `output/launch-remodel/verifier-build-gate.txt:495`: API61; linha540: worker28; linhas99/137/151/163 completam185; `output/launch-remodel/web-e2e.txt:65`:43 passed; `output/launch-remodel/react-doctor.txt:20`:100/100; capturas03–05 do preview local e fronteiras descritas neste relatório.                                                                         | PASS      |

**Spec-anchored check**: 15/15 ACs com evidência; zero lacunas de precisão impeditivas. Termos amplos de qualidade artística não significam geração real validada: o contrato/prompt e o comportamento local foram verificados sem chamadas pagas.

## Edge Cases

- PASS: falha de formulário preserva dados/chave e permite retry (`apps/web/src/public-form.test.tsx:91`, linha118); erro acessível ligado ao controle (`apps/web/src/public-form.test.tsx:55`).
- PASS: valor/moeda divergentes retornam400 e não persistem evento aprovado (`apps/api/src/launch-flow.test.ts:298`, linha301 e linha308).
- PASS: links revogados/expirados não são reativados no retry; transporte permanece com uma chamada e hash intacto (`apps/worker/src/flow.test.ts:919`).
- PASS: acesso recuperado de leitura não oferece pedido de ajuste (`apps/web/e2e/launch-remodel.spec.ts:280`).

## Gate Check

O verificador executou `pnpm check` em Node22.22.2, com DATABASE_URL e DATABASE_URL_TEST apontando exclusivamente para `music_launch_verify`, criado vazio e migrado nesta verificação. Resultado exit0, 185/185 testes, zero falhas e zero skips. Format, lint, typecheck e build passaram; Turbo reutilizou entradas válidas para build/lint/typecheck, enquanto testes tinham cache desabilitado. API61 e worker28 também passaram em execuções independentes diretas antes do gate integral.

| Camada    | Testes atuais | Snapshot histórico anterior |
| --------- | ------------: | --------------------------: |
| API       |            61 |                          38 |
| Web       |            68 |                          63 |
| Worker    |            28 |                          20 |
| Contracts |             9 |                           8 |
| Domain    |            10 |                           7 |
| Providers |             9 |                           3 |
| Total     |           185 |                         139 |

A contagem139 vem do estado histórico prévio, não de uma execução fresca anterior a esta implementação. Delta histórico +46; não é atribuição exata de todos os testes à feature. A reescrita do formulário substituiu expectativas do intake antigo pelas quatro etapas, mantendo retry, foco/erro e consentimento; não se observou redução global, skip ou enfraquecimento para contornar falha.

O primeiro gate integrado do principal falhou por concorrência entre suítes que truncavam o mesmo banco. O script raiz agora serializa pacotes; API serializa arquivos. A falha original foi preservada em `output/launch-remodel/integrated-check-before-serialization.txt`. O gate normal e o gate independente posteriores passaram.

E2E43/43 e react-doctor100/100 foram executados pela frente frontend e cotejados pelo verificador pelos testes e logs. São browser tests locais com providers/dados controlados. O verificador não repetiu sua própria interação visual no Codex; o principal fez o smoke/capturas do preview. Migration fresh foi executada pelo verificador. Upgrade/seed replay e restore PostgreSQL têm evidência local separada em `backend-upgrade.txt` e `restore-validation.txt`; nenhum desses testes valida bucket ou ambiente Railway.

## Discrimination Sensor

**Sensor depth**: caminhos críticos, sete mutações manuais independentes em cópias descartáveis de API/worker. Sem ferramenta de mutação configurada no projeto.

| Mutação                            | Código real de referência       | Falha observada no scratch                                             | Resultado |
| ---------------------------------- | ------------------------------- | ---------------------------------------------------------------------- | --------- |
| Remover gate comercial do checkout | `apps/api/src/app.ts:662`       | expected409, received200                                               | Killed    |
| Ignorar divergência dos valores    | `apps/api/src/app.ts:786`       | expected400, received200                                               | Killed    |
| Ignorar moeda divergente           | `apps/api/src/app.ts:788`       | expected400, received200                                               | Killed    |
| Ignorar assinatura do webhook      | `apps/api/src/app.ts:729`       | expected401, received200                                               | Killed    |
| Ignorar geração/nome do cookie     | `apps/api/src/app.ts:257`       | dois testes expected401, received200                                   | Killed    |
| Retirar gate de entrega concluída  | `apps/api/src/app.ts:1113`      | expected404, received200                                               | Killed    |
| Trocar token estável por aleatório | `apps/worker/src/worker.ts:537` | três regressões: aprovação manual, retry após aceitação e concorrência | Killed    |

**Result**: PASS, 7/7 killed, zero survived. Falhas vieram de resultados comportamentais, não de compilação. Testes executaram contra cópias em diretório temporário, com dependências existentes; o banco exclusivo do verificador recebeu fixtures sintéticas. Scratch foi removido e `git status --porcelain` permaneceu byte a byte igual antes/depois. Resultado detalhado: `output/launch-remodel/verifier-sensor/results.json`.

## Code Quality

| Verificação                   | Resultado                                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Escopo e mudanças necessárias | PASS: criação livre, ativação comercial, entrega/retry, acesso, suporte e runtime. WIP prévio preservado.                  |
| Simplicidade e abstrações     | PASS: funções/DTOs/adapters pequenos; nenhuma DI/classe ou gateway futuro inventado.                                       |
| Invariantes e persistência    | PASS: transições de domínio, locks PostgreSQL existentes, snapshot e intenção durável.                                     |
| Cobertura por camada          | PASS: contratos/domain/provider unit; API/worker com PostgreSQL; UI unit e E2E, incluindo falhas e permissões.             |
| Integridade de testes         | PASS: assertions observáveis e sensor crítico detectando regressões.                                                       |
| Guias do projeto              | PASS: AGENTS.md, docs/project-context.md e matriz de tasks; Node22 e provider real não alegado.                            |
| Testes dentro do escopo       | PASS: suítes novas correspondem aos ACs, bordas e operações diretamente afetadas; regressões legadas permanecem nos gates. |

## Gaps corrigidos durante a verificação

1. Fatos explícitos de dois caracteres eram ignorados pela regra legada. A regra de custom_song e teste positivo/negativo foram corrigidos.
2. Faltava evidência de persistência do brief/direção e imutabilidade do preço do pedido. Integrações com SELECT/GET exato foram acrescentadas.
3. Faltavam assertions das cinco intenções e do ajuste cliente/admin. E2E cobre esses resultados e impede ação de ajuste para capability somente de leitura.
4. Suites de banco concorrentes tornavam o gate normal instável. A serialização foi aplicada no comando raiz e nos arquivos da API; gate normal e independente confirmam a correção.

Nenhuma lacuna técnica local permanece aberta neste escopo. Os sinais acima devem virar lições de projeto pelo principal, que possui ownership de documentação; este verificador escreve somente este arquivo.

## Fronteiras e próxima ação

Aceite humano visual não foi realizado por este verificador. OpenRouter, Mercado Pago, Resend e S3 reais não foram chamados; o adapter de transporte recebeu mocks sintéticos. CI remoto e Railway permanecem no estado descrito em `output/launch-remodel/live-baseline.md`: mudanças locais ainda não publicadas. Não houve commit, push, deploy ou alteração de visibilidade. Preço, licença e condições comerciais continuam decisões de ativação; checkout real permanece bloqueado enquanto sua configuração estiver incompleta.

Traceabilidade recomendada ao principal: marcar CREATE-01/02/03, UX-01, PAY-01/02/03, MAIL-01/02, ACCESS-01/02, SUPPORT-01, OPS-01 e QA-01 como verificados localmente. Fechar tasks/documentação com estas evidências sem converter PASS local em aprovação comercial.
