> HISTÓRICO — leitura anterior à remediação de 12/09/2026. Alegações de schema, providers, status e prontidão abaixo podem estar superadas. Este documento não autoriza implementação, gastos ou publicação. Use o [modelo vigente](../../docs/project-context.md) e sua validação.

# Tech Stack

**Analyzed:** 2026-09-11

## Core

- Language: TypeScript 5.9, ESM, strict
- Runtime: Node 22
- Package manager: pnpm 12.3.4 via Corepack
- Monorepo: Turborepo 2.5

## Frontend

- UI: React 19 + Vite 7
- Styling: Tailwind 4
- Data: TanStack Query 5
- Routing: React Router 7
- Forms: React Hook Form + Zod (`@resenha/contracts` para status/produto/voz/letra gerada; copy de UI em `types.ts`)

## Backend

- API: Fastify 5, REST `/api/v1`
- Worker: processo contínuo (`tsx`), polling PostgreSQL
- Database: PostgreSQL 18 no compose (`postgres:18-alpine`) e no Railway; volume local ainda pode ser 16. Drizzle ORM
- Auth: cookies HttpOnly de capability (cliente) e sessão admin de ambiente
- Queue: `generation_jobs` + `FOR UPDATE SKIP LOCKED` em `packages/database/src/jobs.ts`

## Testing

- Unit/integration: Vitest, `fastify.inject`
- E2E: Playwright em `apps/web`
- Gate: `pnpm check` (format, lint, typecheck, test, build)

## External Services

- IA: OpenRouter (letra, áudio, capa); Google Lyria 3.5 opcional no worker
- Pagamento: AbacatePay PIX
- E-mail: Resend (dev: `var/emails`)
- Storage: local ou S3 compatível (Bucket Railway)
- Hosting: Railway projeto `musica`

## Development Tools

- Docker Compose para Postgres local
- Drizzle Kit (`pnpm db:generate|migrate|seed|studio`)
- Preview isolado: `scripts/local-preview.sh`
