# Railway: configuração dos serviços

Este guia prepara a infraestrutura; não valida providers externos nem autoriza tráfego comercial. Use serviços com estes nomes exatos para copiar as referências sem ajustes: `web`, `api`, `worker`, `Postgres` e `Bucket`.

O mapa canônico do sistema está em [project-context.md](project-context.md). O projeto Railway usa o nome `musica-da-resenha`. O ambiente inicial pode se chamar `production`, mas permanece operacionalmente bloqueado até todos os aceites deste guia e do checklist de produção.

## Estrutura do projeto

Conecte `web`, `api` e `worker` ao mesmo repositório e branch `main`. Como o monorepo compartilha pacotes da raiz, mantenha Root Directory `/` nos três serviços e configure:

| Serviço  | `RAILWAY_DOCKERFILE_PATH`   | Domínio/healthcheck                                 |
| -------- | --------------------------- | --------------------------------------------------- |
| `web`    | `/docker/web/Dockerfile`    | domínio público target `8080`; healthcheck `/`      |
| `api`    | `/docker/api/Dockerfile`    | domínio público; healthcheck `/api/v1/health/ready` |
| `worker` | `/docker/worker/Dockerfile` | sem domínio e sem healthcheck HTTP                  |

Crie também um PostgreSQL chamado `Postgres` e um Storage Bucket chamado `Bucket`. API e worker usam a rede privada do PostgreSQL por referência; web chama o domínio público da API.

Configuração de runtime:

| Serviço  | Réplicas | Restart  | Sleep      | Pre-deploy                                                                 |
| -------- | -------- | -------- | ---------- | -------------------------------------------------------------------------- |
| `web`    | 1        | `ALWAYS` | desativado | nenhum                                                                     |
| `api`    | 1        | `ALWAYS` | desativado | `packages/database/node_modules/.bin/tsx packages/database/src/migrate.ts` |
| `worker` | 1        | `ALWAYS` | desativado | nenhum                                                                     |

Não execute migration também no worker. O pre-deploy da API é o único owner recorrente do schema. O seed de produtos é uma ativação inicial separada:

```sh
packages/database/node_modules/.bin/tsx packages/database/src/seed.ts
```

Execute o seed de forma controlada depois da primeira migration e confirme `/api/v1/products`; não o acople a todo deploy.

## Variáveis compartilhadas

Gere valores reais e diferentes dos placeholders. Compartilhe apenas com os serviços indicados:

| Variável                           | Serviços    | Valor                                                |
| ---------------------------------- | ----------- | ---------------------------------------------------- |
| `NODE_ENV`                         | api, worker | `production`                                         |
| `DATABASE_URL`                     | api, worker | `${{Postgres.DATABASE_URL}}`                         |
| `WEB_URL`                          | api, worker | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}`             |
| `CUSTOMER_ACCESS_TOKEN_PEPPER`     | api, worker | secret aleatório de 32+ caracteres                   |
| `OPENROUTER_API_KEY`               | api, worker | secret selado                                        |
| `OPENROUTER_MUSIC_MODEL`           | api, worker | `google/lyria-3-pro-preview`                         |
| `OPENROUTER_COVER_TEXT_MODEL`      | api, worker | `google/gemini-3.1-flash-lite-image`                 |
| `OPENROUTER_COVER_REFERENCE_MODEL` | api, worker | `google/gemini-3.1-flash-image`                      |
| `STORAGE_PROVIDER`                 | api, worker | `s3`                                                 |
| `STORAGE_S3_BUCKET`                | api, worker | `${{Bucket.BUCKET}}`                                 |
| `STORAGE_S3_REGION`                | api, worker | `${{Bucket.REGION}}`                                 |
| `STORAGE_S3_ENDPOINT`              | api, worker | `${{Bucket.ENDPOINT}}`                               |
| `STORAGE_S3_ACCESS_KEY_ID`         | api, worker | `${{Bucket.ACCESS_KEY_ID}}`                          |
| `STORAGE_S3_SECRET_ACCESS_KEY`     | api, worker | `${{Bucket.SECRET_ACCESS_KEY}}`                      |
| `STORAGE_S3_FORCE_PATH_STYLE`      | api, worker | `false` para buckets atuais; confirme em Credentials |

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
ABACATEPAY_PRODUCT_ID=<prod_-do-produto>
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
AUDIO_REVIEW_MODE=manual
WORKER_ID=worker-railway
WORKER_CONCURRENCY=1
WORKER_POLL_INTERVAL_MS=1000
JOB_LOCK_TIMEOUT_MS=300000
```

O worker é contínuo: não configure cron, domínio público ou healthcheck HTTP. `manual` é o default seguro de lançamento; altere para `automatic` somente após decisão comercial e homologação do fluxo de entrega.

## Ordem de ativação

1. Provisionar `Postgres` e `Bucket`.
2. Configurar referências e secrets em `api`/`worker` sem publicar valores em logs.
3. Configurar o pre-deploy único da API e aplicar migration contra o banco Railway.
4. Executar o seed inicial de produtos de forma controlada e provar que o catálogo não está vazio.
5. Gerar o domínio da API, configurar `VITE_API_URL` e publicar o web.
6. Atualizar `WEB_URL`, AbacatePay e Resend com os domínios finais.
7. Executar o runbook de ativação externa e só então liberar pedidos reais.

O Railway Bucket é privado, S3-compatible e criptografado em repouso, adequado ao proxy de downloads da API. Use URL virtual-hosted (`STORAGE_S3_FORCE_PATH_STYLE=false`) salvo indicação contrária na aba Credentials. Ele não oferece backup automático, versionamento, lifecycle de objetos nem object lock; mantenha export/backup separado ou escolha outro S3 compatível caso esses controles sejam obrigatórios. Buckets usam rede pública, então tráfego originado pela API/worker conta como egress do serviço.
