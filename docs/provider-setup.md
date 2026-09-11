# Configuração de providers e ativação comercial

A aplicação funciona localmente com pagamento simulado e e-mail em arquivo. Geração de letra e capa usa OpenRouter; o áudio pode usar o OpenRouter ou o adapter direto do Google Lyria 3.5. A seleção de pagamento e e-mail é independente da interface; trocar de empresa exige um adapter implementado e homologado, não basta colar uma chave de outro fornecedor.

Comece pelo `.env.example`. Faça backup do `.env` existente e altere somente as variáveis necessárias; nunca grave chaves no frontend, no Git ou em mensagens. API e worker precisam reiniciar após mudar configuração. `VITE_API_URL` é incorporada no build da web e exige rebuild.

## Preparar sem escolher pagamento

Use `PAYMENT_PROVIDER=disabled` e `COMMERCIAL_READY=false`. Fora de produção, o checkout informa a simulação local; produção não oferece essa confirmação. `GET /api/v1/configuration` expõe um DTO público com marca, suporte, políticas e disponibilidade, sem credenciais.

O catálogo é a fonte do preço em centavos. O pedido guarda o preço no momento de sua criação. Para a criação livre, `SONG_PRICE_CENTS=0` significa preço ainda não definido; não é uma música gratuita. Ao decidir, configure centavos inteiros e execute o seed inicial: ele preenche somente o produto `custom_song` que continua sem preço. Reexecutar o seed não reprecifica produtos existentes nem pedidos antigos. Uma mudança posterior de preço deve ser deliberada no catálogo.

Checkout real exige preço positivo, provider configurado e condições publicadas. Preencha `SUPPORT_EMAIL`, `DELIVERY_ESTIMATE`, `REVISION_POLICY`, `REFUND_POLICY`, `USAGE_LICENSE`, `TERMS_URL` e `PRIVACY_URL`; só marque `COMMERCIAL_READY=true` depois de aprovar e publicar esses conteúdos. A aplicação não define prazo, licença, reembolso ou preço por você.

## Pagamento

O adapter atual é AbacatePay Checkout hospedado. Para escolhê-lo, defina `PAYMENT_PROVIDER=abacatepay`, `ABACATEPAY_API_KEY`, `ABACATEPAY_PRODUCT_ID`, `ABACATEPAY_WEBHOOK_SECRET` e `ABACATEPAY_WEBHOOK_URL`. A URL de notificação é `https://SUA_API/api/v1/webhooks/abacate-pay?webhookSecret=SEU_SECRET`. O valor cobrado vem do produto cadastrado no dashboard; o adapter recusa se `amount` divergir do pedido.

O retorno do navegador não confirma pagamento. O webhook valida o secret da query, consulta o billing na API e confere referência, moeda e valor. Checkout e confirmação são serializados no PostgreSQL; reenvios concluídos não repetem crédito/produção e falhas permitem nova tentativa.

Para outro gateway, implemente o contrato em `apps/api/src/payment.ts`, normalize checkout/consulta e adicione sua rota de webhook com autenticação e testes de valor, moeda, duplicação e retry. Só então habilite o valor correspondente em configuração. Não há suporte implícito a Mercado Pago, Stripe, Asaas ou outro fornecedor ainda não implementado.

## E-mail

`EMAIL_PROVIDER=local-log` grava mensagens em `LOCAL_EMAIL_PATH` (default `./var/emails`), mesmo se uma chave Resend estiver presente. Use caminho absoluto se quiser definir onde o worker grava. Arquivos têm permissões restritas e contêm links privados; não os versione.

Para Resend, selecione `EMAIL_PROVIDER=resend`, preencha `RESEND_API_KEY` e `EMAIL_FROM` com remetente de domínio verificado. Fora de produção, ausência de chave usa registro local. Em produção, ausência de chave/remetente válido ou seleção local-log impede a inicialização. O adapter e a configuração ficam em `packages/providers/src/email.ts`.

