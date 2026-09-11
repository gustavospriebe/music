# Railway Bootstrap Context

**Gathered:** 2026-09-06
**Spec:** `.specs/features/railway-bootstrap/spec.md`
**Status:** Ready for design

## Feature Boundary

Corrigir o CI, consolidar o contexto e criar a estrutura Railway segura. Não publicar apps, não alterar WIP, não chamar providers.

## Implementation Decisions

### Topologia

- Um projeto `musica-da-resenha` com `web`, `api`, `worker`, `Postgres` e `Bucket`.
- API e worker compartilham banco e bucket; somente web/API terão domínio no deploy futuro.
- Shared monorepo: contexto/root na raiz e Dockerfiles por serviço.

### Promoção

- Estrutura vazia primeiro; fonte, secrets, migration, seed, domínios e deploy depois.
- Migration pertence ao pre-deploy da API; seed de produtos roda uma vez na ativação.
- `AUDIO_REVIEW_MODE=manual` até decisão comercial.

### Agent's Discretion

- Organização dos docs e watch paths futuros, desde que o mapa canônico permaneça curto.

### Declined / Undiscussed Gray Areas → Assumptions

- Bucket `iad` é recomendado pela proximidade relativa com o Brasil, mas permanece não criado até confirmação porque a região é imutável.

## Deferred Ideas

- Extrair providers atualmente embutidos na API/worker.
- Streaming de objetos para reduzir memória da API.
- Job de reconciliação de objetos órfãos e backup automatizado do Bucket.
- `PAYMENT_MODE` explícito para separar local, sandbox e live.
