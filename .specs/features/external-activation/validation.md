# Evidência de ativação — 12/09/2026

Homologação técnica executada no Railway; comércio público fechado. A integração foi concluída na [PR #2](https://github.com/gustavospriebe/music/pull/2). Nenhum resultado abaixo comprova venda real ou aceite artístico.

## Git, CI e promoção

- Baseline: `main`/`origin/main` em `62b571e`, web nesse commit e API/worker em `3b9ef69`. WIP original preservado, consolidado na branch `codex/operational-activation`.
- Primeira promoção conjunta comprovada: SHA `2a7aa597c0f3dddf0e46a9800a593948fce7b2ed`, três serviços SUCCESS no projeto Railway **musica**, ambiente chamado production. Nesse ambiente, `NODE_ENV=production`, `PAYMENT_ENVIRONMENT=sandbox`, `COMMERCIAL_READY=false` e revisão manual.
- CI desse SHA: [push 34703996881](https://github.com/gustavospriebe/music/actions/runs/34703996881) e [PR 34703998723](https://github.com/gustavospriebe/music/actions/runs/34703998723), ambos PASS: 485 testes Vitest, um operacional, format/lint/typecheck/build, sensor da imagem web AMD64 e 48 E2E. O pequeno delta final acrescenta dois testes de diagnóstico de webhook e torna explícito no admin que aceite de e-mail não é recebimento; seus checks constam na PR. O gate local completo desse delta passou com **487 Vitest + um operacional**, format/lint/typecheck/build e React Doctor85/100 sem erro.
- CI obrigatório nos três triggers; web observa também packages. API com pre-deploy único de migrations. API/worker antigos foram retirados antes do schema incompatível: instâncias antigas encerradas, zero outros clientes PostgreSQL e zero jobs ativos conferidos antes do dump final.

## Banco e recuperação real

- PostgreSQL remoto **18.6**. Após a promoção, journal `0000`–`0016`, **17 hashes iguais** às migrations locais. Catálogo somente `custom_song`; `leads`/`order_items` ausentes. Preço comercial permanece zero. Histórico financeiro sem procedência conserva `environment=NULL`.
- Instalação limpa e upgrade: 213 colunas, 17 enums, 247 constraints, 72 índices e 17 entradas do journal equivalentes. Cópia dos dados reais também atualizada em banco isolado. O volume PostgreSQL 16 local não foi migrado.
- Dump após drenagem: **54.518 bytes**, SHA-256 `45c03c3aa1af95098acd43068f41725d4256a93599dc03f6ba138e124498c11a`. Seu conteúdo de dados coincidiu com o ensaio anterior. Dumps e dados pessoais ficam fora do repositório, com acesso local restrito.
- Após homologação: dump de **86.485 bytes**, SHA-256 `fdadea58777825d54b631a80137e74716f86ef9bccda4830803ca7425b295587`. Os **três objetos reais / 6.146.685 bytes** foram exportados, restaurados em prefixo S3 temporário próprio, relidos e comparados por chave/tamanho/SHA-256. O prefixo de prova foi removido; os objetos originais foram preservados.
- Restore do banco em PostgreSQL 18 isolado e dos objetos no storage local: entrega 200, duas faixas, Range 206/1.024 bytes, pedido sem capability 401 e download após revogação 404. A revogação ocorreu somente na cópia restaurada.
- Dump de encerramento, incluindo correção de destinatário e rascunho do navegador: **87.376 bytes**, SHA-256 `6a3cb77b6222360a9409ab72a12dc92acf42549e7900de84281e3249b7e7d01b`; zero jobs ativos. A chave SSH temporária da operação foi revogada após o export.
- **Limite:** backup nativo/PITR Railway exigiu plano Pro; nenhuma assinatura foi alterada. O export pontual prova recuperação, não retenção ou backup automático em destino independente. Essa rotina continua como gate comercial.

## Pagamento e webhooks externos

- Consulta autenticada confirmou produto sandbox, ativo, **4.990 centavos**. Somente o pedido fictício recebeu esse snapshot técnico, com evento identificando sua finalidade; o catálogo comercial não foi reprecificado.
- Checkout real criado pelo adapter com admin + capability; sem admin foi recusado. O navegador exibiu Sandbox Mode e executou **Simular Pagamento** no checkout hospedado. Não se usou o simulador de PIX transparente nem se fabricou confirmação.
- A reconciliação periódica consultou o gateway, confirmou ambiente/identidade/valor e produziu exatamente **uma produção**. O primeiro webhook autenticou, mas respondeu 503. A causa específica não ficou registrada; não é possível atribuí-la com certeza a latência ou consistência do provider.
- Dois reenvios do evento de pagamento pelo painel do gateway responderam **200**, às 16:23:44 e 16:25:01 UTC. O ledger contém **dois eventos sandbox processados**, para a mesma cobrança, com uma produção e quatro chamadas de IA no total. O reenvio do painel criou identidades de evento distintas: não é prova externa de repetição byte a byte do mesmo ID. Deduplicação por ID idêntico e liquidação concorrente são comprovadas nos testes PostgreSQL.
- O POST sem autenticação respondeu 401. A nova rota é `/api/v1/webhooks/abacatepay`, com secret privado e assinatura HMAC obrigatórios. O webhook antigo na rota inexistente `/abacate-pay` foi removido; listagem final confirmou apenas o endpoint canônico.
- O delta final registra etapa e código fixos para futuras falhas de processamento, sem erro bruto, IDs, URL ou payload. Os sensores cobrem consulta ainda pendente → 503 sem efeito, confirmação posterior → 200 e duplicata sem novo efeito.
- Observou-se divergência documental na remoção do webhook: o exemplo da página enviava ID no corpo e retornou 422; o [MCP oficial](https://github.com/AbacatePay/abacatepay-mcp/blob/main/src/tools/webhooks.ts) usa query, formato que funcionou. O resumo de assinatura também diverge da [página de segurança](https://docs.abacatepay.com/pages/webhooks/security), usada pelo adapter.

## IA, revisão e entrega

- Autorização do dono: até **US$ 3** de IA e e-mail de teste; posteriormente informou outro destinatário para corrigir devolução. Não houve PIX real, upgrade de plano ou ativação comercial.
- Jobs reais concluídos na primeira tentativa: letra, duas versões de áudio e capa. Os áudios decodificados têm **121.966 ms** e **123.429 ms**. O pedido parou em `review_required`, como configurado, e foi liberado explicitamente como prova técnica fictícia.
- `ai_calls`: quatro chamadas concluídas. Custo informado **US$ 0,197599**: letra 0,003867, áudio 0,160000 e capa 0,033732; nenhum custo estimado ou desconhecido. Delta observado no total da chave OpenRouter: **US$ 0,19759825**, diferença de arredondamento abaixo de um milionésimo de dólar. Isto mede esta amostra, não preço/margem comercial.
- `deliver_notify` executado pelo worker, primeira tentativa; Resend aceitou. A consulta posterior revelou bounce `550 5.4.4 Invalid domain` no endereço então usado como ADMIN_EMAIL. A tentativa e o login foram preservados.
- Com o destinatário corrigido pelo dono, uma intenção **operacional de homologação** separada foi persistida antes do envio, usando a mesma mensagem/link e o mesmo adapter dentro do container worker. Resend confirmou **last_event=delivered**. Isso prova entrega ao servidor destinatário, não leitura da caixa nem aceite artístico. Não se apresenta essa correção operacional como funcionalidade de alteração de destinatário na UI.
- O admin agora chama `sent` de **Aceito pelo provedor**, com orientação para consultar devoluções. Não existe reconciliação automática de bounce no app; acompanhamento de entrega no Resend faz parte da operação inicial.
- API real: entrega sem contato/briefing, duas faixas, download Range 206/1.024 bytes, `Cache-Control: private, no-store`; pedido sem capability 401. A restauração isolada confirmou também revogação.

## Navegador e defeitos encontrados pelo CI

- O web remoto apontava `VITE_API_URL` para endereço interno inacessível ao navegador; os domínios Railway de API/web também eram sites distintos para cookies. O bundle passou a usar a própria origem; Nginx encaminha `/api` para `API_UPSTREAM=http://api.railway.internal:3001` em runtime.
- Navegador real no web publicado: preparação completa de história fictícia, criação e salvamento do pedido, abertura do estúdio e recarga mantendo acesso privado. Nenhuma geração extra foi acionada nesse teste. O retorno do checkout aberto em sessão diferente da capability foi corretamente recusado; não é prova de retorno completo do checkout na mesma sessão.
- Sensor Docker local e CI: caminho/query, cookies, Range, upload maior que 1 MB, erro 404 da API e fallback SPA. E2E usa respostas controladas e não substitui os testes externos acima.
- FFmpeg 6.1 reportava 11.776 ms para fixture de 12 s. A medição agora conta bytes PCM decodificados; sensores incluem 10 s aceito e 9,999 s recusado. O teste de lease foi corrigido para observar renovação real enquanto o provider está bloqueado, sem depender de agendamento em 120 ms.
- React Doctor: 85/100, recomendação preexistente de complexidade, sem erro. Revisão global final assumida pelo orquestrador após dois subagentes atingirem limite de uso; revisão delegada do diagnóstico de webhook passou. Não há novo parecer independente global inventado.

## O que ainda não está autorizado/comprovado

Preço e condições comerciais aprovadas/publicadas; escolha final/KYC do gateway e PIX de produção; reembolso real no gateway; aceite artístico por escuta humana; backup recorrente independente com retenção; capacidade medida para um prazo comercial; política completa de retenção/exclusão e responsável por suporte/incidentes. Essas pendências mantêm `COMMERCIAL_READY=false`.

## Encerramento da implementação publicada

PR #2 integrada na `main` em **`efb0f1789adbebc9beea02e92d538b885fe17544`**, com árvore idêntica ao HEAD `7092ebb` aprovado. [CI da main34706291941](https://github.com/gustavospriebe/music/actions/runs/34706291941) PASS; checks do HEAD da PR34706072351/34706074833 também PASS, **487 Vitest + um operacional e 48 E2E**.

Os três serviços ficaram SUCCESS nesse mesmo SHA: API `f4afaf96-da0d-4792-9d79-29c742408e91`, web `f347a8d6-754b-41e7-81f9-10b7308db742`, worker `f89b8949-3e73-4807-b3d4-06cdda5c06ac`. O worker foi promovido explicitamente após o CI porque o trigger o pulou por arquivos inalterados. Health API/proxy200, página inicial200, erro da API404 preservado como JSON, pagamento sandbox e comércio fechado reconfirmados.

Acesso anônimo aos três objetos S3 respondeu403. `VITE_API_URL` foi removida do serviço web; somente o upstream de servidor permanece. Sessão administrativa encerrada; chave temporária ausente da lista Railway e material SSH local removido. Este registro documental posterior descreve o SHA de implementação acima; diferenças posteriores limitadas a STATE/validação não alteram a imagem testada.
