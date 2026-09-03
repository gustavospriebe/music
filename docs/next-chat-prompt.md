# Handoff — Música da Resenha (sessão de 03/09/2026)

> Este documento substitui o handoff antigo (descrevia estado pré-MVP com providers fake, que **não existe mais**).

## O que é o projeto

MVP brasileiro de músicas personalizadas: o cliente conta uma história (resenha), a IA gera a letra, ele revisa/aprova, paga e recebe 2 versões de áudio em página privada com link de entrega.

- Monorepo Turborepo + pnpm, TypeScript estrito ESM: `apps/web` (React 19/Vite), `apps/api` (Fastify 5), `apps/worker` (fila em PostgreSQL via `SELECT … FOR UPDATE SKIP LOCKED`), `packages/{contracts,domain,database,providers,config}`.
- Convenções e regras de trabalho: **`AGENTS.md` na raiz (ler primeiro)**. Docs: `README.md`, `ARCHITECTURE.md`, `docs/providers.md`, `docs/provider-setup.md`, `docs/production-checklist.md`.
- **Não é repositório git** (decidir se versiona antes de acumular mais histórico).

## Estado atual — funcionando e VALIDADO com chamadas reais

Fluxo completo provado ponta a ponta várias vezes (pedidos reais no banco): história → letra (OpenRouter, JSON estruturado) → aprovação → pagamento dev → worker gera 2 MP3 reais → `delivered` → link `/entrega/:token` tocando/baixando → painel admin com player, editor de letra aprovada e "reproduzir versões".

