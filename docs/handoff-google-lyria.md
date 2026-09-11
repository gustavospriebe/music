# Handoff — Música da Resenha / Google Lyria e comparação de modelos

Preparado em 07/09/2026. Repositório: `/Users/gustavopriebe/dev/music`. Leia este documento como contexto de continuidade, não como prova de que processos e preços permanecem iguais na próxima sessão.

## Atualização da sessão de 08/09/2026

T1–T7 da integração Google Lyria 3.5 foram implementados, os gates locais passaram e o comparador foi executado após confirmação explícita do usuário. A rodada live usou exatamente quatro chamadas, duas para `google/lyria-3-pro-preview` via OpenRouter e duas para `lyria-3.5` via Google direto; todas terminaram `ok`, com custo observado de US$0,32 e quatro arquivos MP3 em `output/google-lyria-comparison/2026-09-08T12-14-53-374Z/`.

A evidência técnica e a verificação independente estão em `docs/google-lyria-comparison.md` e `.specs/features/google-lyria-integration/validation.md`. O veredicto permanece `PARTIAL`: falta escuta humana, sensor de discriminação e homologação/produção. Nenhum modelo foi promovido a default. Não houve commit, push, deploy nem limpeza do WIP.

Próximo passo: ouvir os quatro arquivos, registrar a avaliação artística separadamente, testar o painel de falhas no preview e seguir o runbook externo antes de qualquer publicação.

## Pedido mais recente e foco da próxima sessão

Na preparação de 07/09, o usuário adicionou `GOOGLE_API_KEY` ao `.env` para uso e pediu handoff + prompt para continuar em outra sessão. A presença não vazia foi verificada sem imprimir o valor; naquele momento nenhuma chamada Google havia sido executada.

Próximo foco proposto: preparar integração Google direta para comparar Lyria3.5 com o Lyria3Pro atual, tornar a seleção de fornecedor realmente intercambiável e avaliar qualidade musical/recusas com letras controladas. MurekaV9/V9.5 é candidata posterior; não há chave Mureka confirmada. A chave Google não é consumida hoje pelo worker nem carregada pelo opt-in de `scripts/local-preview.sh`.

## Leituras em ordem

1. `AGENTS.md` e `docs/project-context.md`: arquitetura, dados privados, transições e operação.
2. `.specs/STATE.md`: estado geral; reconcilie com Git e runtime antes de agir.
3. `docs/music-model-research-2026-09-07.md`: pesquisa consolidada, fontes oficiais, limites, preços, shortlist e adaptação necessária. Não repetir a pesquisa inteira; atualizar apenas fatos necessários à integração.
4. `.specs/features/admin-recovery/validation.md` e `docs/admin-recovery.md`: comportamento administrativo já entregue e validado.
5. `docs/lyrics-prompt-review.md`: avaliação artística parcial da escrita. Comparações em `output/lyrics-prompt-review/`.
6. Para histórico de UI/UX, consultar `docs/launch-remodel-report.md`, `docs/studio-flow-uat-fixes.md`, `docs/lyrics-production-polish.md` e respectivas specs.

Todos os caminhos relativos acima pertencem ao repositório informado. Os artefatos existentes são a fonte detalhada; este handoff não os substitui.

## Estado verificado e preservação do trabalho

- Branch `main`, HEAD `c9f3d045e9cba1ef9965e4005882ade0dcc496bb`, confirmado nesta checagem. Há WIP extenso, inclusive arquivos não rastreados. Não presumir que o diff inteiro pertence ao novo trabalho. Não resetar, limpar, fazer stash amplo, commit, push ou deploy.
- Último gate integrado anterior a este handoff: `pnpm check` PASS, **289 testes executados** (API100/web107/worker45/contracts17/domain11/providers9), formato/lint/typecheck/build. Frontend: **48E2E** e React Doctor100/100; verificador independente: sensor7/7 detectado. Evidências e atribuição exata em `.specs/features/admin-recovery/validation.md` e `output/admin-recovery/`.
- Esses gates cobrem o código anterior, não a integração Google futura. A pesquisa de modelos alterou somente seu relatório e evidência visual. Esta preparação adiciona apenas documentos de continuidade.
- CI remoto permanecia falhando no último HEAD publicado; Railway tinha serviços vazios web/api/worker e nenhum deployment/Postgres/Bucket no último levantamento. **Não revalidados nesta preparação**; não inferir produção pronta a partir dos testes locais.

