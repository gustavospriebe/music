# Providers e variáveis

| Provider  | Implementação                       | Produção                  | Status                                                  |
| --------- | ----------------------------------- | ------------------------- | ------------------------------------------------------- |
| Lyrics    | OpenRouter chat completions (JSON)  | `openrouter`              | validado com chamada real (gemini-3-flash-preview)      |
| Música    | OpenRouter SSE áudio (2 versões)    | OpenRouter Lyria          | validado com chamada real (lyria-3-pro, US$ 0,08/faixa) |
| Pagamento | Mercado Pago Checkout Pro + webhook | Mercado Pago Checkout Pro | implementado, sem credenciais (dev usa fallback local)  |
| E-mail    | Resend com link privado de entrega  | Resend                    | implementado, sem credenciais (dev usa fallback local)  |
| Arquivos  | disco local (`LOCAL_STORAGE_PATH`)  | volume/bucket privado     | funcionando                                             |

## OpenRouter

Chat Completions: `POST https://openrouter.ai/api/v1/chat/completions`, Bearer `OPENROUTER_API_KEY`. Texto usa `OPENROUTER_TEXT_MODEL` e `response_format: {type:json_object}`; a letra deve preencher `generatedLyricsSchema` e incluir `subjectName` e todos os `facts`. Áudio (validado com `google/lyria-3-pro-preview`, US$ 0,08/faixa): requisição com `modalities:["text","audio"]`, `audio:{format:"wav"}` e `stream:true`; os bytes chegam em `choices[0].delta.audio.data` (base64, concatenar chunks). O Lyria devolve na prática MP3 com carimbo C2PA — o worker detecta o contêiner real pelos bytes, não confia no `format` pedido. Referências: [quickstart](https://openrouter.ai/docs/quickstart), [áudio](https://openrouter.ai/docs/guides/overview/multimodal/audio.md), [Lyria pro](https://openrouter.ai/google/lyria-3-pro-preview).

Filtro de conteúdo de áudio é probabilístico: a mesma letra pode retornar `PROHIBITED_CONTENT`. Manter a instrução de variante ANTES da letra reduz falsos positivos; o worker ainda tenta várias vezes e marca o job como `failed` se persistir. `GEMINI_API_KEY` não substitui `OPENROUTER_API_KEY`. Qualquer chave compartilhada em conversa deve ser tratada como exposta e rotacionada.

## Mercado Pago

Checkout Pro cria preferência em `POST /checkout/preferences` com `external_reference`, item BRL, `back_urls` e `notification_url`. Webhook apenas notifica: validar assinatura `x-signature`/`x-request-id`, buscar o pagamento na API e conferir valor, moeda, pedido e status antes de marcar pago. A deduplicação é obrigatória. [Preferências](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro/preferences/create-preference/post), [webhooks](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks).

## Resend e S3

Resend envia `POST https://api.resend.com/emails` com `RESEND_API_KEY`, `EMAIL_FROM` e `Idempotency-Key`. S3 requer endpoint, região, bucket e credenciais, com bucket privado e URLs assinadas curtas. [Resend](https://resend.com/docs/api-reference/emails/send-email).

As variáveis completas estão em `.env.example`; em produção, a validação deve falhar rapidamente para segredo ausente.
