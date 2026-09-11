# Música da Resenha

MVP brasileiro para transformar histórias de amigos em música personalizada. A pessoa conta a resenha, revisa a letra, paga via AbacatePay e recebe duas versões de áudio e uma capa opcional em página privada. Letra, áudio e capa são gerados via OpenRouter; a entrega é avisada por e-mail (Resend).

## Stack e estrutura

Turborepo + pnpm + TypeScript estrito. `apps/web` contém React/Vite; `apps/api`, Fastify; `apps/worker`, a fila PostgreSQL. `packages/contracts`, `domain` e `database` são compartilhados. As fronteiras de adapters/configuração estão em `packages/providers` e `packages/config`; presets compartilhados ficam em `packages/eslint-config` e `packages/typescript-config`.

Mais detalhes: [arquitetura](docs/architecture.md), [plano histórico](docs/implementation-plan.md), [configuração de providers](docs/provider-setup.md), [deploy no Railway](docs/railway-setup.md) e [checklist de produção](docs/production-checklist.md).

## Rodando localmente

Pré-requisitos: Node Active LTS, Corepack, Docker e Docker Compose.

```sh
corepack enable
corepack pnpm install
cp .env.example .env   # OpenRouter é obrigatório; AbacatePay e Resend têm fallback fora de produção
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

URLs locais: web `http://localhost:5175`, API `http://localhost:3001`, OpenAPI `http://localhost:3001/documentation`. O banco publicado localmente usa `localhost:5433`. Com `STORAGE_PROVIDER=local`, `LOCAL_STORAGE_PATH` deve ser absoluto para API e worker compartilharem os mesmos arquivos. Produção usa o mesmo disco local via volume compartilhado entre `api` e `worker`.

Os adapters de rede são reais e selecionados por variáveis de ambiente (`LYRICS_PROVIDER`, `MUSIC_PROVIDER`, `PAYMENT_PROVIDER`, `EMAIL_PROVIDER`, `STORAGE_PROVIDER`); não existe modo fake de provider. OpenRouter é necessário para gerar letra, áudio e capa. Os modelos e custos estão registrados em [providers](docs/providers.md); o gate local atual usa providers controlados e não revalida a rede. Sem credenciais de AbacatePay ou Resend fora de produção, o checkout usa confirmação local pelo pedido e o e-mail é gravado em `var/emails` com o link privado. Em produção, a API exige OpenRouter, AbacatePay e `LOCAL_STORAGE_PATH` absoluto; o worker exige OpenRouter, Resend e o mesmo caminho.

Modelos de áudio têm filtro de conteúdo probabilístico: uma letra pode ser bloqueada (`PROHIBITED_CONTENT`) mesmo passando nas regras locais. O worker tenta várias vezes, o job fica visível no painel e o admin pode editar a letra ou regenerar.

## Retomada e acesso privado

- A criação guarda no navegador uma chave UUID por tentativa. A API persiste apenas o SHA-256 e devolve o mesmo `publicId` em retry, sem duplicar pedido ou evento.
- Geração de letra usa claim atômico. Reload apenas consulta o pedido; uma nova tentativa só é liberada após falha ou claim sem atualização por cinco minutos.
- Edição e aprovação sempre acrescentam versões. Uma letra histórica nunca é reescrita.
- Cookies de pedido/visualização são capabilities assinadas, `HttpOnly` e vinculadas ao `publicId`. Um marcador literal forjado recebe 401.
- O link de entrega troca o token por acesso de visualização, salva somente o `publicId` no histórico local e não concede mutações nem expõe dados do formulário.

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
npx react-doctor@latest --verbose --scope changed
```

`pnpm check` executa formato, lint, typecheck, testes e build. O GitHub Actions usa PostgreSQL de serviço e roda essas verificações, incluindo Playwright, sem credenciais externas. Antes de promover uma migration, execute `pnpm db:migrate` e `pnpm db:seed` duas vezes no banco alvo; o replay deve terminar sem duplicação ou erro.

## Providers e produção

OpenRouter, AbacatePay e Resend são selecionados apenas por variáveis de ambiente. Configure-os seguindo [docs/provider-setup.md](docs/provider-setup.md) e execute o [runbook de ativação externa](docs/external-activation-runbook.md); integrações reais só são consideradas validadas após chamada autorizada e bem-sucedida. O webhook do AbacatePay precisa de URL pública (ex.: túnel em desenvolvimento). Nenhuma chave Gemini é usada nem salva: uma chave previamente exposta em conversa deve ser rotacionada.

Há imagens de produção multi-stage e não-root em `docker/api/Dockerfile`, `docker/worker/Dockerfile` e `docker/web/Dockerfile`. O projeto não faz deploy. Antes de publicar, siga [docs/production-checklist.md](docs/production-checklist.md).

## Custo de IA

Cada chamada ao OpenRouter grava uma linha em `ai_usage` (pedido, `kind` letra/áudio/capa, modelo, tokens, `cost_usd` em dólar como devolvido em `usage.cost`, latência, status, `requestId` e tentativa). Somas em USD usam `numeric` no PostgreSQL e trafegam como string decimal exata até o painel. Respostas públicas carregam só referências públicas. Logs HTTP usam request ID, template de rota, status e duração; logs do worker usam tipo, status, tentativa e duração, sem UUID de job/pedido, token, letra, imagem ou formulário.

## Limites do MVP

Não há clonagem de voz, imitação de artista, vídeo, WhatsApp Business, cobrança automática real ou deploy. Termos, privacidade, consentimentos e promessa comercial precisam de revisão jurídica/comercial antes de produção. Sem cadastro: `/minhas-musicas` lista neste navegador os pedidos criados aqui (`resenha:my-orders`, 20 mais recentes); em aparelho novo ou dados limpos, a lista não acompanha.
