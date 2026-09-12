# Configuração de providers e ativação comercial

Este guia descreve configuração do código local; não certifica provider, versão implantada ou cobrança em produção. A disponibilidade dos modelos e os contratos externos devem ser revalidados no [mapa de providers](providers.md) antes de uma chamada autorizada. Comece pelo `.env.example`; não copie valores secretos para Git, frontend, logs ou mensagens.

API/worker precisam reiniciar quando sua configuração muda. A web chama `/api` na sua própria origem; `API_UPSTREAM` configura o proxy Nginx em runtime (no Railway, `http://api.railway.internal:3001`). Não use domínios separados do Railway para cookies de cliente. Alterar apenas o env da API não configura automaticamente o worker.

## Preparação sem cobrança

`PAYMENT_PROVIDER=disabled` e `COMMERCIAL_READY=false` permitem preparar o ambiente sem habilitar PIX real. Fora de produção, ausência de provider configurado permite confirmação local explicitamente identificada; em produção não há fallback de pagamento. E-mail local grava em arquivo. Não há geração sintética de letra/áudio/capa apresentada como provider real.

O catálogo define o preço, com snapshot no pedido. `SONG_PRICE_CENTS` aceita centavos inteiros; zero deixa cobrança real indisponível. O seed cria `custom_song` e pode preencher preço ainda zero; não muda preço já definido nem pedidos antigos. Seed é ativação controlada, separado de migration.

Para ativar comercialmente, definir e publicar `SUPPORT_EMAIL`, `DELIVERY_ESTIMATE`, `REVISION_POLICY`, `REFUND_POLICY`, `USAGE_LICENSE`, `TERMS_URL`, `PRIVACY_URL` e `POLICY_VERSION`. URLs de política devem ser distintas, HTTPS e específicas; versão iniciada por `draft` não habilita checkout real. `COMMERCIAL_READY=true` só expressa uma decisão após esse trabalho. A aplicação não verifica juridicamente o texto nem comprova que as páginas foram publicadas.

## Contrato de pagamento

O adapter atual é AbacatePay; a escolha comercial definitiva continua do dono. Selecionar outro nome no env não cria suporte a outro gateway. O port em `packages/providers/src/payment.ts` oferece `createCheckout`, `getPayment` e `findPayment`. O domínio normaliza identidade, referência, centavos, BRL e estados; o settlement em `packages/database` é compartilhado por webhook e reconciliação.

Um segundo gateway PIX precisa cumprir:

- Criação ligada à tentativa persistida e referência opaca; valor corresponde ao snapshot do pedido.
- Resultado normalizado com ID e referência inequívocos, moeda, valor e estado financeiro, incluindo expiração e reembolso integral.
- Webhook autenticado sobre o conteúdo exigido pelo fornecedor, deduplicação por evento e consulta da cobrança na origem.
- Idempotência externa documentada ou uma busca inequívoca que permita recuperar criação incerta sem repetir cobrança.
- Reconciliação por ID/referência e resolução pelo provider registrado na tentativa histórica, mesmo após trocar a configuração padrão.
- Testes de divergência, concorrência, timeout após aceite remoto, duplicação, observações fora de ordem e reembolso.

A chave local única evita duplicação no banco; sozinha não garante idempotência do gateway. `creating` vira `unknown` quando o resultado não é conhecido. Essa tentativa permanece ativa e impede novo POST automático. Uma busca que não encontrou resultado ainda não comprova que a criação nunca ocorreu. `approved` não regride por um evento atrasado de expiração; `refunded` é preservado.

### Adapter AbacatePay

Configurar `PAYMENT_PROVIDER=abacatepay`, `PAYMENT_ENVIRONMENT=sandbox|live`, `ABACATEPAY_API_KEY`, `ABACATEPAY_PRODUCT_ID` e `ABACATEPAY_WEBHOOK_SECRET`. No cadastro do webhook V2, informar o endpoint limpo `https://SUA_API/api/v1/webhooks/abacatepay`, secret separado e eventos `checkout.completed`/`checkout.refunded`. O fornecedor acrescenta `?webhookSecret=<segredo>` ao callback. Não registrar a URL preenchida. O identificador persistido do adapter é `abacatepay`; a rota canônica usa a mesma grafia, sem alias antigo.

