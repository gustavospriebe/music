# Evidência de ativação — 12/09/2026

Status: em execução; gates locais PASS, publicação e homologação em andamento.

## Gate da revisão local

Node 22.22.2/PostgreSQL 18.6: `pnpm check` passou com 484 testes Vitest, um teste operacional, format/lint/typecheck/build. E2E 48/48. React Doctor 85/100, uma recomendação de complexidade e nenhum erro. As provas do delta incluem ambientes financeiros separados, NULL histórico recusado, namespaces de webhook, credenciais incompatíveis recusadas antes da rede, administração + capability no sandbox e receita/custo segregados.

O gate consolidado encontrou três expectativas antigas/inadequadas: receita derivada de status de pedido, fixture financeira sem ambiente e comparação integral de métrica temporal da fila. Foram corrigidas; o gate completo foi repetido e passou. A revisão final local foi assumida pelo orquestrador após dois subagentes atingirem limite de uso; não há parecer independente global novo inventado.

Migrations 0000–0016 em instalação limpa e atualização conferidas: 213 colunas, 17 enums, 247 constraints, 72 índices e 17 hashes de journal. Histórico preserva NULL em pagamentos e webhooks. Cópia restaurada dos dados Railway também atualizada até 0016 com sucesso.

O dono confirmou prosseguir após a solicitação de limite US$ 3 em IA e e-mails ao ADMIN_EMAIL. Consumo efetivo será registrado separadamente; a autorização não implica compra de plano ou dinheiro real.

## Baseline comprovado

- Git inicial: main em `62b571ec251e52009383f0c6aa36d88b882468c8`, WIP preservado. CI desse commit passou; não valida o WIP.
- Railway projeto `musica`, único ambiente chamado production. Web em `62b571e`; API/worker em `3b9ef69`.
- SSH consultou PostgreSQL 18.6 x86_64. Nove migrations, 0000–0008, hashes iguais aos arquivos locais. Quatro pedidos, um pagamento histórico aprovado, um job de áudio falho, zero stored_files. Nenhum conteúdo pessoal foi incluído nesta evidência.
- Dump privado: 54.518 bytes; SHA-256 `49cc2531f1c464b8cfedf358dae329aa0540b99a17904940cb9aff9df750c8ff`. Restore em PostgreSQL 18 isolado passou; migrations até 0015 passaram na cópia. O dump contém dados privados e fica fora do repositório.
- Railway: CI obrigatório habilitado nos três triggers; watch patterns do web agora incluem packages. Variáveis para próxima implantação: revisão manual, modelo de letra e credencial de reconciliação no worker, pagamento sandbox e comércio fechado. Ainda não constituem deploy.
- Resend: GET domains 200; domínio do EMAIL_FROM verificado. Nenhum envio desta etapa ainda.
- Bucket: listagem completa autorizada, zero objetos. Não há prova de restore de objetos até aqui.
- AbacatePay: consulta autenticada do produto 200, devMode=true, 4.990 centavos. Webhook V2 sandbox ainda registrado na rota antiga. Adapter novo executou lookup exato de referência inexistente: nenhum resultado, zero POST.
- OpenRouter: chave autenticada e quatro modelos configurados encontrados no catálogo. Nenhuma inferência executada. Limite da chave ausente não significa autorização de gasto.

## Limites externos observados

- O CI de `e22b030` expôs duração imprecisa no FFmpeg 6.1: fixture de 12 segundos reportava 11.776 ms, apesar de decodificar 192.000 bytes PCM mono/8 kHz/16 bits. A medição passou a contar amostras completas. Testes incluem a fronteira 10 s/9,999 s. Worker 81/81 local; CI de `a43b180` passou.
- Configuração remota web continha `VITE_API_URL=https://api.railway.internal`, inacessível ao navegador. Os domínios `*.up.railway.app` também são sites distintos na Public Suffix List. A web agora usa a própria origem; Nginx encaminha `/api` ao `API_UPSTREAM` interno em runtime. Web 106/106, typecheck/lint e imagem local passaram; sensor Docker confirmou cookies, query, Range, upload maior que 1 MB, 404 da API e navegação SPA. React Doctor 85/100, sem erro novo. Promoção ainda pendente.

- Backup nativo Railway rejeitado por API. O painel esclarece: backups/PITR exigem plano Pro. Não houve mudança de plano; o dump externo privado acima protege esta operação, mas não é rotina automática de recuperação.
- Checkout hospedado e PIX transparente têm contratos diferentes; o endpoint documentado de simulação transparente não será usado por tentativa num ID de checkout hospedado.
- Venda real, política comercial e qualidade artística continuam sem comprovação nesta etapa até execução/aceite explícitos.
