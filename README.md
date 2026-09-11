# Música da Resenha

Aplicação brasileira para transformar uma história, homenagem, presente ou ideia livre em música personalizada. A pessoa prepara a ideia em quatro passos, cria e revisa a letra, decide pelo áudio e recebe duas versões em página privada. Pagamento, e-mail e condições comerciais são configurados no servidor. OpenRouter gera letra, áudio e capa opcional.

## Stack e estrutura

Turborepo + pnpm + TypeScript estrito. `apps/web` contém React/Vite; `apps/api`, Fastify; `apps/worker`, a fila PostgreSQL. `packages/contracts`, `domain` e `database` são compartilhados. Storage e e-mail têm adapters em `packages/providers`; pagamento fica em `apps/api/src/payment.ts`. Os pacotes legados de configuração não são a fonte dos providers.

Comece pelo [contexto canônico](docs/project-context.md). Mais detalhes: [arquitetura](docs/architecture.md), [auditoria UI/UX atual](docs/ui-ux-audit.md), [plano histórico](docs/implementation-plan.md), [configuração de providers](docs/provider-setup.md), [deploy no Railway](docs/railway-setup.md) e [checklist de produção](docs/production-checklist.md).

## Rodando localmente

Pré-requisitos: Node 22, pnpm 12.3.4 via Corepack, Docker e Docker Compose.

```sh
corepack enable
corepack pnpm install
cp .env.example .env   # Somente se .env não existir; faça backup antes de editar
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

URLs locais: web `http://localhost:5175`, API `http://localhost:3001`, OpenAPI `http://localhost:3001/documentation`. O banco publicado localmente usa `localhost:5433`. Com `STORAGE_PROVIDER=local`, `LOCAL_STORAGE_PATH` deve ser absoluto para API e worker compartilharem os mesmos arquivos. Produção exige `STORAGE_PROVIDER=s3` e bucket privado.

Os adapters de rede são reais e selecionados por variáveis de ambiente (`LYRICS_PROVIDER`, `MUSIC_PROVIDER`, `PAYMENT_PROVIDER`, `EMAIL_PROVIDER`, `STORAGE_PROVIDER`); não existe modo fake de provider. OpenRouter é necessário para gerar letra, áudio e capa. Os modelos e custos estão registrados em [providers](docs/providers.md); o gate local atual usa providers controlados e não revalida a rede. Sem credenciais de AbacatePay ou Resend fora de produção, o checkout usa confirmação local pelo pedido e o e-mail é gravado em `var/emails` com o link privado. Em produção, a API exige OpenRouter e S3, e credenciais do pagamento quando o adapter estiver habilitado; o worker exige OpenRouter, Resend e S3. `PAYMENT_PROVIDER=disabled` mantém a cobrança indisponível. Preço positivo e condições comerciais publicadas também são exigidos para checkout real.

Modelos de áudio têm filtro de conteúdo probabilístico: uma letra pode ser bloqueada (`PROHIBITED_CONTENT`) mesmo passando nas regras locais. O worker tenta várias vezes, o job fica visível no painel e o admin pode editar a letra ou regenerar.

## Preview isolado

O preview local usa banco separado `music_launch_preview`, API 3010 e web 5180. Ele ignora credenciais de providers do `.env`; permite testar criação, navegação, administração e estados de indisponibilidade sem gastar com IA. Prepare o banco uma vez:

```sh
docker exec music-postgres-1 createdb -U resenha music_launch_preview
DATABASE_URL=postgresql://resenha:resenha@localhost:5433/music_launch_preview pnpm db:migrate
DATABASE_URL=postgresql://resenha:resenha@localhost:5433/music_launch_preview SONG_PRICE_CENTS=0 pnpm db:seed
```

