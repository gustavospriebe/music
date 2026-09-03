# Instruções para agentes

## Arquitetura e convenções

- Monólito modular: web, API e worker compartilham PostgreSQL, domínio e contratos.
- TypeScript estrito, ESM, funções pequenas e dependências explícitas. Não introduza services/classes/DI sem necessidade concreta.
- Rotas validam HTTP; domínio guarda invariantes; repositórios persistem; providers encapsulam rede; worker é retomável.
- Não exponha IDs internos, tokens, payloads pessoais ou secrets. Use centavos inteiros e UTC.
- Status só muda por `assertTransition`; eventos e versões de letra são históricos, não mutáveis.

## Comandos

Use Corepack: `corepack pnpm install`, `pnpm dev`, `pnpm check`, `pnpm db:migrate`, `pnpm db:seed`. PostgreSQL local sobe com `docker compose up -d`.

## Mudanças comuns

- Rota: schema Zod em `packages/contracts`, regra em domínio/use case, handler Fastify pequeno e teste `fastify.inject`.
- Schema: altere Drizzle, gere migration versionada, rode-a em PostgreSQL real, ajuste seed/índices e documentação.
- Provider: seleção por variável e adapter real documentado; não reintroduza modo fake. Fora de produção, providers sem credencial usam fallback local (pagamento dev, e-mail em `var/emails`); em produção as chaves são obrigatórias. Consulte documentação oficial; não invente endpoint, modelo ou webhook.

## Critérios de conclusão

Atualize README e docs quando o comportamento mudar. Rode format, lint, typecheck, testes e build pertinentes. Não declare provider real validado sem chamada autorizada e bem-sucedida. Não registre segredos nem faça deploy/publicação.