## Runtime local: não assumir que tudo continua ligado

- API `http://127.0.0.1:3010/api/v1/health/ready` respondeu `{"status":"ok"}` nesta checagem.
- Web `http://127.0.0.1:5180` não respondeu (HTTP000/conexão recusada). Reinspecionar e subir a web se necessário.
- Banco `music_launch_preview`, PostgreSQL Docker `music-postgres-1`, porta5433: **preservar dados**. Consulta de fila encontrou zero jobs pending/processing nesta checagem. Reconsultar antes de qualquer reinício de worker: esse estado pode mudar.
- Existem processos `tsx` no computador; sua presença não comprova que são o worker deste preview. Identificar cwd, porta e configuração antes de encerrar qualquer processo. Não usar `pkill` genérico.
- Runtime do projeto: Node22.22.2 e pnpm12.3.4 via Corepack. Há Node24 no ambiente padrão e em outros processos; não usar para gates deste projeto.

Comando para subir a web, após conferir porta e processos:

```sh
cd /Users/gustavopriebe/dev/music
env PATH=/Users/gustavopriebe/.nvm/versions/node/v22.22.2/bin:$PATH bash scripts/local-preview.sh web
```

O launcher mantém banco/storage locais separados, pagamento de desenvolvimento e e-mail local. Leia o arquivo antes de mudar seleção de IA. `PREVIEW_AI=all` habilita providers reais OpenRouter existentes; não é um modo sintético. Worker com IA foi deliberadamente configurado sem watch, para alterações de arquivo não interromperem chamadas cobradas.

## Credenciais e orçamento

- `.env` contém `GOOGLE_API_KEY`, adicionada pelo usuário. Não mostrar seu conteúdo, copiar para docs, colocar no frontend ou converter isso em licença para gastos ilimitados. Fazer backup privado antes de qualquer alteração de configuração.
- Autorização anterior: até **US$3 para a rodada OpenRouter**. Último consumo acumulado observado: **US$0,6648398**, antes da pesquisa e deste handoff; é um valor histórico, não saldo atual garantido. Pesquisa e admin-recovery não dispararam novas gerações pagas.
- O usuário disponibilizou a chave Google para uso, sem ampliar o teto da rodada. Preparar adapter e testes sem rede paga primeiro; conferir o orçamento restante antes do ensaio real e contabilizar Google e OpenRouter juntos no limite de US$3. Não somar US$3 por fornecedor nem tratar o contador OpenRouter como gasto Google. Se não for possível determinar o restante ou for necessário ampliá-lo, alinhar isso uma única vez com o usuário; não repetir autorização já concedida para o trabalho preparatório.
- A pesquisa propõe um ensaio completo de48 faixas por US$4,26 nominais, **não executado nem autorizado nesse valor**. Ler o relatório para dimensionar uma amostra menor.
- Não reenviar automaticamente o pedido real recusado pelo filtro, modificar sua letra aprovada ou mandar e-mail externo. Para comparação, usar material fictício/revisado e storage/banco de teste separados.

## Descobertas que orientam a continuação