Homologação no Railway mantém `NODE_ENV=production`, cookies seguros e `ABACATEPAY_REQUIRE_WEBHOOK_SIGNATURE=true`; usa `PAYMENT_ENVIRONMENT=sandbox`, `COMMERCIAL_READY=false`, chave V2 de Devmode e produto/webhook também Devmode. A API rejeita respostas e notificações com ambiente divergente, inclusive uma chave live acidental no sandbox. O default quando `PAYMENT_ENVIRONMENT` está ausente é live em runtime de produção e sandbox fora dele; configure explicitamente nos dois serviços.

Para criar checkout de homologação, autenticar em `POST /api/v1/admin/session` e conservar tanto o cookie administrativo quanto a capability do pedido. Usar a rota existente `POST /api/v1/orders/:publicId/checkout` com ambos os cookies e uma letra já aprovada. A sessão administrativa permite o ensaio sem publicar condições comerciais; o preço inteiro positivo e a configuração do provider continuam obrigatórios. Apenas capability, apenas admin ou flags enviadas no corpo/query não liberam checkout. A configuração pública informa homologação e mantém o checkout indisponível. A tentativa guarda `environment=sandbox`, um evento específico e uma nota administrativa.

Criar produto de teste via `POST /v2/products/create` com `externalId`, `name`, `price` em centavos e `currency=BRL`; conferir preço igual ao snapshot do pedido e `devMode=true`. Registrar webhook via `POST /v2/webhooks/create` e conferir `devMode=true`/V2. O checkout hospedado é criado por `POST /v2/checkouts/create` com `items`, `methods=["PIX"]`, `externalId`, `returnUrl` e `completionUrl`. A chave define o ambiente; não enviar flag `devMode`. Referências: [produto](https://docs.abacatepay.com/pages/products/create), [webhook](https://docs.abacatepay.com/pages/webhooks/create), [checkout](https://docs.abacatepay.com/pages/payment/create).

O simulador REST documentado é `POST /v2/transparents/simulate-payment?id=<checkout-transparente>`, não um simulador comprovado de checkout hospedado. Não enviar um ID hospedado a esse endpoint por suposição nem apresentar um webhook fabricado como entrega do fornecedor. Após uma simulação oficial confirmada para o hospedado, verificar o webhook real com secret e HMAC, consulta `PAID` com `paidAmount=amount`, uma única liquidação e um único job. Esse job pode consumir IA real mesmo com pagamento sandbox: manter o worker controlado até autorização de orçamento. A [documentação de segurança](https://docs.abacatepay.com/pages/webhooks/security) define HMAC SHA256/base64 dos bytes brutos com a chave pública publicada; o secret configurado autentica separadamente a URL.

O adapter exige valor do produto remoto igual ao snapshot. Autenticação do callback usa segredo configurado e verifica assinatura do corpo conforme configuração; `ABACATEPAY_REQUIRE_WEBHOOK_SIGNATURE` é verdadeiro por padrão em produção. A assinatura publicada pelo fornecedor não substitui o segredo privado. A consulta remota confirma identidade/valor/ambiente antes do settlement; retorno do navegador não comprova pagamento.

API e worker precisam da configuração necessária às consultas financeiras: o worker reconcilia tentativas pendentes e pagamentos aprovados. O resolver recusa um ambiente diferente daquele da credencial configurada antes de acessar a rede; mudar somente `PAYMENT_ENVIRONMENT` não reclassifica tentativas antigas. Encerrar/conferir pendências sandbox antes de promover a chave live. Tentativas históricas com ambiente `NULL` ficam bloqueadas até evidência oficial permitir classificação; não inferir pelo nome do provider, prefixo de ID ou runtime. Não remover credencial de um gateway com tentativas ainda não resolvidas ao testar outro. Leia [providers.md](providers.md) para contrato e limites específicos; nenhuma validação local substitui homologação e PIX de produção.

## E-mail

`EMAIL_PROVIDER=local-log` grava em `LOCAL_EMAIL_PATH` (default `./var/emails`); use caminho absoluto para evitar ambiguidade de diretório. Esses arquivos contêm links privados e requerem proteção/limpeza.

Para Resend, configurar `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` e `EMAIL_FROM` com remetente permitido no domínio verificado. Configurar no worker, onde o envio acontece. Em produção, provider local ou credencial/remetente obrigatório ausente impede inicialização. Ausência de chave fora de produção permite fallback local documentado.

`email_deliveries` persiste intenção por produção/template antes do envio: destinatário, remetente, conteúdo e link são estáveis no retry. Isso reduz duplicação, mas não garante exatamente um e-mail quando o transporte aceita e a resposta se perde. A janela externa de idempotência é um limite operacional. Confirmar recebimento real, remetente e link no Railway é gate externo.

## IA e gasto

Letra usa OpenRouter no worker: `OPENROUTER_API_KEY`, `OPENROUTER_TEXT_MODEL`, `OPENROUTER_TEXT_MAX_TOKENS`. O limite de tokens não é um teto monetário. Até três respostas recusadas pela validação podem gerar novas chamadas dentro do fluxo; cada tentativa precisa de histórico de consumo.

Áudio usa `MUSIC_PROVIDER=openrouter` com `OPENROUTER_MUSIC_MODEL`, ou `MUSIC_PROVIDER=google` com `GOOGLE_API_KEY`/`GOOGLE_MUSIC_MODEL`. Capa usa `OPENROUTER_COVER_TEXT_MODEL` e `OPENROUTER_COVER_REFERENCE_MODEL`. Nomes/defaults no repositório são configuração, não prova de disponibilidade nem recomendação de preço atual. Não inferir custo real do Google por constante estimada do adapter.

Produção exige as credenciais/modelos das capacidades utilizadas. Fora de produção, ausência de chave deve falhar explicitamente antes da rede. Antes de iniciar qualquer worker com credenciais reais, conferir jobs elegíveis no banco e uma autorização de gasto válida para a rodada; autorizações históricas não se transferem automaticamente.

`ai_calls` registra a intenção antes da rede. Timeout/resposta perdida pode representar uma chamada cobrada: `unknown` bloqueia nova chamada automática do mesmo tipo no pedido. O admin investiga e registra a liberação de recuperação reconhecendo possível custo duplicado. Esse procedimento preserva o custo desconhecido no ledger, sem declará-lo zero.

`ai_usage` distingue `reported`, `estimated`, `unknown`; uma soma conhecida incompleta não é margem comercial comprovada. HTTP transitório só permite retry quando o adapter classifica a situação com segurança. Falha de autenticação, saldo ou conteúdo não deve ser resolvida aumentando automaticamente tentativas/limite da chave. Validar áudio tecnicamente e ouvir as duas faixas continua necessário.

`AUDIO_REVIEW_MODE=manual` é default; `automatic_release` requer decisão explícita de liberar sem audição. `automatic` não é valor aceito. Revisão artística não é executada por esse flag.

## Storage e promoção

Desenvolvimento: `STORAGE_PROVIDER=local` e `LOCAL_STORAGE_PATH` absoluto compartilhado por API/worker. Produção: S3 privado, `STORAGE_S3_*` nos dois processos. API verifica acesso e transmite arquivos; o bucket não deve publicar URLs de objetos.

Backup de banco não protege bytes do storage. Preparar export/backup de objetos, retenção e restore em destino isolado; arquivos gerados têm identidades próprias e devem permanecer associados ao manifest/banco restaurado. Um script existente não comprova recuperação.

Concluir [checklist de produção](production-checklist.md) e [runbook externo](external-activation-runbook.md) com autorização específica. Não registrar AbacatePay, OpenRouter, Google, Resend ou S3 como validados em produção por testes com transporte injetado.
