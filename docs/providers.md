# Providers e contratos externos

Implementação vigente em `packages/providers/src/`. Nenhuma chamada externa foi executada para validar a remediação da auditoria. Ensaios anteriores não comprovam esta revisão, seu deploy nem aceitação comercial/artística.

| Função   | Adapter existente                          | Evidência necessária fora do gate local                              |
| -------- | ------------------------------------------ | -------------------------------------------------------------------- |
| Letra    | OpenRouter, JSON validado por Zod          | Resposta autorizada, conteúdo e custo efetivos                       |
| Áudio    | OpenRouter ou Google Lyria                 | Arquivo decodificável, qualidade ouvida, fidelidade da letra e custo |
| Capa     | OpenRouter Images                          | Imagem privada, qualidade e consentimento de referência              |
| PIX      | AbacatePay v2                              | PIX real, webhook autenticado, consulta e refund/reconciliação       |
| E-mail   | Resend; arquivo local em desenvolvimento   | Remetente autenticado e mensagem recebida                            |
| Arquivos | S3 privado; disco local em desenvolvimento | Acesso direto negado e backup/restore de objetos                     |

## Pagamento genérico

`PaymentProvider` oferece `name`, `createCheckout`, `getPayment(id)` e `findPayment(externalReference)`. `PaymentDetails` deve conter provider, ambiente financeiro (`live`, `sandbox` ou fallback `local`), ID, referência, estado financeiro, centavos inteiros e BRL. Criação e consulta precisam identificar a mesma cobrança e ambiente. Webhook apenas notifica; a liquidação consulta o provider com credencial e aplica as invariantes no banco. Tentativa histórica sem ambiente comprovado permanece `NULL` e exige conferência; nenhuma promoção de configuração transforma teste em receita.

O AbacatePay recebe o produto do dashboard em `POST /v2/checkouts/create` e uma referência por tentativa. O preço retornado deve coincidir com o snapshot do pedido, inclusive `paidAmount` quando pago. Não há garantia de idempotência externa assumida: `externalId` é uma referência. O sistema faz um único POST por tentativa persistida; timeout/resultado desconhecido só permite consultar por ID/referência, sem criar outra cobrança automaticamente.

A consulta `/v2/checkouts/list` exige correspondência exata, nunca o primeiro item da lista. Paginação/ambiguidade não pode virar confirmação. O caminho interno é `/api/v1/webhooks/abacatepay`. O envelope v2 identifica evento por `id`, cobrança por `data.checkout.id` e ambiente por `devMode`. Secret é obrigatório; produção exige HMAC dos bytes brutos por padrão (`ABACATEPAY_REQUIRE_WEBHOOK_SIGNATURE`). A chave pública de HMAC, isoladamente, não autentica o remetente. Eventos duplicados e atrasados não regridem pagamentos, e refund revoga entrega e interrompe trabalhos.

`PAYMENT_ENVIRONMENT=sandbox|live` é independente de `NODE_ENV`: a configuração ausente assume `live` no runtime de produção e `sandbox` fora dele. API e worker exigem `devMode=true` no sandbox e `false` no live, inclusive nas consultas e webhooks. A chave V2 criada em Devmode define o sandbox no próprio fornecedor; não há campo `devMode` para forçar uma chave live a operar em teste. URL base é a mesma. Confira a [autenticação oficial](https://docs.abacatepay.com/pages/authentication).

No sandbox real, o comércio público fica fechado mesmo com `COMMERCIAL_READY=true`. A rota de checkout existente exige a capability do pedido e uma sessão administrativa válida; apenas essa combinação dispensa a publicação das condições comerciais para uma homologação sem cobrança. Preço positivo e letra aprovada continuam obrigatórios. A reserva registra `sandbox_checkout_requested` e uma nota administrativa. Não existe flag HTTP de bypass nem confirmação fictícia AbacatePay.

O endpoint oficial `POST /v2/transparents/simulate-payment?id=...` simula **checkout transparente PIX**. O adapter deste produto usa **checkout hospedado** (`/v2/checkouts/create`): a documentação consultada não comprova que o ID hospedado possa ser usado nesse simulador. Confirmar a opção oficial de simulação no checkout Devmode ou com o fornecedor antes de declarar PIX hospedado homologado. Veja [simulação PIX](https://docs.abacatepay.com/pages/transparents/simulate-payment) e [Devmode](https://docs.abacatepay.com/pages/devmode).

Referências oficiais consultadas: [criação](https://docs.abacatepay.com/pages/payment/create), [consulta](https://docs.abacatepay.com/pages/payment/list), [refund](https://docs.abacatepay.com/pages/payment/refund), [segurança do webhook](https://docs.abacatepay.com/pages/webhooks/security), [evento de checkout](https://docs.abacatepay.com/pages/webhooks/events/checkout). Reconfira esses contratos antes de homologar: o fornecedor pode mudá-los.

Um segundo gateway precisa cumprir toda a porta e seus testes: PIX BR, valor/referência exatos, webhook autenticado, idempotência documentada ou tratamento seguro de resultado desconhecido, consulta/reconciliação e refund. Preserve o provider das tentativas históricas. Não adicione outro adapter parcialmente funcional nem um alias Mercado Pago para contornar isso.

## IA, e-mail e arquivos

IA usa `fetch` pontual, Zod e fila. Não requer framework de agentes. `ai_calls` existe antes da rede; `ai_usage` conserva custo e falhas de validação. Um custo Google estimado não é promovido a custo informado pelo provider. Timeout ou resposta indeterminada pode ter custo e exige conferência. Recusa definitiva e limite de taxa são diferentes de resultado desconhecido.

O texto canônico é `fullLyrics`. Se uma edição divergir das seções retornadas pela IA, essas seções deixam de ser apresentadas como estrutura válida. Contato/consentimento não entram nos prompts; nomes, histórias, fatos e imagem consentida ainda são dados pessoais compartilhados conforme finalidade.

Resend mantém a intenção antes do envio e usa chave estável por mensagem. Retomada após a janela de idempotência exige conferência operacional; não há garantia fictícia de exactly-once por tempo ilimitado. Cada produção tem seu aviso; o link privado do pedido aponta para a produção vigente.

S3 não recebe ACL pública. A API autoriza antes de abrir o objeto, transmite em streaming e suporta um intervalo de bytes. Backup de banco não contém os arquivos do bucket. Consulte [backup/restore](backup-and-restore.md).
