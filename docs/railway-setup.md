# Railway: configuração dos serviços

Este guia prepara a infraestrutura; não valida providers externos nem autoriza tráfego comercial. Use serviços com estes nomes exatos para copiar as referências sem ajustes: `web`, `api`, `worker`, `Postgres` e `Bucket`.

O mapa canônico do sistema está em [project-context.md](project-context.md). O projeto Railway chama-se `musica`. O ambiente `production` já hospeda os serviços; tráfego comercial continua atrás do [checklist de produção](production-checklist.md) e das decisões de preço, PIX e revisão de áudio.

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

## Condições de promoção

Esta lista é configuração recomendada para a próxima promoção autorizada; não comprova alteração no Railway. A observação de 12/09/2026 encontrou API/worker atrás do web, `checkSuites=false` e watch patterns do web sem os pacotes compartilhados.

- Ativar espera pelo CI na origem Git de cada serviço. Confirmar os checks do SHA exato antes de promover; os três serviços devem terminar no mesmo SHA.
- Incluir `apps/<serviço>/**`, `packages/**`, `docker/<serviço>/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json` e `tsconfig.base.json` nos watch patterns. O web importa contracts.
- Para esta mudança incompatível, controlar os disparos automáticos, retirar a API antiga do tráfego e drenar requisições e chamadas do worker antes da migration. As renomeações de colunas também quebram a API antiga; parar apenas o worker é insuficiente. Aplicar migrations pelo pre-deploy único da API e promover API/worker/web do mesmo SHA antes de reativar consumo e tráfego. Seguir o [runbook externo](external-activation-runbook.md).
- Confirmar journal e hashes de todas as migrations incluídas no SHA, catálogo único e smoke sem gasto antes de habilitar checkout. Um deploy `SUCCESS` ou health 200 não substitui essas verificações.

## Variáveis compartilhadas

Gere valores reais e diferentes dos placeholders. Compartilhe apenas com os serviços indicados:

| Variável                           | Serviços    | Valor                                                                         |
| ---------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| `NODE_ENV`                         | api, worker | `production`                                                                  |
| `PAYMENT_ENVIRONMENT`              | api, worker | `sandbox` para homologação administrativa; `live` para cobrança real aprovada |
| `DATABASE_URL`                     | api, worker | `${{Postgres.DATABASE_URL}}`                                                  |
| `WEB_URL`                          | api, worker | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}`                                      |
| `CUSTOMER_ACCESS_TOKEN_PEPPER`     | api, worker | secret aleatório de 32+ caracteres                                            |
| `OPENROUTER_TEXT_MODEL`            | api, worker | modelo de texto configurado em provider-setup                                 |
| `OPENROUTER_API_KEY`               | api, worker | secret selado                                                                 |
| `OPENROUTER_MUSIC_MODEL`           | api, worker | `google/lyria-3-pro-preview`                                                  |
| `OPENROUTER_COVER_TEXT_MODEL`      | api, worker | `google/gemini-3.1-flash-lite-image`                                          |
| `OPENROUTER_COVER_REFERENCE_MODEL` | api, worker | `google/gemini-3.1-flash-image`                                               |
| `STORAGE_PROVIDER`                 | api, worker | `s3`                                                                          |
| `STORAGE_S3_BUCKET`                | api, worker | `${{Bucket.BUCKET}}`                                                          |
| `STORAGE_S3_REGION`                | api, worker | `${{Bucket.REGION}}`                                                          |
| `STORAGE_S3_ENDPOINT`              | api, worker | `${{Bucket.ENDPOINT}}`                                                        |
| `STORAGE_S3_ACCESS_KEY_ID`         | api, worker | `${{Bucket.ACCESS_KEY_ID}}`                                                   |
| `STORAGE_S3_SECRET_ACCESS_KEY`     | api, worker | `${{Bucket.SECRET_ACCESS_KEY}}`                                               |
| `STORAGE_S3_FORCE_PATH_STYLE`      | api, worker | `false` para buckets atuais; confirme em Credentials                          |

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
ABACATEPAY_API_KEY=<chave-bearer-do-dashboard>
ABACATEPAY_PRODUCT_ID=<prod_-do-produto>
ABACATEPAY_WEBHOOK_SECRET=<secret-do-webhook>
ABACATEPAY_WEBHOOK_URL=https://${{api.RAILWAY_PUBLIC_DOMAIN}}/api/v1/webhooks/abacatepay
ABACATEPAY_REQUIRE_WEBHOOK_SIGNATURE=true
SONG_PRICE_CENTS=<preco-aprovado-em-centavos>
POLICY_VERSION=<versao-dos-textos-publicados>
TERMS_URL=https://seu-dominio.com/termos
PRIVACY_URL=https://seu-dominio.com/privacidade
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

O worker também precisa de `LYRICS_PROVIDER`, `MUSIC_PROVIDER`, `EMAIL_PROVIDER`, `PAYMENT_PROVIDER`, `PAYMENT_ENVIRONMENT`, `ABACATEPAY_API_KEY` e `ABACATEPAY_PRODUCT_ID` quando esse adapter estiver ativo: reconciliação periódica roda nele. Modelos, ambiente monetário e credenciais devem corresponder aos da API. Não basta configurar apenas o processo HTTP.

`PAYMENT_ENVIRONMENT` é independente de `NODE_ENV`. Em hospedagem, mantenha `NODE_ENV=production` inclusive durante homologação. `sandbox` deve manter o checkout público bloqueado; o teste exige sessão administrativa e capability do pedido. Cada pagamento conserva seu ambiente persistido. Antes de trocar para `live`, resolva tentativas de sandbox no ambiente original e confira o histórico de ambiente desconhecido; mudar variáveis não reclassifica dinheiro anterior.

O worker é contínuo: não configure cron, domínio público ou healthcheck HTTP. `manual` é o default seguro de lançamento; altere para `automatic_release` somente após decisão comercial e homologação do fluxo de entrega.

## Ordem de ativação

1. Provisionar `Postgres` e `Bucket`.
2. Configurar referências e secrets em `api`/`worker` sem publicar valores em logs.
3. Em serviço existente, executar a manutenção e drenagem da API/worker antigos descritas no runbook. Configurar o pre-deploy único da API e aplicar migration contra o banco Railway somente após backup e preflight dos dados.
4. Executar o seed apenas na ativação inicial, de forma controlada, e provar que o catálogo não está vazio.
5. Configurar os domínios, `WEB_URL` e `VITE_API_URL`; publicar API/web/worker do mesmo SHA com CI aprovado, mantendo consumo suspenso até confirmar schema e configuração.
6. Confirmar callbacks e remetente, ambiente monetário e bloqueio público de sandbox antes de reabrir tráfego e worker.
7. Executar o runbook de ativação externa e só então liberar pedidos reais mediante os aceites comerciais.

O Railway Bucket é privado, S3-compatible e criptografado em repouso, adequado ao proxy de downloads da API. Use URL virtual-hosted (`STORAGE_S3_FORCE_PATH_STYLE=false`) salvo indicação contrária na aba Credentials. Ele não oferece backup automático, versionamento, lifecycle de objetos nem object lock; mantenha export/backup separado ou escolha outro S3 compatível caso esses controles sejam obrigatórios. Buckets usam rede pública, então tráfego originado pela API/worker conta como egress do serviço.
