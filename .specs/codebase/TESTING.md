> HISTÓRICO — leitura anterior à remediação de 12/09/2026. Alegações de schema, providers, status e prontidão abaixo podem estar superadas. Este documento não autoriza implementação, gastos ou publicação. Use o [modelo vigente](../../docs/project-context.md) e sua validação.

# Testing

**Analyzed:** 2026-09-11

## Commands

- `pnpm check` — format, lint, typecheck, testes, build
- `pnpm test` — Vitest serializado (`--concurrency=1`)
- `pnpm test:e2e` — Playwright; precisa de app/banco
- Testes de API: `fastify.inject` com env sintético e providers injetados

## Patterns

- Providers reais não são chamados nos testes locais. Transporte é mock/controlado.
- Banco de teste: `resenha_test` em `localhost:5433`. Suítes que truncam o mesmo banco rodam em série.
- Preview isolado (`music_launch_preview`) não é a suíte; é sandbox de UI.
- Integração paga só vale após chamada autorizada e bem-sucedida (não derive de `pnpm check`).

## Gaps

- Playwright não cobre PIX real, OpenRouter, Resend ou S3.
- `apps/api/src/routes/` é o maior alvo de regressão HTTP; novos fluxos devem ter `inject` no caminho de status. Worker de letra: `processLyricsJob` com provider injetado.
- Status/produto/voz/letra gerada na web vêm de `@resenha/contracts`; DTOs de UI continuam locais.