- Google documenta `lyria-3.5`, preview, US$0,08/faixa, via API Interactions. Catálogo público OpenRouter consultado em07/09 tinha somente Lyria3Pro/Clip. Não inventar slug `google/lyria-3.5` no gateway nem confundir disponibilidade documental com acesso da chave.
- Recusa `PROHIBITED_CONTENT` não revela a palavra responsável. Há filtros de entrada e de saída; a pesquisa não diagnosticou a causa exata do pedido. Comentários no código sobre instruções dispararem falsos positivos são hipóteses anteriores, não resultado de estudo controlado.
- MurekaV9: US$0,045/faixa; V9.5: US$0,15/faixa, letra fornecida. Preços confirmados no browser oficial, não preços de assinatura. Recursos de extensão/edição pertencem a versões específicas. Ver detalhes, termos e fontes no relatório.
- O modelo de texto cria a letra; o modelo musical é instruído a cantá-la. A qualidade editorial continua **parcial**. Não alterar letra e áudio simultaneamente em uma comparação que pretende atribuir melhora a um modelo.
- A foto de sobremesa que virou uma cena de fantasia foi auditada, mas o prompt da capa ainda não ganhou modos explícitos de preservar assunto versus inspiração. A correção já feita exige nova referência quando a foto esperada foi removida; não resolve sozinha a fidelidade visual.

## Fronteiras de código úteis

- `apps/worker/src/worker.ts`: `MusicProvider`, `createOpenRouterMusicProvider`, `generateMusicOnce`, `processAudioJob`, tratamento de tentativas, arquivos e custo. Hoje há transporte OpenRouter e registros com nome de fornecedor fixo.
- `packages/domain/src/index.ts`: `makeMusicPrompt` recebe letra aprovada; pede aproximadamente2min e usa `fullLyrics`. O limite interno7.000 caracteres excede Mureka5.000/MiniMax3.500. Não truncar silenciosamente uma letra aprovada.
- `apps/api/src/providers.ts`: composição/refino de letra, separado do provider musical.
- `apps/api/src/configuration.ts`, `apps/api/src/env.ts`, `.env.example`, `scripts/local-preview.sh`: seleção/disponibilidade e ambiente. A chave Google precisa passar por configuração server-side explícita e testes que impeçam vazamento para a web.
- `apps/api/src/recovery.ts`, rotas administrativas e `apps/web/src/admin/order-*.tsx`: recuperação existente. Preservar pagamento/letra aprovados, exclusão mútua, variantes prontas e histórico. Retentar e-mail deve continuar sem gerar áudio.

Evolução proposta: adapter Google com entrada comum de letra, estrutura, direção e duração; seleção explícita; provider/modelo/custo reais registrados por execução; tarefa externa persistida se exigida pela API. Reutilizar a fila PostgreSQL e os contratos atuais quando suficientes, evitando uma nova infraestrutura genérica.

## Como conduzir a próxima sessão

Usar subagentes em frentes concretas e sem sobreposição: adapter/configuração; ensaio comparativo/documentação; verificação independente. O principal coordena, revisa decisões, integra e valida no browser. Os nomes da equipe anterior eram backend_readiness, customer_redesign e verification; uma sessão nova não deve presumir que seus handles continuam disponíveis.

Skills sugeridas: `tlc-spec-driven` para planejar/executar a integração; `matt-diagnose` para falhas reproduzíveis de provider; `react-doctor` apenas se houver alteração React. Consultar docs oficiais atuais do Google; não é uma tarefa de API OpenAI só porque usamos Codex/OpenRouter.

Sequência recomendada:

1. Reconciliar documentos, WIP, ambiente e custos; localizar primeiro o que já existe.
2. Definir uma fatia pequena para Google3.5, preservando OpenRouter e sem editar pedidos existentes.
3. Implementar configuração/adapter e testes relevantes em DB descartável nomeada; não truncar, migrar ou reseedar o preview para testes.
4. Conferir orçamento restante da rodada; gerar amostra fictícia pequena dentro dele, comparar letra idêntica, registrar recusa/latência/custo e ouvir com avaliação humana. Perguntar somente se o restante não puder ser determinado ou o experimento exigir ampliação.
5. Validar recuperação administrativa e UI quando afetadas. Não promover o novo modelo como melhor/default com base só em docs ou uma geração bem-sucedida.
6. Atualizar evidências e handoff; sem commit/push/deploy até autorização específica.
