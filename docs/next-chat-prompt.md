# Handoff histórico — Música da Resenha (sessão de 04/09/2026)

> Este snapshot não representa o estado atual. Comece por [project-context.md](project-context.md) e `.specs/STATE.md`; confronte ambos com `git status`, `git log` e CI/Railway ao vivo.

> Substitui o handoff de 03/09/2026. Sessão atual: auditoria + segurança da borda + custo de IA + funil analytics, tudo verde.

## O que é o projeto

MVP brasileiro de músicas personalizadas: cliente conta a história, IA gera a letra, revisa/aprova, paga e recebe 2 versões de áudio em página privada. Monorepo Turborepo + pnpm, TS estrito ESM: `apps/web` (React 19/Vite `:5175`), `apps/api` (Fastify 5 `:3001`), `apps/worker` (fila PG `SKIP LOCKED`), `packages/{contracts,domain,database,providers,config}`. Docs vivas: `README.md`, `ARCHITECTURE.md`, `docs/evolucao-mvp.md` (decisões do dono, custo medido, planos — LER), `docs/providers.md`, `docs/provider-setup.md`, `docs/production-checklist.md`.

- **Git**: dono criou e comita (`gustavospriebe/music`); agente NÃO comita. Sugestão aberta: gitignorar `var/logs/*.log` (estão tracked).
- **Serviços dev**: Postgres `:5433`, API `:3001`, web `:5175`, worker tsx watch. `docker compose up -d`, `pnpm db:migrate` (+ `DATABASE_URL=..._test` para teste), `pnpm dev`, `pnpm check`, `pnpm test:e2e`.
- **Admin local**: `/admin/login` — credenciais no `.env` (plaintext por decisão explícita do dono, NÃO "consertar").
- **Banco**: UM servidor, DOIS databases — `resenha` (uso/prova) e `resenha_test` (suíte). Não resetar dados sem pedir (dono quer fluxos funcionando).

## Estado atual — tudo verde

`pnpm check` exit 0 · API 22 testes · worker 10 · e2e 5/5 · `GET /admin/analytics/funnel` e `POST /analytics/beacon` (200/400/**429** ao vivo).

## O que foi feito nesta sessão (não regredir)

1. **Segurança da borda pública**: DTOs só com `publicId`/número da versão/variante; letra por `:versionNumber` (404 real); download por `:variant` com gate `delivered`+`completed`; cookie exigido em todas as mutações; logs só com template de rota (`disableRequestLogging` + `onResponse`); `assertTransition` nos 3 caminhos que burlavam.
2. **Custo de IA** (`ai_usage`, migration 0002): 1 linha/chamada (modelo, tokens, `cost_usd` como o provider devolve, latência, `ok`/`blocked`/`error`/`rejected`, `requestId`). Somas em SQL, strings exatas até o painel. **Custo real medido** (pedido `X6NUN8uFT8YpsPRm`): letra $0,003414 + 2×$0,08 = **$0,163414/venda**. Key: `GET /key` documentado (uso/limite/restantes) no painel.
3. **Funil analytics** (migration 0003: `visitor_id` + índices): beacon público (whitelist 3 eventos, UUID, 60/min), 7 eventos server-side best-effort, `GET /admin/analytics/funnel` (visitantes, etapas, custo/venda) no dashboard.
4. **Rate limits religados**: `void app.register` perdia hooks `onRoute` — `buildApp` virou **async** (server + testes migrados). Valia para letra 5/h e login.
5. **Seam de contenção**: `processAudioJob(..., variants=[1,2])`; execução parcial nunca entrega (teste cobre). Correção excepcional registrada: um `UPDATE` direto de status na prova (caminho correto seria rebuild admin).

## Lições duras (não regredir)

- Filtro do Lyria é probabilístico; `makeMusicPrompt` mínimo; bloqueios gravam `blocked` (grátis). Pedidos antigos sem `ai_usage`/`analytics` (zeros esperados, sem backfill).
- `tsx watch` recarrega código, NÃO `.env`. Worker dev consome jobs pendentes sozinho (cuidado com provas).
- Edits com ranges errados quebram o arquivo: re-ler região antes de cada hunk; `pnpm check` sem pipe para exit real.

## Próximo (dono escolhe ordem)

**Minhas músicas** (localStorage `resenha:my-orders` + `/minhas-musicas`, sem cadastro) · **P1s de produto** (aprovar sem perder edição, botão approve `review_required`, preço do servidor, recovery) · **Admin indicadores** (filtros/busca, taxa entrega, bloqueios/semana). Depois: `PAYMENT_MODE=local|sandbox|live` (desenho pronto), credenciais MP/Resend, termos/privacidade.

## Como trabalhar

Gastar com juízo (teto interno removido; limite do provider monitorado no painel). Cada mudança: schema Zod + regra em domínio + handler fino + teste (`fastify.inject`, PG real). Sem deploy, sem segredos em logs/docs. Pedir antes de: reset de dados, commits, gasto grande novo.
