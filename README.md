# Música da Resenha

MVP brasileiro para transformar histórias de amigos em música personalizada. A pessoa conta a resenha, revisa a letra, paga via Mercado Pago e recebe duas versões de áudio em página privada. Letra e áudio são gerados via OpenRouter; a entrega é avisada por e-mail (Resend).

## Stack e estrutura

Turborepo + pnpm + TypeScript estrito. `apps/web` contém React/Vite; `apps/api`, Fastify; `apps/worker`, a fila PostgreSQL. `packages/contracts`, `domain` e `database` são compartilhados. As fronteiras de adapters/configuração estão em `packages/providers` e `packages/config`; presets compartilhados ficam em `packages/eslint-config` e `packages/typescript-config`.

Mais detalhes: [ARCHITECTURE.md](ARCHITECTURE.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), [provider setup](docs/provider-setup.md) e [checklist de produção](docs/production-checklist.md).

## Rodando localmente

Pré-requisitos: Node Active LTS, Corepack, Docker e Docker Compose.

```sh
corepack enable
corepack pnpm install
cp .env.example .env   # preencha as chaves de OpenRouter, Mercado Pago e Resend
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

URLs locais: web `http://localhost:5175`, API `http://localhost:3001`, OpenAPI `http://localhost:3001/documentation`. O banco publicado localmente usa `localhost:5433`. `LOCAL_STORAGE_PATH` deve ser absoluto para que API e worker compartilhem o mesmo diretório de arquivos.

Os providers são reais e selecionados por variáveis de ambiente (`LYRICS_PROVIDER`, `MUSIC_PROVIDER`, `PAYMENT_PROVIDER`, `EMAIL_PROVIDER`). Modelos recomendados (validados com chamada real): `OPENROUTER_TEXT_MODEL=google/gemini-3-flash-preview` (letra, custo marginal) e `OPENROUTER_MUSIC_MODEL=google/lyria-3-pro-preview` (duas músicas completas por pedido, US$ 0,08 por faixa). Sem as credenciais de Mercado Pago/Resend fora de produção: o checkout roda em modo dev (aprovação automática via endpoint local) e o e-mail de entrega é gravado em `var/emails` com o link privado — a entrega da música continua funcionando de ponta a ponta. Em produção a API exige as chaves de OpenRouter e Mercado Pago e o worker exige a chave da Resend.

Modelos de áudio têm filtro de conteúdo probabilístico: uma letra pode ser bloqueada (`PROHIBITED_CONTENT`) mesmo passando nas regras locais. O worker tenta várias vezes, o job fica visível no painel e o admin pode editar a letra ou regenerar.

## Banco e admin

Use `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed` e `pnpm db:studio` para o banco. O admin é único e gerenciado por variáveis de ambiente: defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` no `.env` e faça login em `/admin/login`. Trocar a senha é editar a variável e reiniciar a API. Nunca registre senhas, cookies, tokens ou chaves em código ou logs.

## Qualidade

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm check
```

`pnpm check` executa formato, lint, typecheck, testes e build. O GitHub Actions usa PostgreSQL de serviço e roda essas verificações, incluindo Playwright, sem credenciais externas.

## Providers e produção

OpenRouter, Mercado Pago e Resend são selecionados apenas por variáveis de ambiente. Configure-os seguindo [docs/provider-setup.md](docs/provider-setup.md); as integrações reais são consideradas validadas somente após chamada autorizada e bem-sucedida. O webhook do Mercado Pago precisa de URL pública (ex.: túnel em desenvolvimento). Nenhuma chave Gemini é usada nem salva: uma chave previamente exposta em conversa deve ser rotacionada.

Há imagens de produção multi-stage e não-root em `docker/api/Dockerfile`, `docker/worker/Dockerfile` e `docker/web/Dockerfile`. O projeto não faz deploy. Antes de publicar, siga [docs/production-checklist.md](docs/production-checklist.md).

## Custo de IA

Cada chamada ao OpenRouter grava uma linha em `ai_usage` (pedido, `kind` letra/áudio, modelo, tokens, `cost_usd` em dólar como devolvido em `usage.cost`, latência, status `ok`/`blocked`/`error`/`rejected`, `requestId` e tentativa — inclusive bloqueios do filtro e tentativas reprovadas na validação local, que também são cobradas). Somas em USD são feitas no PostgreSQL (`numeric`) e trafegam como string decimal exata até o painel. O admin vê o custo por pedido, o agregado do mês/30 dias em `GET /admin/ai-usage/summary` e o uso da key (`GET /key` documentado do OpenRouter, gratuito, best-effort) no painel. Respostas públicas e logs carregam só referências públicas (`publicId`, número da versão, variante do áudio); UUIDs internos ficam no admin autenticado.

## Limites do MVP

Não há clonagem de voz, imitação de artista, vídeo, WhatsApp Business, cobrança automática real ou deploy. Termos, privacidade, consentimentos e promessa comercial precisam de revisão jurídica/comercial antes de produção. Sem cadastro: `/minhas-musicas` lista neste navegador os pedidos criados aqui (`resenha:my-orders`, 20 mais recentes); em aparelho novo ou dados limpos, a lista não acompanha.
