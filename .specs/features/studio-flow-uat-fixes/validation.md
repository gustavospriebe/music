# Validation: Studio Flow UAT Fixes

**Result**: PASS

PASS técnico local para os cinco critérios, incluindo UAT-05 acrescentado após a observação real de HTTP402. O gate integrado independente de 201 testes precedeu os retoques finais da web e do worker. Depois, o worker passou 40 testes focais independentes; a web possui evidência própria de 76 testes e 44 E2E. Cinco mutações no total foram detectadas. O novo gate integrado do estado completo ficou adiado enquanto os autores iniciavam a feature separada `lyrics-production-polish`. As correções respondem aos problemas relatados na UAT; isso não substitui o novo aceite visual do usuário nem comprova o resultado das chamadas reais conduzidas pelo principal.

**Data**: 2026-09-07
**Verificador**: subagente independente, sem autoria de código.
**Escopo**: alterações incrementais de `studio-flow-uat-fixes` sobre a entrega local `launch-remodel`; web, contratos, fixtures/adapter API, configuração e launcher. WIP anterior foi preservado. Nenhuma migration de produto foi necessária.

## Critérios ancorados na spec

| AC     | Resultado esperado                                                                                                      | Evidência e asserção                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Resultado    |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| UAT-01 | Intenção e ocasião independentes, ocasião opcional apenas para custom_song; contexto criativo preservado.               | `apps/web/src/studio-uat.test.tsx:33` e linha35: ocasião do rascunho mantém `Encontro em Recife` após URL e troca de intenção. `packages/contracts/src/index.test.ts:213`: cinco intenções preservadas com `occasion: ''`; linha217: intenção livre por default; linhas241–243: ocasião continua obrigatória no legado. `apps/api/src/launch-flow.test.ts:194`: DTO com intenção e ocasião vazia; linha198: dado persistido igual ao DTO. `apps/api/src/providers.test.ts:161`: payload efetivamente enviado ao fetch sintético conserva intenção, ocasião, brief, assunto e direção; linha169: email ausente.                                                                                              | PASS         |
| UAT-02 | Um grupo acessível por escolha, entrada personalizada somente em Outro e preservada em retorno/reload.                  | `apps/web/src/studio-uat.test.tsx:47`: preset selecionado; linha48: textbox ausente; linha56: retorno preserva texto. Linhas80–96: ambos os grupos, alternância preset/Outro e exatamente um radio marcado. Linhas103–118: remount restaura os dois textos e Outro selecionado. `apps/web/e2e/launch-remodel.spec.ts:305`, linha312 e linhas315–328 reproduzem a exclusividade e persistência no navegador.                                                                                                                                                                                                                                                                                                 | PASS         |
| UAT-03 | Jornada global por nomes e continuidade visual após as quatro partes da preparação.                                     | `apps/web/src/studio-uat.test.tsx:67`: contador conflitante ausente; linha68: lista `Jornada da música` visível; linha69: `Letra` tem `aria-current=step`. `apps/web/src/components.tsx:178` implementa nomes; `CustomerWorkspace` reutiliza estrutura studio em letra, checkout, acompanhamento e entrega, conforme consumidores em `apps/web/src/pages/public.tsx:142`, linha181, linha504, linha672 e linha727. A avaliação estética final pertence ao novo aceite humano.                                                                                                                                                                                                                               | PASS técnico |
| UAT-04 | Indisponibilidade anunciada antes de preencher; trabalho preservado; credenciais ativadas explicitamente sem exposição. | `apps/web/src/studio-uat.test.tsx:62`: aviso visível com formulário ainda vazio; `apps/web/e2e/launch-remodel.spec.ts:291`: aviso antes da entrada; `apps/api/src/launch-flow.test.ts:146`: geração indisponível retorna503 e linha150: história preservada. `apps/api/src/providers.test.ts:170`: limite de tokens transmitido. `scripts/local-preview.sh:36`: somente serviços/modos suportados; linha40: .env lido apenas pelo serviço AI explicitamente selecionado; linha54: saída de check sanitizada. Verificação independente do launcher em scratch: nove combinações serviço/modo, chave sintética nunca impressa, web sem credenciais de AI, modelo ausente rejeitado e modo inválido rejeitado. | PASS técnico |

**Cobertura**: 5/5 ACs, sem lacuna técnica remanescente. “Linguagem visual” requer julgamento humano: o relatório comprova componentes compartilhados e continuidade de navegação, não registra aceite visual em nome do usuário.

