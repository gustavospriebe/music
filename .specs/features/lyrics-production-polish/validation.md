# Validation: Lyrics Production Polish

**Result**: PASS

Atualização EDIT-03: o PASS abaixo permanece a evidência técnica histórica. A ampliação editorial de composição tem resultado **parcial**, descrito no final; não há aprovação artística consistente das novas amostras.

PASS técnico local dos cinco critérios. O gate integrado independente passou com 247 testes; sete mutações comportamentais foram detectadas. O verificador não executou chamadas reais: o teste de capa e seu custo pertencem à evidência operacional do principal. O aceite visual humano continua separado da validação automatizada.

**Data**: 2026-09-07. **Verificador**: subagente independente, sem autoria da implementação. **Escopo**: incremento de `lyrics-production-polish` e integração das correções UAT anteriores; web, API, contratos, worker e launcher. Somente este relatório foi editado pelo verificador nesta rodada. A spec compacta não possui design/tasks separados; o gate utilizado é `pnpm check`, conforme AGENTS.md, mais a evidência E2E e React Doctor da frente frontend.

## Critérios e evidências

| AC          | Resultado da spec                                                                                                                    | Evidência file:line e assertion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Resultado    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| EDIT-01     | Leitura por estrofes; título e letra editáveis; salvar/descartar explícitos; aprovação não ignora alterações pendentes.              | `apps/web/src/pages/lyrics-studio.test.tsx:90`: `Aprovar letra` disabled e linha91: refino disabled com draft; linhas94–97 preservam título/versos depois da falha de save. Linha108 cobre refetch em lyrics_generating, retomada e histórico readonly sem perder draft. `apps/web/e2e/lyrics-studio.spec.ts:76`: heading Verso visível; linha37 valida título e versos no PATCH; linha84 bloqueia aprovação dirty; linha98 impede refino histórico.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | PASS técnico |
| EDIT-02     | Refino explícito da versão atual salva, contrato limitado, histórico/história preservados, autorização, safety, teto e concorrência. | `packages/contracts/src/index.test.ts:250`: body ausente vira `{}`; linha252 trim; linha263 rejeita corpo parcial, instruções curtas/longas e versão fracionária. `apps/api/src/lyrics-refinement.test.ts:145`: provider recebe instruções e título/fullLyrics/direção efetivamente salvos; linha156 compara história e linha159 mantém versões anteriores. Linha181 rejeita stale/foreign/missing sem gasto; linha248 preserva safety e teto4; linha282 bloqueia PATCH/approve/refino concorrentes; linha349 preserva lyrics_ready, remaining3, histórico e edição após provider throw; linha407 bloqueia base insegura; linha431 testa lock PATCH/approve primeiro, refino409 e zero provider; linha482 testa cookie view-only válido do mesmo pedido, GET200/privateAccessfalse e POST401/zero provider. `apps/web/src/pages/lyrics-studio.test.tsx:196`: chamada exatamente uma vez com baseVersion2 depois de save; nenhuma chamada ao carregar/escolher sugestão. | PASS         |
| PAY-02      | Apenas condições preenchidas; indisponibilidade curta e cobrança ainda bloqueada.                                                    | `apps/web/src/pages/lyrics-studio.test.tsx:205`: políticas totalmente ausentes não exibem scaffold ou seção vazia. Linha241 exige o único prazo configurado visível; linhas244–246 exigem ajustes/reembolso/licença ausentes; linha247 exige pagar disabled. `apps/web/src/pages/public.tsx:383`: mensagem curta de indisponibilidade; linha405 filtra campos vazios; linha465 deriva bloqueio de `checkoutAllowed !== true`; linha515 aplica disabled. Gates reais do backend permanecem cobertos no gate API completo.                                                                                                                                                                                                                                                                                                                                                                                                                                                | PASS         |
| PROGRESS-01 | Estado e contagem reais, atualização periódica, fila/geração/revisão distintas, letra recolhida e movimento reduzido.                | `apps/worker/src/flow.test.ts:522`: banco contém variante1 processing enquanto provider aguarda; linha531: variante2 processing após1 completed; linha538: failed após rejeição; linha541: retry chama provider só uma vez e linha543 preserva variante1; linha548 encerra review_required. Linha551 cobre storage failure com failed e asset nulo. `apps/web/src/pages/lyrics-studio.test.tsx:260`: exatamente1 de2 e checagem visível; linha262 details fechado. `apps/web/e2e/lyrics-studio.spec.ts:103`: polling0→1→2, duplicata da variante1 não aumenta contagem; linha139 animation-name none em reduced motion; linha141 letra recolhida; linhas145–153 revisão humana, sem atividade falsa nem porcentagem.                                                                                                                                                                                                                                                    | PASS         |
| COVER-01    | Opt-in de capa com modelos existentes, credenciais por serviço, pagamentos/email locais e respeito aos limites externos.             | `scripts/local-preview.sh:15` neutraliza AI herdada; linha43 só lê .env no serviço selecionado; linha48 seleciona text/API ou music/worker; linha51 exige os dois modelos de capa em all; linha53 falha se ausentes; linha56 check só mostra flags. Ensaio independente em cópia sintética:12 combinações `off                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | lyrics       | lyrics-audio | all × api | worker | web`e6 negativos PASS, nunca lê .env real/inicia serviço; web sempre sem AI, payment disabled e email local-log.`output/lyrics-production-polish/verifier-launcher-checks.json` registra os resultados. Prova real/budget é do principal, não reproduzida pelo verificador. | PASS técnico; rede sob evidência operacional |

