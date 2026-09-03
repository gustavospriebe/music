# Arquitetura

```mermaid
flowchart LR
  W[React/Vite] -->|/api/v1| A[Fastify API]
  A --> D[(PostgreSQL)]
  A --> P[Providers: fake ou reais]
  K[Worker] -->|claim SKIP LOCKED| D
  K --> M[Music provider]
  K --> S[Storage local/S3]
  K --> E[Email console/Resend]
  W -->|cookies de acesso| A
```

O PostgreSQL mantém pedidos, versões de letra, pagamentos, jobs, ativos e eventos. Depois de pagamento confirmado, API e job são criados na mesma transação e a chave de idempotência impede duplicação. O worker reivindica somente um job por vez com lock transacional e recupera jobs abandonados.

Decisões: sem Redis/BullMQ para reduzir serviços; cents/UUIDs; JSONB apenas para a resposta de formulário e estrutura de letra validadas por Zod; assets privados; token de cliente guardado somente como hash; providers fake como padrão local.