Em três terminais Node 22, execute `bash scripts/local-preview.sh api`, `bash scripts/local-preview.sh web` e `bash scripts/local-preview.sh worker`. Acesse [http://localhost:5180](http://localhost:5180). Admin desse preview: `admin@example.test` / `local-preview-only-2026`. Essas credenciais servem apenas ao banco local isolado. `Ctrl+C` encerra cada processo.

Após autorização e definição de orçamento, `PREVIEW_AI=lyrics` carrega apenas chave e modelo de letra para a API; `PREVIEW_AI=lyrics-audio` também permite áudio no worker; `PREVIEW_AI=all` acrescenta os dois modelos de capa à API e ao worker. Reinicie os processos escolhidos com esse prefixo, por exemplo `PREVIEW_AI=all bash scripts/local-preview.sh api`. O `.env` é interpretado seletivamente, nunca executado; web, cobrança e email real continuam sem credenciais. Acrescente `--check` para verificar disponibilidade sem iniciar serviço nem chamar provider. O modo padrão permanece `off`. O launcher não impõe um limite monetário global: acompanhe `ai_usage` e o consumo no provider durante a rodada autorizada. Saldo da conta e limite disponível da chave OpenRouter são controles distintos; erros permanentes como HTTP 402 encerram a produção sem retry automático inútil.

No estúdio, intenção e ocasião são independentes; ocasião é opcional na criação livre. Estilo e clima usam opções com entrada personalizada em “Outro”. As quatro partes pertencem à preparação; a jornada seguinte identifica História, Letra, Pagamento, Produção e Entrega por nome.

A letra tem leitura por estrofes, edição de título/versos, descarte e histórico. O refinamento por IA usa a última versão salva e orientação do cliente, com geração explícita e limite preservado. Produção mostra atividade, estados reais por variante e revisão humana; políticas vazias não viram placeholders no checkout. Evidências e limites estão em [lyrics-production-polish](docs/lyrics-production-polish.md).

## Retomada e acesso privado

- A criação guarda no navegador uma chave UUID por tentativa. A API persiste apenas o SHA-256 e devolve o mesmo `publicId` em retry, sem duplicar pedido ou evento.
- Geração de letra usa claim atômico. Reload apenas consulta o pedido; uma nova tentativa só é liberada após falha ou claim sem atualização por cinco minutos.
- Edição e aprovação sempre acrescentam versões. Uma letra histórica nunca é reescrita.
- Cookies de pedido/visualização são capabilities assinadas, `HttpOnly` e vinculadas ao tipo de acesso, `publicId` e versão atual de acesso. Revogar no admin invalida cookies e links anteriores.
- O link de entrega troca o token por acesso de visualização, salva somente o `publicId` no histórico local e não concede mutações nem expõe dados do formulário.

A orientação de composição e seus limites editoriais estão em [revisão do prompt de letra](docs/lyrics-prompt-review.md). As amostras mostraram melhora estrutural, mas qualidade artística ainda irregular; o prompt não transforma avaliação estética em bloqueio automático.

## Banco e admin

Consulte [recuperação administrativa](docs/admin-recovery.md) para acompanhar falhas e retomar letra, áudio, capa e aviso de entrega pelo painel, com histórico e confirmação de impacto.

O detalhe do pedido no admin atualiza automaticamente a cada cinco segundos enquanto há processamento pendente, encerrando as consultas ao concluir ou falhar. Falhas transitórias de atualização são sinalizadas sem apagar o último resultado.

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
npx -y react-doctor@latest . --verbose --diff
```

`pnpm check` executa formato, lint, typecheck, testes e build. O GitHub Actions usa PostgreSQL de serviço e roda essas verificações, incluindo Playwright, sem credenciais externas. Antes de promover uma migration, execute `pnpm db:migrate` e `pnpm db:seed` duas vezes no banco alvo; o replay deve terminar sem duplicação ou erro.

A baseline local de 2026-09-06 passou com Node 22.22.2, pnpm 12.3.4, 119 testes, 30 cenários E2E e builds Docker dos três serviços. Evidência e limites estão em `.specs/features/local-readiness-ui-audit/local-validation.md`; isso não substitui CI remoto, providers reais, UAT humana ou deploy.

A remodelagem anterior está em `docs/ui-remodel-report.md`. A entrega atual, correções da revisão e evidências novas ficam em [docs/launch-remodel-report.md](docs/launch-remodel-report.md) e `.specs/features/launch-remodel/`. Contagens históricas não representam os gates atuais. Lançamento comercial exige os gates externos e as decisões de preço e condições.

## Providers e produção

OpenRouter, AbacatePay, Resend e o Bucket S3-compatível do Railway são selecionados apenas por variáveis de ambiente. Configure-os seguindo [docs/provider-setup.md](docs/provider-setup.md) e execute o [runbook de ativação externa](docs/external-activation-runbook.md); integrações reais só são consideradas validadas após chamada autorizada e bem-sucedida. O webhook do AbacatePay precisa de URL pública. Nenhuma chave Gemini é usada nem salva: uma chave previamente exposta em conversa deve ser rotacionada.

Há imagens de produção multi-stage e não-root em `docker/api/Dockerfile`, `docker/worker/Dockerfile` e `docker/web/Dockerfile`. O projeto não faz deploy. Antes de publicar, siga [docs/production-checklist.md](docs/production-checklist.md).

## Custo de IA

Cada chamada ao OpenRouter grava uma linha em `ai_usage` (pedido, `kind` letra/áudio/capa, modelo, tokens, `cost_usd` em dólar como devolvido em `usage.cost`, latência, status, `requestId` e tentativa). Somas em USD usam `numeric` no PostgreSQL e trafegam como string decimal exata até o painel. Respostas públicas carregam só referências públicas. Logs HTTP usam request ID, template de rota, status e duração; logs do worker usam tipo, status, tentativa e duração, sem UUID de job/pedido, token, letra, imagem ou formulário.

## Limites do MVP

Não há clonagem de voz, imitação de artista, vídeo, WhatsApp Business, cobrança automática real ou deploy. Termos, privacidade, consentimentos e promessa comercial precisam de revisão jurídica/comercial antes de produção. Sem cadastro: `/minhas-musicas` lista neste navegador os pedidos criados aqui (`resenha:my-orders`, 20 mais recentes); em aparelho novo ou dados limpos, a lista não acompanha.
