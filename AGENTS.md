# Instruções para agentes

Comece por `docs/project-context.md` e reconcilie `.specs/STATE.md` com Git, CI e Railway ao vivo antes de agir.

## Arquitetura e convenções

- Monólito modular: web, API e worker compartilham PostgreSQL, domínio e contratos.
- TypeScript estrito, ESM, funções pequenas e dependências explícitas. Não introduza services/classes/DI sem necessidade concreta.
- Rotas validam HTTP; domínio guarda invariantes; repositórios persistem; providers encapsulam rede; worker é retomável.
- Não exponha IDs internos, tokens, payloads pessoais ou secrets. Use centavos inteiros e UTC.
- Estado do pedido muda por `assertTransition`; estado financeiro usa as transições do domínio de pagamento. Eventos e versões de letra são históricos. Produção fixa sua letra; nenhuma regeneração apaga artefatos anteriores.
- I/O cobrado exige tentativa durável antes da rede. Lease perdida impede efeitos de produção. Resultado desconhecido exige conferência, não retry automático.
- `ai_usage` não reprecifica custo conhecido; uma observação tardia pode completar custo antes desconhecido, com evento. Nunca rotule estimativa como custo informado.
- Migrações publicadas/aplicadas são imutáveis; use migração nova. Testes só em banco isolado explícito, com providers controlados.

## Comandos

Use Corepack: `corepack pnpm install`, `pnpm dev`, `pnpm check`, `pnpm db:migrate`, `pnpm db:seed`. PostgreSQL local sobe com `docker compose up -d`.

## Mudanças comuns

- Rota: schema Zod em `packages/contracts`, regra em domínio/use case, handler Fastify pequeno e teste `fastify.inject`.
- Schema: altere Drizzle, gere migration versionada, rode-a em PostgreSQL real, ajuste seed/índices e documentação.
- Provider: seleção por variável e adapter real documentado; não reintroduza modo fake. Fora de produção, providers sem credencial usam fallback local (pagamento dev, e-mail em `var/emails`); em produção as chaves são obrigatórias. Consulte documentação oficial; não invente endpoint, modelo ou webhook.

## Critérios de conclusão

Atualize README e docs quando o comportamento mudar. Rode format, lint, typecheck, testes e build pertinentes. Não declare provider real validado sem chamada autorizada e bem-sucedida. Não registre segredos nem faça deploy/publicação.
