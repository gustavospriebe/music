# Música da Resenha

Um produto: `custom_song`. História livre → letra que o cliente pode revisar → PIX → duas versões de áudio → revisão e entrega privada. A capa é opcional e independente da produção musical. Não há cadastro.

Comece por [docs/project-context.md](docs/project-context.md). O [mapa da documentação](docs/documentation-map.md) separa o modelo vigente dos registros históricos. O estado de Git, CI e Railway está em [.specs/STATE.md](.specs/STATE.md); testes locais não comprovam o que está publicado.

## Estrutura

Monólito modular TypeScript estrito/ESM, Node 22, pnpm 12.3.4 e Turborepo:

- `apps/web`: React/Vite, jornada e administração.
- `apps/api`: Fastify, autenticação por capability, validação HTTP e comandos transacionais.
- `apps/worker`: consumidor contínuo da fila PostgreSQL, com posse renovável e validação de áudio por FFmpeg.
- `packages/contracts`: Zod para entradas, saídas e jobs.
- `packages/domain`: transições, conteúdo, dinheiro e tokens.
- `packages/database`: Drizzle, migrations, fila e liquidação financeira compartilhada.
- `packages/providers`: chamadas externas pontuais, e-mail e storage privado.

O contato está em `order_contacts`; o briefing criativo pode conter nomes/histórias pessoais e vai para os provedores de IA. Consentimentos registram versão e data. Produções fixam uma versão da letra; novas tentativas preservam os áudios anteriores. Custos informados, estimados e desconhecidos são distintos.

## Desenvolvimento

```sh
corepack pnpm install
# Configure .env a partir de .env.example, preservando qualquer arquivo existente.
docker compose up -d
corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm dev
```

PostgreSQL 18 usa o volume `postgres18-data` montado em `/var/lib/postgresql`. Um volume anterior do PostgreSQL 16 exige dump/restore para atualização; mudar a tag da imagem não atualiza seus dados. Não remova o volume antigo para resolver esse conflito.

O seed cria somente `custom_song`. `SONG_PRICE_CENTS=0` significa preço indefinido. O preço de um pedido é um snapshot e não acompanha alterações posteriores do catálogo. Administração usa `ADMIN_EMAIL`/`ADMIN_PASSWORD`; não existe autenticação por `password_hash` no banco.

Sem credenciais de pagamento fora de produção, a confirmação é local e explícita. E-mail pode ser gravado em `var/emails`. IA sem chave fica indisponível; não há geração fictícia escondida. `scripts/local-preview.sh` inicia o preview isolado sem carregar chaves de IA por padrão. Modos que habilitam IA exigem autorização de gasto própria; nenhum teste do gate deve chamar um provedor real.

## Qualidade

```sh
DATABASE_URL_TEST=<banco_local_isolado> corepack pnpm check
corepack pnpm test:e2e
```

`check` cobre formato, lint, tipos, testes, verificação de objetos restaurados com dados sintéticos e build. Os testes de integração exigem uma URL local explícita com banco terminado em `_test` (ou `_remediation_<nome>`), migrado e descartável; suítes da fila podem limpar suas fixtures e não devem rodar concorrentemente sobre o mesmo banco. O runner serializa esses arquivos e os pacotes. O worker também exige `ffmpeg`. O CI provisiona PostgreSQL 18, Node 22 e FFmpeg. Playwright cobre a experiência com respostas controladas: não é homologação de PIX, IA, S3 ou e-mail.

As provas de código e de ambiente estão na [remediação local](.specs/features/audit-remediation/validation.md) e na [ativação externa](.specs/features/external-activation/validation.md). Em 12/09/2026 houve pagamento sandbox, IA, e-mail e restore de objetos reais; o comércio público permanece fechado. Não use contagens de testes de relatórios históricos como evidência do checkout atual.

## Operação

Pagamento é uma porta genérica com criação, consulta exata e busca por referência. AbacatePay é o adapter existente, não uma decisão irreversível de fornecedor. Uma tentativa é persistida antes da rede; resultado desconhecido bloqueia uma nova cobrança. Webhook e reconciliação usam a mesma liquidação. Veja [providers](docs/providers.md).

`AUDIO_REVIEW_MODE=manual` é o padrão. `automatic_release` libera após validação técnica de arquivo/duração e não avalia qualidade artística ou fidelidade da interpretação. Chamadas sem resultado exigem conferência no admin antes de permitir nova execução; custo desconhecido continua desconhecido.

Antes de vender, complete [o checklist](docs/production-checklist.md), [ativação externa](docs/external-activation-runbook.md) e [backup/restore](docs/backup-and-restore.md). É necessário preço, condições comerciais reais/versionadas, um PIX de produção autorizado, entrega recebida e restore dos objetos. Nada disso é substituído por `pnpm check`.

A web acessa a API na mesma origem (`/api`), preservando cookies privados. O proxy Nginx de produção exige `API_UPSTREAM` com a origem HTTP(S) da API; no Railway use `http://api.railway.internal:3001`. Esse endereço pertence ao servidor web, nunca ao JavaScript enviado ao navegador.
