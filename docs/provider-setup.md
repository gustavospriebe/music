# Configuração de providers

Os adapters são reais e selecionados por variáveis (`.env.example` lista tudo). OpenRouter (letra e música) está validado com chamadas reais. Enquanto Mercado Pago e Resend não tiverem credenciais, fora de produção valem os fallbacks locais abaixo — em produção a API exige as chaves e o worker exige a da Resend.

## Fallbacks de desenvolvimento (sem chave)

- Pagamento: `MERCADO_PAGO_ACCESS_TOKEN` ausente => checkout cria pagamento local e o próprio front confirma via endpoint dev (removido em produção); o fluxo segue até a entrega da música.
- E-mail: `RESEND_API_KEY` ausente => e-mail de entrega é gravado em `var/emails` com o link privado real e registrado em `email_deliveries` como `local-log`.

## OpenRouter (letra e música)

Defina `OPENROUTER_API_KEY`, `OPENROUTER_TEXT_MODEL` (gera a letra, saída JSON) e `OPENROUTER_MUSIC_MODEL` (gera as duas versões de áudio; modelos publicados incluem `google/lyria-3-clip-preview` e `google/lyria-3-pro-preview`). O áudio chega por streaming SSE em `choices[0].delta.audio.data` (base64), conforme o contrato oficial.

Não use uma chave Gemini como chave OpenRouter. Qualquer chave compartilhada em conversa deve ser tratada como exposta e rotacionada; nunca a registre em logs ou repositório.

## Mercado Pago

Defina `PAYMENT_PROVIDER=mercadopago`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` e `MERCADO_PAGO_WEBHOOK_URL` (URL pública que aponta para `POST /api/v1/webhooks/mercado-pago`; em desenvolvimento use um túnel). O checkout cria preferência no Checkout Pro com `external_reference` igual ao `publicId` do pedido. O retorno do navegador nunca confirma pagamento: o webhook valida assinatura `x-signature`/`x-request-id`, consulta o pagamento na API e confere moeda, total e referência antes de marcar pago. Eventos são armazenados sanitizados e deduplicados em `payment_webhook_events`. Use credenciais de teste/sandbox durante homologação.

## Resend

Defina `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` e `EMAIL_FROM` usando domínio verificado. O e-mail de entrega carrega o link privado (`/entrega/:token`) e usa `Idempotency-Key` por pedido; envios ficam registrados em `email_deliveries`.

## Armazenamento

Os arquivos ficam em `LOCAL_STORAGE_PATH` (padrão `./var/storage`); downloads usam rota autenticada por cookie ou token de entrega. Em produção, prefira volume persistente ou bucket privado.

Nenhuma integração real acima é declarada validada sem chamada autorizada e bem-sucedida. As referências oficiais e variáveis também estão em [providers.md](providers.md).