5/5 critérios têm evidência técnica. A expressão “legível” envolve julgamento visual; a verificação comprova estrofes, semântica, edição e fluxo no navegador, sem atribuir aceite estético ao usuário.

## Gate integrado independente

Node22.22.2; PostgreSQL real exclusivamente no banco descartável `music_polish_verify`, criado/migrado pelo verificador e removido depois do sensor. Nenhum teste acessou `resenha` ou `music_launch_preview`.

```text
DATABASE_URL=<music_polish_verify> pnpm db:migrate
DATABASE_URL=<music_polish_verify> DATABASE_URL_TEST=<music_polish_verify> NODE_ENV=test pnpm check
```

Exit0: format, lint, typecheck, testes e build PASS. Testes Turbo sem cache; demais etapas puderam aproveitar cache válido. Log: `output/lyrics-production-polish/verifier-check.txt`.

| Suíte     | PASS |
| --------- | ---: |
| API       |   85 |
| Web       |   84 |
| Worker    |   42 |
| Contracts |   17 |
| Domain    |   10 |
| Providers |    9 |
| Total     |  247 |

Zero falhas e zero skips. Último gate independente anterior completo:201 testes em studio-flow-uat-fixes, antes dos retoques web76/worker40 e desta feature. Delta acumulado+46; não houve um gate integrado intermediário de215. O presente247 valida conjuntamente esse estado final. As novas assertions aumentam precisão; nenhum teste desativado ou enfraquecido foi identificado no incremento revisado.

A frente frontend executou46 E2E PASS e React Doctor completo100/100 (46 arquivos); logs `output/lyrics-production-polish/web-e2e-final.txt` e `react-doctor-final.txt` examinados pelo verificador. Os dois novos E2E foram revisados em código; o verificador não repetiu a suíte navegador nem a chamada real de capa. Refino focal19/19 também passou independentemente antes do integrado.

## Sensor comportamental

Sete mutantes em cópias descartáveis de API/web/worker, com dependências locais compartilhadas apenas para leitura. Comandos focais: `vitest run src/lyrics-refinement.test.ts`, `vitest run src/pages/lyrics-studio.test.tsx` e `vitest run src/flow.test.ts`, todos com `--fileParallelism=false`. O incremento inclui autorização, gasto e integridade histórica; profundidade≥5 aplicada.

| Falha injetada                   | Local                                | Assertion que a detectou                                              | Estado |
| -------------------------------- | ------------------------------------ | --------------------------------------------------------------------- | ------ |
| Aceitar base stale               | `apps/api/src/app.ts:506`            | Esperado409, recebido200; também detectada na corrida PATCH primeiro. | Killed |
| Remover teto4                    | `apps/api/src/app.ts:522`            | Esperado400, recebido200.                                             | Killed |
| Ignorar safety da base salva     | `apps/api/src/app.ts:514`            | Esperado400, recebido200.                                             | Killed |
| Falha de refino inutiliza editor | `apps/api/src/app.ts:621`            | Esperado lyrics_ready, recebido failed.                               | Killed |
| Permitir aprovação dirty         | `apps/web/src/lyrics-editor.tsx:241` | Botão deveria estar disabled.                                         | Killed |
| Fabricar2 versões prontas        | `apps/web/src/pages/public.tsx:627`  | Texto esperado1 de2 ausente.                                          | Killed |
| Manter processing após falha     | `apps/worker/src/worker.ts:785`      | Esperado failed após erro provider e storage.                         | Killed |

