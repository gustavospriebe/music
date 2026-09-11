# Railway: configuração dos serviços

Este guia prepara a infraestrutura; não executa deploy nem valida providers externos. Use serviços com estes nomes exatos para copiar as referências sem ajustes: `web`, `api`, `worker` e `Postgres`.

## Estrutura do projeto

Conecte `web`, `api` e `worker` ao mesmo repositório e branch `main`. Como o monorepo compartilha pacotes da raiz, mantenha Root Directory `/` nos três serviços e configure:

| Serviço  | `RAILWAY_DOCKERFILE_PATH`   | Domínio/healthcheck                                 |
| -------- | --------------------------- | --------------------------------------------------- |
| `web`    | `/docker/web/Dockerfile`    | domínio público target `8080`; healthcheck `/`      |
| `api`    | `/docker/api/Dockerfile`    | domínio público; healthcheck `/api/v1/health/ready` |
| `worker` | `/docker/worker/Dockerfile` | sem domínio e sem healthcheck HTTP                  |

Crie também um PostgreSQL chamado `Postgres`. API e worker usam a rede privada do PostgreSQL por referência; web chama o domínio público da API. Arquivos ficam em disco: crie um volume e monte o mesmo caminho absoluto em `api` e `worker` (ex.: `/data/resenha-storage`).

## Variáveis compartilhadas

Gere valores reais e diferentes dos placeholders. Compartilhe apenas com os serviços indicados:

| Variável                           | Serviços    | Valor                                                   |
| ---------------------------------- | ----------- | ------------------------------------------------------- |
| `NODE_ENV`                         | api, worker | `production`                                            |
| `DATABASE_URL`                     | api, worker | `${{Postgres.DATABASE_URL}}`                            |
| `WEB_URL`                          | api, worker | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}`                |
| `CUSTOMER_ACCESS_TOKEN_PEPPER`     | api, worker | secret aleatório de 32+ caracteres                      |
| `OPENROUTER_API_KEY`               | api, worker | secret selado                                           |
| `OPENROUTER_MUSIC_MODEL`           | api, worker | `google/lyria-3-pro-preview`                            |
| `OPENROUTER_COVER_TEXT_MODEL`      | api, worker | `google/gemini-3.1-flash-lite-image`                    |
| `OPENROUTER_COVER_REFERENCE_MODEL` | api, worker | `google/gemini-3.1-flash-image`                         |
| `STORAGE_PROVIDER`                 | api, worker | `local`                                                 |
| `LOCAL_STORAGE_PATH`               | api, worker | `/data/resenha-storage` (mesmo volume montado nos dois) |

Sele variáveis secretas no painel depois de validá-las. Alterações em variáveis ficam staged no Railway e só entram em vigor após deploy.

## Variáveis por serviço

### `web`

```dotenv
VITE_API_URL=https://${{api.RAILWAY_PUBLIC_DOMAIN}}
```

O valor é incorporado pelo Vite durante o build; mudar a URL exige novo deploy do web.

### `api`

```dotenv
PORT=3001
API_PORT=3001
COOKIE_SECRET=<secret-aleatorio-32+-caracteres>
ADMIN_EMAIL=<email-do-admin>
ADMIN_PASSWORD=<senha-forte>
ADMIN_SESSION_TTL=28800
OPENROUTER_TEXT_MODEL=google/gemini-3-flash-preview
ABACATEPAY_API_KEY=<chave-bearer-do-dashboard>
ABACATEPAY_PRODUCT_ID=<prod_-do-produto-R$-49-90>
ABACATEPAY_WEBHOOK_SECRET=<secret-do-webhook>
ABACATEPAY_WEBHOOK_URL=https://${{api.RAILWAY_PUBLIC_DOMAIN}}/api/v1/webhooks/abacate-pay
LYRICS_PROVIDER=openrouter
MUSIC_PROVIDER=openrouter
PAYMENT_PROVIDER=abacatepay
EMAIL_PROVIDER=resend
LOG_LEVEL=info
```

Configure o target port do domínio como `3001`. A aplicação também aceita a `PORT` injetada pelo Railway, que tem precedência sobre `API_PORT`.

### `worker`

```dotenv
RESEND_API_KEY=<secret-selado>
EMAIL_FROM=Musica da Resenha <noreply@seu-dominio.com>
AUDIO_REVIEW_MODE=automatic
WORKER_ID=worker-railway
WORKER_CONCURRENCY=1
WORKER_POLL_INTERVAL_MS=1000
JOB_LOCK_TIMEOUT_MS=300000
```

O worker é contínuo: não configure cron, domínio público ou healthcheck HTTP.

## Ordem de ativação

1. Provisionar `Postgres` e o volume compartilhado de arquivos.
2. Configurar referências e secrets em `api`/`worker` sem publicar valores em logs.
3. Fazer deploy da API e aplicar `pnpm db:migrate` contra o banco Railway por uma execução controlada.
4. Gerar o domínio da API, configurar `VITE_API_URL` e publicar o web.
5. Atualizar `WEB_URL`, AbacatePay e Resend com os domínios finais.
6. Executar o runbook de ativação externa e só então liberar pedidos reais.

O volume de arquivos não tem versionamento: mantenha backup/export separado do diretório de storage caso a retenção de áudios e capas seja obrigatória.