- **Serviços dev**: Postgres container `music-postgres-1` (`:5433`), API `:3001`, web `:5175` (vite), worker tsx watch. Logs em `var/logs/*.log`. CI (GitHub Actions) com `resenha_test` migrou e verde.
- **Admin local**: `http://localhost:5175/admin/login` — `admin@resenha.local` / `resenha123` (plaintext no `.env` por decisão explícita do dono; NÃO "consertar" de volta para hash sem pedir).
- **Comandos**: `docker compose up -d`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev` (tudo junto), `pnpm check` (format+lint+typecheck+test+build).
- **Banco hoje tem dados de teste** (19 pedidos: 9 draft, 2 lyrics_ready, 6 delivered, 1 failed). Dono quer resetar quando começar a avaliar de verdade (pedir antes de apagar).

## Modelos e custos (chaves no `.env`, não expor)

| Etapa | Modelo OpenRouter | Custo |
| --- | --- | --- |
| Letra | `google/gemini-3-flash-preview` | ≈US$ 0,003 |
| Áudio (2 faixas/pedido) | `google/lyria-3-pro-preview` | US$ 0,08/faixa |
| **Total por venda** | | **≈US$ 0,165 (R$ 0,90 / R$ 49,90 ≈ 1,8%)** |

Key atual: limite mensal US$ 25, usados **US$ 21,23** (reabastecer antes de testar mais). Áudio bloqueado pelo filtro não cobra.

## Providers: o que é real, o que é fallback, o que falta

- **OpenRouter (letra+música): REAL e validado.**
- **Mercado Pago: adapter implementado** (Checkout Pro preference + webhook com assinatura HMAC `ts/v1`, `x-request-id`, dedupe em `payment_webhook_events`, conferência valor/moeda/external_reference) **mas sem credenciais** — dono decide depois.
- **Resend: implementado** (e-mail de entrega com link, `Idempotency-Key`, registro em `email_deliveries`) **sem credenciais**.
- **Fallback de desenvolvimento (fora de `production`, só quando a credencial não existe)**: checkout cria pagamento `dev` + endpoint `/dev/payments/:id/approve` (404 em prod; web aprova sozinho e navega); e-mail vira arquivo em `var/emails/<publicId>-entrega.txt` com o link privado real. Em `production` as chaves são obrigatórias (parseEnv + worker falham no boot).
- Storage: disco local em `LOCAL_STORAGE_PATH` — **precisa ser absoluto** senão API e worker divergem.

## Lições duras desta sessão (não regredir)

1. **Filtro de áudio do Lyria é probabilístico e sensível ao prompt.** Linhas de instrução de pronúncia (`Notas de pronúncia: X: y-z-a`) e prefixes de variante quase sempre disparavam `PROHIBITED_CONTENT` (30/30 bloqueios num pedido; texto idêntico sem essas linhas passava). `makeMusicPrompt` (domain) é deliberadamente mínimo — não adicionar texto "inocente" de volta sem testar. Bloqueio persistente: admin edita a letra (mantendo os fatos literais, exigência de `validateLyrics`) e usa "reproduzir".
2. Worker grava contêiner real detectado dos bytes (Lyria devolve **MP3 com C2PA mesmo pedindo `format:wav`**).
3. `retryJob` precisa de cast `::job_status` no CASE (enum Postgres). Job esgotado marca pedido `failed` (senão fica preso em `audio_generating`).
4. Clientes HTTP não devem mandar `content-type: application/json` sem body (Fastify rejeita); parser JSON custom da API tolera body vazio.
5. O form web precisa enviar todos os campos do contrato (`relationship`, `traits`, `biggestStory`, `safetyConfirmed`, ≥2 facts literais — validado no client E no server; erros Zod agora citam o campo).
6. `tsx watch` recarrega código, **não recarrega `.env`** — mudar env exige matar e subir de novo (e matar TODOS os watchers, senão processo velho com env velho segura a porta).
7. Builds de packages emitiam `.js/.d.ts` dentro de `src/` sombreando `.ts` — corrigido com `outDir: dist`; manter limpo.

## O que o dono pediu para a PRÓXIMA sessão (objetivos)

1. **Avaliar o fluxo de usuário de ponta a ponta**: navegar como cliente (e como admin), apontar o que não faz sentido para o produto, com opinião — o fluxo hoje: `/criar` (form único, só friend_roast no form web) → letra → revisão/edição → checkout (dev auto-aprova) → status com stepper → entrega com 2 faixas.
2. **Testar de verdade**: rodar `pnpm check` + e2e, criar pedidos reais via browser, validar casos de borda (rate limit de geração é 5/h — pode incomodar; limites de versão de letra; sessão admin 8h).
3. **Propor funcionalidades/ajustes para o MVP** — pensado em lançar este produto E reusar a "carcaça" (auth admin env-based, fila retomável, providers por variável, observabilidade) em vários MVPs pequenos.
4. **Separação de ambiente explícita** (pedido do dono): hoje = NODE_ENV + presença de credenciais. Ele quer um modo "homologação" com toggle/flag para testar checkout/e-mail sem depender de meios de pagamento reais — avaliar sandbox do Mercado Pago (credencial de teste + `MERCADO_PAGO_WEBHOOK_URL` pública via túnel), e/ou flag `SIMULATE_PAYMENTS` explicita; propor a forma correta sem reconstruir o "modo fake" que foi removido por decisão dele.
5. **Observabilidade de custos de IA (pedido forte)**: OpenRouter devolve `usage.cost` em toda resposta (e `/api/v1/generation?id=` para reconsultar). Persistir custo por geração (letra e cada faixa: model, tokens, custo, latência, status, se bloqueou), somar por pedido/dia, expor no admin (custo por venda, total no mês, comparado ao limite da key) e erro visível com `requestId`. Escolher solução leve (tabela `ai_usage` + tela) — evitar SaaS/otel completo num MVP, mas deixar interface de extração simples para virar shell reutilizável.
6. **Pendências conhecidas**: credenciais MP+Resend (homologa quando o dono fornecer), reset dos dados de teste, `git init` (permissível ao dono), terms/privacidade reais, limite de key (recarregar), e-mail de entrega em manual-mode só sai quando admin aprova (decidir se precisa).

## Como trabalhar

Inspecione antes de mudar. Cada mudança de comportamento: schema Zod em contracts + regra em domain + handler fino + teste (`fastify.inject` p/ HTTP, `flow.test.ts` contra Postgres real para fluxos). Rode `pnpm check` (e `pnpm test:e2e` quando mexer no web). Não declare provider validado sem chamada real autorizada. Não faça deploy, não registre segredos em logs/docs, não exponha a key em output.

Entregue relatório factual: o que avaliou, o que testou (com evidência), propostas priorizadas com custo/benefício, e o que precisa de decisão do dono.
