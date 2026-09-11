# Configuração de providers

Os adapters são reais e selecionados por variáveis (`.env.example` lista tudo). OpenRouter de letra e música foi validado anteriormente; capa, AbacatePay e Resend continuam **EXTERNAL BLOCKED** até execução autorizada do [runbook de ativação](external-activation-runbook.md). Fora de produção valem os fallbacks locais abaixo; produção falha rápido sem toda a configuração obrigatória.

## Fallbacks de desenvolvimento (sem chave)

- Pagamento: `ABACATEPAY_API_KEY` ausente => checkout cria pagamento local e o próprio front confirma via endpoint dev (removido em produção); o fluxo segue até a entrega da música.
- E-mail: `RESEND_API_KEY` ausente => e-mail de entrega é gravado em `var/emails` com o link privado real e registrado em `email_deliveries` como `local-log`.

## OpenRouter (letra, música e capa)

Defina `OPENROUTER_API_KEY`, `OPENROUTER_TEXT_MODEL` (gera a letra, saída JSON) e `OPENROUTER_MUSIC_MODEL` (gera as duas versões de áudio; modelos publicados incluem `google/lyria-3-clip-preview` e `google/lyria-3-pro-preview`). O áudio chega por streaming SSE em `choices[0].delta.audio.data` (base64), conforme o contrato oficial.

Para capa, defina `OPENROUTER_COVER_TEXT_MODEL=google/gemini-3.1-flash-lite-image` e `OPENROUTER_COVER_REFERENCE_MODEL=google/gemini-3.1-flash-image`. A referência opcional é normalizada, enviada como `input_references` e apagada após sucesso/falha terminal ou em até sete dias. Testes usam fetch controlado; nunca rode o teste local com provider pago.

Não use uma chave Gemini como chave OpenRouter. Qualquer chave compartilhada em conversa deve ser tratada como exposta e rotacionada; nunca a registre em logs ou repositório.

## AbacatePay

Defina `PAYMENT_PROVIDER=abacatepay`, `ABACATEPAY_API_KEY`, `ABACATEPAY_PRODUCT_ID`, `ABACATEPAY_WEBHOOK_SECRET` e `ABACATEPAY_WEBHOOK_URL` (URL pública que aponta para `POST /api/v1/webhooks/abacate-pay?webhookSecret=<secret>`; em desenvolvimento use um túnel). Passos no dashboard ([docs](https://docs.abacatepay.com)): criar o produto com preço fixo em centavos (R$ 49,90 → `price: 4990`, moeda BRL sempre), anotar o `prod_*`; gerar a API key (Bearer); criar o webhook com endpoint HTTPS, secret próprio e eventos `checkout.completed` + `checkout.refunded`.

O checkout cria cobrança em `POST /v2/checkouts/create` com `items: [{id: produto, quantity: 1}]`, `externalId` igual ao `publicId` do pedido e `returnUrl`/`completionUrl` de volta ao pedido; o cliente paga na `url` retornada. O valor da cobrança vem do produto do dashboard: o adapter recusa qualquer `amount` divergente do total do pedido. O webhook autentica pelo `?webhookSecret=` (tempo constante), busca o billing em `GET /v2/checkouts/one?id=`, confere `externalId`, valor e status `PAID` antes de marcar pago. Eventos são deduplicados em `payment_webhook_events` (`abacate-pay:<billing>:<evento>`). Cobranças criadas em devMode servem de sandbox; o retorno do navegador nunca confirma pagamento. Referências: [criar checkout](https://docs.abacatepay.com/pages/payment/create), [webhooks](https://docs.abacatepay.com/pages/webhooks), [referência de webhooks](https://docs.abacatepay.com/pages/webhooks/reference).

## Resend

Defina `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` e `EMAIL_FROM` usando domínio verificado. O e-mail de entrega carrega o link privado (`/entrega/:token`) e usa `Idempotency-Key` por pedido; envios ficam registrados em `email_deliveries`.

## Armazenamento

Disco local em todos os ambientes (`STORAGE_PROVIDER=local`): API e worker precisam do mesmo `LOCAL_STORAGE_PATH` absoluto. No Railway, monte o mesmo volume nos dois serviços (ex.: `/data/resenha-storage`). Downloads passam pela API, nunca por URL pública; o diretório nunca é listado.

Nenhuma integração real acima é declarada validada sem chamada autorizada e bem-sucedida. As referências oficiais e variáveis também estão em [providers.md](providers.md).
