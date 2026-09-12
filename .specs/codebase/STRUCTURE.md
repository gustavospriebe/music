> HISTÓRICO — leitura anterior à remediação de 12/09/2026. Alegações de schema, providers, status e prontidão abaixo podem estar superadas. Este documento não autoriza implementação, gastos ou publicação. Use o [modelo vigente](../../docs/project-context.md) e sua validação.

# Structure

**Analyzed:** 2026-09-11

```
apps/web          React/Vite — jornada pública, admin, E2E
apps/api          Fastify — HTTP, enqueue de letra, checkout, recovery
apps/worker       Polling — letra, áudio, capa, e-mail
packages/contracts  Zod compartilhado (API/worker/web)
packages/domain    Transições, validação, tokens, prompt de áudio
packages/database  Schema Drizzle, migrations, claim de job
packages/providers Storage, e-mail e letra OpenRouter
packages/eslint-config, typescript-config
docker/           Dockerfiles de web/api/worker
docs/             Arquitetura, providers, Railway, produto
.specs/           STATE, features, lessons, codebase
```

Tabelas: `story_sessions`, `lyric_versions`, `stored_files`, `order_contacts`. Sem aliases Drizzle. Contato não fica no JSONB.

Arquivos grandes e frágeis: `apps/api/src/routes/admin.ts`, `apps/api/src/routes/context.ts`.
