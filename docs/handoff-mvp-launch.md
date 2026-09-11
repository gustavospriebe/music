# Handoff — lançamento MVP Música da Resenha

**Quando:** 2026-09-11 ~03:11Z. **Próxima sessão:** publicar o WIP da `main` (com AbacatePay) no Railway, semear catálogo, ligar checkout e validar um pedido sintético. Não mergear o branch `cursor/abacatepay-provider-55fd` por cima deste worktree.

Leia primeiro `docs/project-context.md`, `docs/railway-setup.md`, `docs/provider-setup.md`, `docs/external-activation-runbook.md`. Auditoria/handoff anteriores (desatualizados na infra): Agent Store `bc-59bb1ae3-a286-4d27-a17b-c6726155fbd8` (`docs/mvp-launch-audit.md`, `docs/handoff-local.md`). `.specs/STATE.md` ainda descreve Railway vazio — está errado; revalide ao vivo.

## Decisões do dono (esta sessão)

- Manter **todo o WIP da `main` local** (launch-remodel, UAT, admin-recovery, Lyria, etc.). Não descartar.
- Produção = Railway projeto **`musica-da-resenha`**. Storage = **Bucket Railway** (API S3-compatível). Não usar volume compartilhado api+worker (Railway monta um volume por serviço).
- Pagamento = **AbacatePay**. E-mail = **Resend**. Sem Mercado Pago. Ignorar `GOOGLE_API_KEY`.
- Secrets desta rodada podem ser usados; **rotacionar depois**. Uma chave Resend foi colada no chat — rotacionar.

## Onde está o código

| Lugar                                   | O que é                                                                                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/Users/gustavopriebe/dev/music`        | `main` em `c9f3d04` **+ WIP enorme uncommitted**, incluindo o port AbacatePay desta sessão. Trabalhe aqui.                                                              |
| `/Users/gustavopriebe/dev/music-launch` | worktree de `cursor/abacatepay-provider-55fd` @ `676e6b4`. AbacatePay + **storage só local** (S3 removido). **Não mergear assim.** Serve só como referência do adapter. |
| `origin/main`                           | `c9f3d04` (`chore(deploy): prepare Railway services`). Auto-deploy Railway aponta para isto. **AbacatePay ainda não está publicado.**                                   |

Nenhum commit/push desta sessão.

## O que já foi feito no WIP local (`/Users/gustavopriebe/dev/music`)

Port AbacatePay **em cima do WIP**, mantendo S3/`disabled`/comercial/Google music:

- Adapter: `apps/api/src/providers.ts` (`createAbacatePayProvider`, `verifyAbacatePaySecret`). Checkout `POST https://api.abacatepay.com/v2/checkouts/create`; lookup `GET /v2/checkouts/one`; confere `amount` em centavos.
- `apps/api/src/payment.ts` mapeia `PAID` → `approved`.
- Webhook: `POST /api/v1/webhooks/abacate-pay?webhookSecret=`. Dedup + lock + valor/moeda como o webhook antigo. Provider persistido: `abacate-pay`.
- Env: `PAYMENT_PROVIDER` = `abacatepay` \| `disabled`. Produção exige `ABACATEPAY_API_KEY`, `ABACATEPAY_PRODUCT_ID`, `ABACATEPAY_WEBHOOK_SECRET`.
- UI/E2E: label **AbacatePay**; botão `Pagar com AbacatePay`.
- Docs vivos atualizados (não reescrevi specs históricas em `.specs/features/ui-remodel/`).
- Testes desta troca: API 10 arquivos PASS (incl. `abacatepay.test.ts`); web `checkout`/`api`/`components` PASS. `pnpm check` completo do WIP **não** foi rerodado depois do port.

## Railway ao vivo (revalidado)

Projeto `f5c97fd4-ac71-4a80-b9b4-e26d7b18d0d4`, env production `70a16ba9-14d6-4956-a255-d3ca2b6349e4`.

