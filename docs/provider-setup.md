# Configuração de providers

Os adapters são reais e selecionados por variáveis (`.env.example` lista tudo). OpenRouter de letra e música foi validado anteriormente; capa, Mercado Pago, Resend e S3 continuam **EXTERNAL BLOCKED** até execução autorizada do [runbook de ativação](external-activation-runbook.md). Fora de produção valem os fallbacks locais abaixo; produção falha rápido sem toda a configuração obrigatória.

## Fallbacks de desenvolvimento (sem chave)

- Pagamento: `MERCADO_PAGO_ACCESS_TOKEN` ausente => checkout cria pagamento local e o próprio front confirma via endpoint dev (removido em produção); o fluxo segue até a entrega da música.
- E-mail: `RESEND_API_KEY` ausente => e-mail de entrega é gravado em `var/emails` com o link privado real e registrado em `email_deliveries` como `local-log`.

## OpenRouter (letra, música e capa)

Defina `OPENROUTER_API_KEY`, `OPENROUTER_TEXT_MODEL` (gera a letra, saída JSON) e `OPENROUTER_MUSIC_MODEL` (gera as duas versões de áudio; modelos publicados incluem `google/lyria-3-clip-preview` e `google/lyria-3-pro-preview`). O áudio chega por streaming SSE em `choices[0].delta.audio.data` (base64), conforme o contrato oficial.

Para capa, defina `OPENROUTER_COVER_TEXT_MODEL=google/gemini-3.1-flash-lite-image` e `OPENROUTER_COVER_REFERENCE_MODEL=google/gemini-3.1-flash-image`. A referência opcional é normalizada, enviada como `input_references` e apagada após sucesso/falha terminal ou em até sete dias. Testes usam fetch controlado; nunca rode o teste local com provider pago.

Não use uma chave Gemini como chave OpenRouter. Qualquer chave compartilhada em conversa deve ser tratada como exposta e rotacionada; nunca a registre em logs ou repositório.

## Mercado Pago

Defina `PAYMENT_PROVIDER=mercadopago`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` e `MERCADO_PAGO_WEBHOOK_URL` (URL pública que aponta para `POST /api/v1/webhooks/mercado-pago`; em desenvolvimento use um túnel). O checkout cria preferência no Checkout Pro com `external_reference` igual ao `publicId` do pedido. O retorno do navegador nunca confirma pagamento: o webhook valida assinatura `x-signature`/`x-request-id`, consulta o pagamento na API e confere moeda, total e referência antes de marcar pago. Eventos são armazenados sanitizados e deduplicados em `payment_webhook_events`. Use credenciais de teste/sandbox durante homologação.

## Resend

Defina `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` e `EMAIL_FROM` usando domínio verificado. O e-mail de entrega carrega o link privado (`/entrega/:token`) e usa `Idempotency-Key` por pedido; envios ficam registrados em `email_deliveries`.

## Armazenamento

Fora de produção use `STORAGE_PROVIDER=local` e `LOCAL_STORAGE_PATH` compartilhado. Em produção é obrigatório `STORAGE_PROVIDER=s3`, `STORAGE_S3_BUCKET` e `STORAGE_S3_REGION`; `STORAGE_S3_ENDPOINT`, force-path-style e credenciais explícitas existem para provedores compatíveis. Prefira identidade IAM do runtime. O bucket deve bloquear acesso público e ter versionamento/backup; downloads passam pela API, nunca por URL pública.

Nenhuma integração real acima é declarada validada sem chamada autorizada e bem-sucedida. As referências oficiais e variáveis também estão em [providers.md](providers.md).