## Gate independente anterior aos retoques finais

Executado com Node22.22.2:

```text
DATABASE_URL=<banco exclusivo music_uat_verify> pnpm db:migrate
DATABASE_URL=<banco exclusivo music_uat_verify> DATABASE_URL_TEST=<mesmo banco> NODE_ENV=test pnpm check
```

`pnpm check` terminou com exit0: format, lint, typecheck, testes e build passaram. Testes têm cache desabilitado; demais etapas puderam reutilizar cache Turbo válido. Nenhum teste acessou o banco `music_launch_preview` utilizado pelo principal.

| Suíte     | Testes PASS |
| --------- | ----------: |
| Web       |          74 |
| API       |          64 |
| Contracts |          16 |
| Domain    |          10 |
| Providers |           9 |
| Worker    |          28 |
| Total     |         201 |

Baseline anterior desta sessão:185 testes; delta+16. Zero falhas e zero skips. Assertions antigas do contador numérico foram substituídas por assertions da jornada por nomes porque o requisito mudou explicitamente; nenhum teste foi desabilitado para contornar falha.

Log do gate independente: `output/studio-flow-uat-fixes/verifier-check.txt`. O principal recebeu o log temporário original para persistência. A frente frontend comunicou74 unit,44 E2E e React Doctor100; o verificador examinou os novos casos E2E, mas não repetiu a interação visual do browser Codex nem reexecutou E2E nesta rodada.

## Launcher: isolamento e controles

O verificador copiou o launcher para scratch e criou um `.env` exclusivamente sintético. Nenhum serviço foi iniciado. Nenhuma chave real foi lida nesse ensaio. Os nove casos `off|lyrics|lyrics-audio × api|worker|web` passaram:

- Off não disponibiliza AI.
- Lyrics habilita somente letra na API.
- Lyrics-audio habilita letra na API e áudio no worker.
- Web recebe todas as flags de AI desativadas em qualquer modo.
- Capas permanecem desligadas, pagamento disabled e email local-log.
- Modelo requerido ausente encerra com exit1; modo não suportado encerra com exit2.

Artefato: `output/studio-flow-uat-fixes/verifier-launcher-checks.json`. `bash -n scripts/local-preview.sh` também passou.

O opt-in do launcher não é um limitador monetário. A autorização de até US$3 e a interrupção ao atingir o teto pertencem à operação conduzida pelo principal. Limite de tokens restringe a resposta, mas não prova teto financeiro de uma sequência de chamadas. Preço/custo e resultados reais devem constar no relatório operacional do principal, com credenciais omitidas.

## Sensor comportamental

Três mutações independentes somente em cópias descartáveis da web. Comando equivalente ao gate rápido: `vitest run src/studio-uat.test.tsx --fileParallelism=false`.

| Mutação                                      | Referência                                | Resultado observado                                                  | Estado |
| -------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------- | ------ |
| URL sobrescreve ocasião por texto inventado  | `apps/web/src/pages/create-story.tsx:156` | Esperado `Encontro em Recife`, recebido `Invenção`.                  | Killed |
| Campo personalizado aparece também no preset | `apps/web/src/pages/create-story.tsx:370` | Duas assertions `not.toBeInTheDocument` detectaram textbox indevido. | Killed |
| Retirar aria-current da etapa por nome       | `apps/web/src/components.tsx:189`         | Esperado atributo `aria-current=step`, recebido null.                | Killed |

**Result**: PASS, 3/3 killed, zero survived. Falhas de resultado, não de sintaxe/compilação. `git status --porcelain` idêntico antes/depois; scratch removido. Dados detalhados: `output/studio-flow-uat-fixes/verifier-sensor/results.json`.

## Qualidade e fronteiras

A revisão encontrou funções e componentes pequenos, contratos aditivos para custom_song e manutenção das regras legadas. URL altera somente intenção; rascunho mantém campos independentes. Radios nativos agrupados por fieldset substituem controles redundantes; textos customizados têm estado próprio para sobreviver à troca de preset. O shell visual é reutilizado nos consumidores reais da jornada. Não foram introduzidos gateway, migration, DI ou infraestrutura adicionais.

Não restaram lacunas técnicas nesta revisão. As lacunas iniciais de cobertura de clima/reload e contexto enviado ao provider foram resolvidas com assertions específicas antes do gate. O principal pode registrar essas lições de projeto no seu ownership de documentação.