| Serviço  | ID                                     | Estado recente                                                                                                                |
| -------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| web      | `6e14b1de-eb02-4e6b-a1ab-10df35ad9d66` | domínio `https://web-production-509d7.up.railway.app`                                                                         |
| api      | `c431f99f-6784-49f1-9075-a2212d909d01` | **SUCCESS** após placeholder MP; `GET https://api-production-d5cc.up.railway.app/api/v1/health/ready` → 200 `{"status":"ok"}` |
| worker   | `082bd45b-a39d-4121-ad53-9d316f5e338c` | SUCCESS com Resend                                                                                                            |
| Postgres | `bbe09f85-d730-4c94-9c49-e8e2a0794fb8` | volume `postgres-volume`                                                                                                      |
| Bucket   | `ebc58495-0289-48a5-ae76-f84268b2ec13` | **manter**; api/worker com `STORAGE_PROVIDER=s3` e refs `${{Bucket.*}}`                                                       |

`GET /api/v1/products` → **lista vazia**. Seed de produção não rodou. Pre-deploy de migrate da API existe; seed é ativação à parte (`docs/railway-setup.md`).

Vars já aplicadas (não imprimir valores): OpenRouter na api; Resend na api e worker (`RESEND_API_KEY` do worker = `${{api.RESEND_API_KEY}}`); `EMAIL_FROM=Musica da Resenha <noreply@renovagp.com>` (domínio Resend **renovagp.com** verificado, região sa-east-1); `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`COOKIE_SECRET`/`CUSTOMER_ACCESS_TOKEN_PEPPER` novos no `.env` local e na api; webhook AbacatePay URL+secret já estavam na api (de sessão anterior). `MERCADO_PAGO_WEBHOOK_URL` removida.

**Armadilha:** o binário no Railway é `c9f3d04`, cujo enum é **só** `mercadopago`. `PAYMENT_PROVIDER=disabled` derruba a API (`Invalid environment: PAYMENT_PROVIDER`). Por isso o live está com `mercadopago` + tokens placeholder só para boot. Depois de publicar o WIP: `PAYMENT_PROVIDER=abacatepay` e apagar `MERCADO_PAGO_*`.

## O que falta (ordem)

1. **Chaves AbacatePay** — `ABACATEPAY_API_KEY` (dev) e `ABACATEPAY_PRODUCT_ID` **não estão** no `.env`. Pedir ao dono. Sem isso não ligue o checkout nem marque provider validado.
2. **Commit + push do WIP da `main`** (só com pedido explícito). Dispara auto-deploy dos 3 serviços. Não use o branch `cursor/abacatepay-provider-55fd` como merge.
3. Após deploy verde: `PAYMENT_PROVIDER=abacatepay` na api; setar as duas chaves; remover placeholders `MERCADO_PAGO_*`. Cadastrar webhook no dashboard: `https://api-production-d5cc.up.railway.app/api/v1/webhooks/abacate-pay?webhookSecret=<valor já na var Railway>`, eventos `checkout.completed` + `checkout.refunded`.
4. Seed controlado no Postgres Railway; confirmar `/api/v1/products` com os 3 produtos.
5. Pedido sintético AbacatePay **devMode**; conferir entrega, download pela capability e e-mail (Resend real ou `var/emails` local). Sem chamada bem-sucedida, não marcar VALIDATED.
6. Pendências explícitas: `AUDIO_REVIEW_MODE` (worker live parece `automatic`; default seguro do repo é `manual`); backup/export do Bucket (sem versionamento); jurídico (termos, privacidade, reembolso, `COMMERCIAL_READY`); CI remoto ainda é o HEAD antigo.

## Local

Postgres compose já up em `localhost:5433`. `.env` tem OpenRouter, Resend nova, admin, cookie/pepper. `EMAIL_FROM` local ainda pode ser gmail (Resend rejeita); produção usa `noreply@renovagp.com`. `ADMIN_EMAIL` local = `admin@resenha.local`.

## Skills da próxima sessão

- Railway MCP + skill `use-railway` (vars, logs, redeploy). CLI para secrets via `--stdin`.
- Resend MCP (`list-domains`) se mexer em e-mail.
- `AGENTS.md`: Corepack pnpm, não logar secrets, não declarar provider validado sem chamada real.
- Não precisa TLC/spec nova — isto é ativação, não feature nova.

## Anti-padrões

- Não apagar o Bucket. Não montar o mesmo volume em api e worker.
- Não commitar `.env`. Não republicar a chave Resend nem o webhook secret.
- Não tratar health 200 como “pagamento/e-mail/S3 homologados”.