7/7 killed; zero survived. Falhas de resultado, nenhuma falha de import/sintaxe mascarando teste. `git status --porcelain` idêntico antes/depois; scratch removido. Relatório e logs individuais: `output/lyrics-production-polish/verifier-sensor/results.json`.

## Integração, qualidade e limites

O refino estende o endpoint existente e mantém chamadas pagas fora da transação; locks revalidam status e versão antes do claim. PATCH e approve participam da mesma serialização. Recuperação de erro usa o identificador temporal do claim para não sobrescrever tentativa concorrente. O prompt recebe a letra canônica salva, evitando que sections antigas contradigam uma edição humana. Componentes de editor/refino têm responsabilidades separadas e o progresso consome o estado persistido, sem nova infraestrutura ou migration.

A correção administrativa adicional está incluída no gate: `apps/api/src/launch-flow.test.ts:595` testa handler real com job6/6→pending6/7 e2/6→pending2/6; linhas621–625 mostram que clique repetido não aumenta orçamento nem apaga attempts. O fluxo worker de retomada sem reset e preservação da variante pronta também está coberto; isso não constitui nova chamada remota.

Achados da revisão foram corrigidos antes do fechamento: política parcial sem scaffold; preservação do draft em refetch; safety da base editada; view-only sem autorização de refino; recuperação do editor após provider throw; status de variante observado durante I/O real do worker com provider sintético. Não restaram lacunas técnicas nessa fronteira.

Não houve provider real, pagamento, alteração de .env, commit, push, deploy ou acesso a produção pelo verificador. A configuração seletiva não impõe sozinha teto financeiro: orçamento autorizado e limite da chave são controles operacionais distintos, registrados pelo principal. CI remoto, Railway, homologação externa e novo aceite humano permanecem fora deste PASS técnico local.

## Follow-up UAT: PROGRESS-02 — atualização até falha

**Resultado do follow-up**: PASS técnico local. O critério PROGRESS-02 foi acrescentado após o relato de uma tela sem atualização por dez minutos. O principal verificou o pedido real como failed; o verificador não alterou seu estado, não consultou esse banco e não reenviou áudio. Esta seção amplia a cobertura técnica para6/6 critérios; preserva o gate integrado de247 acima como histórico anterior ao follow-up, sem afirmar que o monorepo completo foi reexecutado depois.

A causa corrigida é o detalhe administrativo sem polling. `apps/web/src/admin/routes.tsx:606` agora consulta a cada5s enquanto houver job pending/processing ou estado automático, inclusive geração sem job assíncrono; linha603 reconhece401/403 e interrompe polling. Falha transitória mantém o snapshot e exibe aviso explícito. `OrderStatus` já consultava estados ativos a cada2s e remove a produção ao receber failed; foi acrescentada a prova temporal ausente. `OrderPlayer` consulta a cada5s enquanto não entregue e mantém acesso ao status sem liberar áudio parcial. A mensagem de falha revisada pelo principal informa interrupção e necessidade de revisão.