O verificador não chamou providers, não expôs credenciais, não usou banco do preview e não fez commit/push/deploy. A autorização de chamada real não equivale à sua conclusão; o principal registra separadamente sucesso/falha, gasto observado e limites da prova. CI remoto, Railway e produção continuam fora desta validação. Um novo aceite humano da experiência permanece necessário para encerrar a UAT subjetiva.

## Extensão UAT-05: HTTP permanente de áudio

**Result**: PASS técnico focal.

| AC     | Resultado esperado                                                                                                                                           | Evidência e asserção                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Resultado |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| UAT-05 | Erro HTTP permanente, incluindo402, encerra o job sem retry automático inútil; transitórios continuam retomáveis e admin pode reabrir após corrigir a causa. | `apps/worker/src/worker.test.ts:207`: HTTP400/401/402/403/404/422 fazem uma chamada; linha208: `terminal:true`; linhas210–212: diagnóstico sanitizado. Linha226:402 com marcador de filtro também faz uma chamada e linha227 confirma terminal. Linhas244–246:408/429/500/503 fazem cinco tentativas sem terminal. `apps/worker/src/flow.test.ts:668`: job failed attempts1; linha673: pedido failed; linha681: segundo tick não chama provider; linhas703/706/714: retomada produz job completed attempts2, review_required e variantes[1,2]. | PASS      |

A retomada desse teste de worker aplica a mesma mutação SQL do comando administrativo de retry e troca fetch por sucesso sintético. Não é um segundo teste HTTP do admin; autorização e comando HTTP já possuem cobertura API na entrega anterior. O histórico de tentativas não é zerado.

A revisão identificou e corrigiu uma precedência incorreta: texto `PROHIBITED_CONTENT` no body de402 poderia prevalecer sobre o status e provocar duas chamadas. A classificação HTTP agora depende somente do status; o corpo é cancelado e não entra no diagnóstico. O filtro retornado no stream200 preserva seu orçamento anterior de duas tentativas.408 permanece transitório junto com429 e5xx.

### Verificação posterior

Com Node22.22.2 e `DATABASE_URL_TEST` exclusivo de `music_uat_verify`, `pnpm --filter @resenha/worker test` passou40/40, sem skips e sem rede real. O banco foi criado/migrado apenas para esta rodada e removido ao final.

O novo `pnpm check` iniciou, mas parou no formatter de `docs/studio-flow-uat-fixes.md`, enquanto o principal escrevia esse documento. Depois da formatação, o principal adiou a repetição integral porque API e web já estavam recebendo a próxima feature. Portanto:

- Gate integrado201 PASS é o snapshot anterior, não um resultado do estado final215 nem de alterações futuras.
- Web final76 PASS e E2E44 PASS constam em `output/studio-flow-uat-fixes/web-unit-final.txt` e `web-e2e-final.txt`, examinados pelo verificador.
- Worker40 PASS é a execução focal independente posterior desta seção; log entregue ao principal em `/tmp/music-uat-worker-final-verifier.log` para persistência.
- Lint/typecheck do worker passaram na frente autora; o próximo gate integrado deve incluir todo o estado então congelado.

### Sensor complementar

| Mutação                                | Referência                      | Falha observável                                     | Resultado |
| -------------------------------------- | ------------------------------- | ---------------------------------------------------- | --------- |
| Eliminar terminal dos HTTP permanentes | `apps/worker/src/worker.ts:319` | Sete testes falham porque esperavam `terminal:true`. | Killed    |
| Classificar408 como permanente         | `apps/worker/src/worker.ts:319` | Esperadas cinco chamadas, recebida uma.              | Killed    |

**Result**: PASS, 2/2 novos mutantes mortos; somados à rodada web, 5/5 detectados, zero sobreviventes. Cópias descartáveis removidas e `git status --porcelain` idêntico antes/depois. Logs foram entregues ao principal para `output/studio-flow-uat-fixes/verifier-worker-sensor/`.

O principal relatou um pedido real entregue e registrou sua evidência/custo separadamente. Este verificador não certificou aquele ensaio, não repetiu chamadas pagas e não alterou o limite financeiro da chave. O PASS desta seção trata da classificação de erro, persistência e retomada observadas com fetch sintético e PostgreSQL isolado.
