# Providers e variáveis

| Provider  | Implementação                           | Produção                   | Status                                                  |
| --------- | --------------------------------------- | -------------------------- | ------------------------------------------------------- |
| Lyrics    | OpenRouter chat completions (JSON)      | `openrouter`               | validado com chamada real (gemini-3-flash-preview)      |
| Música    | OpenRouter SSE áudio (2 versões)        | OpenRouter Lyria           | validado com chamada real (lyria-3-pro, US$ 0,08/faixa) |
| Pagamento | AbacatePay Checkout hospedado + webhook | AbacatePay                 | implementado, sem homologação real ainda                |
| E-mail    | Resend com link privado de entrega      | Resend                     | implementado, sem credenciais (dev usa fallback local)  |
| Capa      | OpenRouter Images API                   | Gemini Flash Image         | implementado; sem chamada paga de validação             |
| Arquivos  | local dev / adapter S3 compatível       | bucket privado obrigatório | testado localmente; infraestrutura externa bloqueada    |

## OpenRouter

Chat Completions: `POST https://openrouter.ai/api/v1/chat/completions`, Bearer `OPENROUTER_API_KEY`. Texto usa `OPENROUTER_TEXT_MODEL` e `response_format: {type:json_object}`; a letra deve preencher `generatedLyricsSchema` e incluir `subjectName` e todos os `facts`. Áudio (validado com `google/lyria-3-pro-preview`, US$ 0,08/faixa): requisição com `modalities:["text","audio"]`, `audio:{format:"wav"}` e `stream:true`; os bytes chegam em `choices[0].delta.audio.data` (base64, concatenar chunks). O Lyria devolve na prática MP3 com carimbo C2PA — o worker detecta o contêiner real pelos bytes, não confia no `format` pedido. Referências: [quickstart](https://openrouter.ai/docs/quickstart), [áudio](https://openrouter.ai/docs/guides/overview/multimodal/audio.md), [Lyria pro](https://openrouter.ai/google/lyria-3-pro-preview).

Filtro de conteúdo de áudio é probabilístico: a mesma letra pode retornar `PROHIBITED_CONTENT`. Manter a instrução de variante ANTES da letra reduz falsos positivos; o worker ainda tenta várias vezes e marca o job como `failed` se persistir. `GEMINI_API_KEY` não substitui `OPENROUTER_API_KEY`. Qualquer chave compartilhada em conversa deve ser tratada como exposta e rotacionada.

Capas usam `POST https://openrouter.ai/api/v1/images`, 1K e proporção 1:1. Sem foto, `OPENROUTER_COVER_TEXT_MODEL` recomenda `google/gemini-3.1-flash-lite-image` (~US$ 0,0336 por saída 1K); com foto, `OPENROUTER_COVER_REFERENCE_MODEL` recomenda `google/gemini-3.1-flash-image` (~US$ 0,067). O pior caso incluído (duas capas com referência) é ~US$ 0,134 de saída, antes de entrada, impostos, câmbio e storage. Estes preços são públicos, consultados em 04/09/2026; nenhuma chamada paga de capa foi feita. Referências: [OpenRouter Images API](https://openrouter.ai/docs/api-reference/images/generate-images), [modelos de imagem](https://openrouter.ai/api/v1/images/models) e [preços Gemini](https://ai.google.dev/gemini-api/docs/pricing).

## AbacatePay

Checkout hospedado cria cobrança em `POST /v2/checkouts/create` com o `id` do produto do dashboard, `externalId` do pedido e URLs de retorno. O adapter confere `amount` em centavos contra o total do pedido. Webhook em `POST /api/v1/webhooks/abacate-pay?webhookSecret=...`: validar o secret, buscar o billing em `GET /v2/checkouts/one` e conferir valor, moeda, pedido e status `PAID` antes de marcar pago. A deduplicação é obrigatória. [Checkout](https://docs.abacatepay.com/pages/payment/create), [webhooks](https://docs.abacatepay.com/pages/webhooks).

## Resend e S3

Resend envia `POST https://api.resend.com/emails` com `RESEND_API_KEY`, `EMAIL_FROM` e `Idempotency-Key`. O adapter S3 usa `PutObject`, `GetObject` e `DeleteObject`, sem ACL pública; downloads continuam mediados pelas capabilities da API. Endpoint e credenciais são opcionais quando a infraestrutura fornece IAM. [Resend](https://resend.com/docs/api-reference/emails/send-email), [AWS S3 SDK](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/).

As variáveis completas estão em `.env.example`; produção falha ao iniciar sem modelos de capa, AbacatePay/Resend e storage S3 explícito. Estado externo atual: **EXTERNAL BLOCKED** até homologação com credenciais e infraestrutura autorizadas.
