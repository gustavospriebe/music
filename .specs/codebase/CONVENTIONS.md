> HISTÓRICO — leitura anterior à remediação de 12/09/2026. Alegações de schema, providers, status e prontidão abaixo podem estar superadas. Este documento não autoriza implementação, gastos ou publicação. Use o [modelo vigente](../../docs/project-context.md) e sua validação.

# Conventions

**Analyzed:** 2026-09-11

Fonte: `AGENTS.md`, `docs/architecture.md`, código.

- TypeScript estrito, ESM, funções pequenas, dependências explícitas. Sem services/classes/DI sem necessidade concreta.
- Rotas validam HTTP (Zod); domínio guarda invariantes; repositórios persistem; providers encapsulam rede.
- Status só muda por `assertTransition`. Letras, eventos e versões são históricos.
- Centavos inteiros, UTC. Sem IDs internos, tokens ou PII em DTO público ou log.
- Providers selecionados por env. Sem modo fake. Fora de produção, pagamento/e-mail podem cair em fallback local; letra/áudio/capa exigem OpenRouter (ou Google para áudio).
- Não criar Redis/fila paralela. Não usar disco efêmero em produção (`STORAGE_PROVIDER=s3`).
- Corepack: `corepack pnpm install`, `pnpm check`, `pnpm db:migrate`, `pnpm db:seed`.
- Migration versionada no Drizzle; seed não é migration recorrente.
- A web importa status, produto, voz e letra gerada de `@resenha/contracts`; DTOs só-de-UI ficam em `apps/web/src/types.ts`.