O worker persiste a intenção antes do envio e reutiliza destinatário, remetente, conteúdo e link no retry. Não troca silenciosamente o token depois de um envio aceito. A deduplicação externa tem janela limitada; não há promessa de envio exatamente uma vez. Para outro serviço de e-mail, implemente o contrato `EmailProvider` e teste transporte, falha e retry antes de habilitá-lo.

## OpenRouter

Defina `OPENROUTER_API_KEY`, `OPENROUTER_TEXT_MODEL` e `OPENROUTER_MUSIC_MODEL`. Capa opcional usa `OPENROUTER_COVER_TEXT_MODEL` e `OPENROUTER_COVER_REFERENCE_MODEL`. Os nomes em `.env.example` são a configuração histórica do projeto, não uma nova homologação de disponibilidade/modelo nesta entrega.

Sem chave, a interface continua navegável e os erros de geração são explícitos. O worker local inicia sem credencial, mas falha antes de fazer rede quando uma tarefa exigir o provider. Produção mantém configuração obrigatória. Não há áudio ou letra sintéticos apresentados como geração real.

`OPENROUTER_TEXT_MAX_TOKENS` limita a resposta da letra (default 8192, inteiro de 1 a 65536). O limite deve respeitar o modelo escolhido e não representa um teto monetário da conta. Tentativas de validação e de áudio também podem consumir créditos.

O preview isolado permite opt-in `PREVIEW_AI=lyrics`, `PREVIEW_AI=lyrics-audio` ou `PREVIEW_AI=all`; veja o README. Ele carrega seletivamente as credenciais existentes; capas só entram em `all`, pagamento e email real ficam desligados. Antes de ativar um worker com IA, confira os jobs elegíveis no banco para não executar pedidos antigos inadvertidamente. Autorize uma rodada limitada, acompanhe `ai_usage` e confira custos desconhecidos no provider; não trate `cost_usd=null` como zero.

Erros HTTP permanentes de áudio, incluindo 402 por saldo/limite da chave, encerram o job e deixam o pedido visível para intervenção. HTTP 408, 429 e 5xx preservam retry; o filtro de conteúdo mantém sua política limitada. Não aumente o limite financeiro da chave automaticamente: confira a reserva exigida pelo provider e retome administrativamente depois de corrigir a causa.

## Google Lyria 3.5

Para selecionar o áudio direto do Google, defina `MUSIC_PROVIDER=google`, `GOOGLE_API_KEY` e, opcionalmente, `GOOGLE_MUSIC_MODEL=lyria-3.5`. A chave é lida somente pela API/worker; nunca a exponha no frontend, em payload de job, em logs ou no repositório. O adapter usa a Interactions API, registra o modelo selecionado e não faz retry interno.

O preço documentado do Lyria 3.5 é US$0,08 por música completa e não há free tier. Antes de uma chamada real, confira o orçamento compartilhado e faça primeiro o `--dry-run` do comparador. O ensaio desta feature limita-se a quatro chamadas (duas letras fictícias por dois modelos), com teto nominal de US$0,32, sem retry. Resultado técnico não substitui a escuta humana nem homologação de provider.

O OpenRouter continua sendo a configuração histórica (`MUSIC_PROVIDER=openrouter`, `OPENROUTER_MUSIC_MODEL=google/lyria-3-pro-preview`). Jobs antigos sem seleção explícita permanecem compatíveis com OpenRouter; jobs novos carregam somente provider/model não secretos. Erros de conteúdo, autenticação, saldo e ausência de áudio devem continuar visíveis para recuperação administrativa, sem apresentar um áudio sintético como geração real.

## Storage e testes externos

Use `STORAGE_PROVIDER=local` e `LOCAL_STORAGE_PATH` absoluto compartilhado em desenvolvimento. Produção exige S3 privado. Preencha bucket, região, endpoint e credenciais de `STORAGE_S3_*`; API e worker usam o mesmo storage. Downloads continuam mediados pela API.

Execute o [runbook externo](external-activation-runbook.md) com autorização e orçamento antes do lançamento. Testes locais usam PostgreSQL real, transportes controlados e dados sintéticos; não provam pagamento, e-mail, geração ou S3 reais. O [checklist de produção](production-checklist.md) inclui publicação dos textos, CI, infraestrutura e backup.