| Fronteira de PROGRESS-02                                               | Evidência e assertion                                                                                                                                                                                                                                                                                          | Resultado |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Admin acompanha job ou estado e encerra ao chegar ao terminal          | `apps/web/src/admin/routes.test.tsx:358`: quatro sequências geração/processing→failed, geração semjob→failed, fila/pending→review_required e delivered comjob processing→completed. Linha375 exige duas consultas; linha376 exige heading atualizado; linha381 exige que mais15s não criem consulta adicional. | PASS      |
| Erro de consulta transitório preserva dados e recupera                 | `apps/web/src/admin/routes.test.tsx:395`: heading anterior permanece; linha396 exige aviso de snapshot; linhas400–401 exigem failed no ciclo seguinte e remoção do aviso.                                                                                                                                      | PASS      |
| Sessão expirada oculta snapshot e para polling                         | `apps/web/src/admin/routes.test.tsx:413`: mensagem de sessão expirada; linha414 exige heading anterior ausente; linha418 mantém exatamente duas consultas depois de15s.                                                                                                                                        | PASS      |
| Cliente remove atividade ao receber falha e não gera novamente         | `apps/web/src/pages/production-status.test.tsx:65`: relógio avança2s; linha67 exige heading de falha; linhas70–72 exigem painel, ícone ativo e contagem ausentes; linha77 comprova polling encerrado; linha78 exige zero chamadas de geração.                                                                  | PASS      |
| Player não libera variante parcial após falha e liga ao estado correto | `apps/web/src/pages/production-status.test.tsx:86`: polling5s; linha88 exige resposta failed no cache; linhas89–90 proíbem áudio/download parcial; linha91 segue link ao status; linha93 exige falha visível e linha96 zero geração.                                                                           | PASS      |

O verificador escreveu somente o novo teste público `apps/web/src/pages/production-status.test.tsx` e este append. Não editou fontes runtime nem os testes administrativos do autor.

Validação independente final:

```text
pnpm --filter @resenha/web exec vitest run src/admin/routes.test.tsx src/pages/production-status.test.tsx src/order-journey.test.ts --fileParallelism=false
pnpm --filter @resenha/web typecheck
pnpm --filter @resenha/web lint
pnpm --filter @resenha/web build
```

35/35 testes PASS (admin15, público2, jornada18), zero falhas/skips; typecheck, lint e build PASS. Build final também executa `tsc -b` e o limite de tamanho de entrada. Frontend confirmou React Doctor100/100; o verificador conferiu seu log final. Não foram reexecutados E2E nem o gate integrado do backend, pois o follow-up altera somente polling, aviso e copy da web. Logs temporários entregues ao principal: `/tmp/music-production-followup-focal.log` e `/tmp/music-production-verifier-{typecheck,lint,build}.log`.

Sensor focal: remover polling do admin em `apps/web/src/admin/routes.tsx:616` matou6 testes (esperado2 consultas, recebido1; ausência de atualização/avisos). Remover polling público em `apps/web/src/pages/public.tsx:588` matou o novo teste temporal pela ausência do heading de falha. **2/2 killed**, zero sobreviventes; falhas comportamentais, scratch removido e `git status --porcelain` idêntico antes/depois. Logs e JSON entregues ao principal na pasta temporária `music-polling-sensor-logs-7r_nkzeh`.

Não restam lacunas técnicas nesta transição. A observação do pedido real e a comunicação ao usuário pertencem ao principal; estes testes usam apenas respostas sintéticas e relógio controlado, sem pagamento, provider, serviço ou mutação de banco.

## EDIT-03 — composição cantável: resultado editorial parcial

O principal executou quatro chamadas reais de texto em dois briefings fictícios, preservando as duas iterações. Custos reportadosUS$0,015545, rodada acumuladaUS$0,6648398 dentro do tetoUS$3. O verificador independente leu as letras e conferiu provider5/domain10 PASS sem rede ou banco; build da API passou no principal, typecheck/lint/formato pertinentes no autor. São gates técnicos focais, não nova execução integrada.

A orientação agora inclui cadência, gancho, retorno do refrão, progressão e revisão editorial; mantém fatos literais, privacidade e escopo do refino. Nas duas amostras finais, sections e fullLyrics correspondem e não há instruções instrumentais no texto cantado. Não foram introduzidos bloqueios estéticos nem retries automáticos pagos.

**Avaliação editorial: PARCIAL.** A amostra de viagem perdeu naturalidade e ficou repetitiva; a de recomeço apresentou um refrão mais concreto, mas manteve problemas de narrador e metáforas. Não há evidência suficiente para aprovar ganho artístico consistente. A revisão do código está concluída; EDIT-03 permanece com aceite editorial pendente. O texto aprovado dos pedidos existentes não mudou. Relatório principal em docs/lyrics-prompt-review.md; avaliação independente em output/lyrics-prompt-review/editorial-review.md e respostas de ambas as iterações preservadas nessa pasta.
