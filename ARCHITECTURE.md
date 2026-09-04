# Arquitetura — Música da Resenha

O produto é um monólito modular TypeScript: web, API e worker compartilham PostgreSQL, contratos e domínio. A web só apresenta fluxo e chama a API; regras, preços e transições ficam fora do navegador.

```mermaid
flowchart LR
  Browser[React/Vite] -->|/api/v1| API[Fastify API]
  API --> DB[(PostgreSQL)]
  API --> Checkout[Payment provider]
  Worker[Worker] -->|claim: FOR UPDATE SKIP LOCKED| DB
  Worker --> Text[Text provider]
  Worker --> Music[Music provider]
  Worker --> Storage[Private storage]
  Worker --> Mail[Email provider]
```

## Fluxo

Uma `story_session` salva respostas progressivamente. A criação usa uma chave UUID por tentativa e persiste só o hash; retries retornam o mesmo pedido. A geração de letra faz claim atômico e só recupera uma tentativa sem atualização após cinco minutos. Letras são versionadas e aprovação sempre anexa a cópia exata do texto visível. O servidor calcula preços em centavos, cria checkout e só inicia `generation_jobs` após pagamento confirmado. O worker reivindica jobs com `FOR UPDATE SKIP LOCKED`, aplica tentativas/backoff e gera duas versões. Por padrão, a revisão humana aprova o áudio antes de criar uma entrega com token revogável.

## Limites e decisões

- PostgreSQL é fonte de verdade e fila durável; não há Redis, microserviços ou Kubernetes.
- Providers são adapters reais selecionados por variáveis de ambiente (OpenRouter, Mercado Pago, Resend); fora de produção, a ausência de credencial de pagamento/e-mail cai em fallback local (pagamento dev, e-mail em `var/emails`) — em produção as chaves são obrigatórias.
- O storage é privado: a API valida token antes de disponibilizar download local ou URL assinada.
- Acesso de pedido e visualização usa cookies de capability assinados e `HttpOnly`; um link de entrega concede apenas visualização.
- Respostas públicas carregam só referências públicas (`publicId`, número da versão de letra, variante do áudio); UUIDs internos ficam no admin autenticado. Logs HTTP usam template de rota e logs do worker omitem IDs internos. Mutações de cliente exigem o cookie assinado do pedido.
- Admin é único via `ADMIN_EMAIL`/`ADMIN_PASSWORD` de ambiente (decisão do dono; sem hash), cookie HttpOnly e sessão de 8h. Transições de status passam por `assertTransition`.

Veja também [docs/architecture.md](docs/architecture.md), que mantém o diagrama resumido original.
