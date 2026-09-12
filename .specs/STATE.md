# STATE

## Decisions

### AD-001

- **Decision**: Cookies públicos de capability são sempre assinados e verificados no servidor; um marcador literal nunca concede acesso.
- **Reason**: O nome do cookie contém uma referência pública e pode ser forjado por qualquer cliente HTTP.
- **Trade-off**: Sessões locais antigas com marcador não assinado deixam de funcionar e precisam ser recuperadas por um link de entrega válido.
- **Scope**: API pública, pedidos e entregas.
- **Date**: 2026-09-04
- **Status**: active

### AD-002

- **Decision**: Operações síncronas com provider externo usam claim compare-and-set no PostgreSQL e só retomam claims sem atualização após timeout explícito.
- **Reason**: O banco já é a fonte de verdade e evita uma segunda infraestrutura de lock/fila para a geração de letra.
- **Trade-off**: Uma interrupção exige aguardar o timeout de recuperação; não há cancelamento imediato da chamada em curso.
- **Scope**: API, worker e futuras operações externas cobradas. **Superseded for lyrics** by AD-013.
- **Date**: 2026-09-04
- **Status**: superseded (letra); remaining sync I/O should prefer the job queue.

### AD-003

- **Decision**: A capa de álbum é um agregado opcional pós-pagamento, com até duas tentativas históricas, sem participar de `orders.status`.
- **Reason**: A música continua sendo o produto contratado; uma falha visual não pode bloquear áudio, entrega ou reembolso.
- **Trade-off**: A UI combina dois estados assíncronos independentes e o suporte precisa observá-los separadamente.
- **Scope**: API pública, worker, storage e entrega.
- **Date**: 2026-09-04
- **Status**: active

### AD-004

- **Decision**: Arquivos de produção usam storage S3 compatível privado; disco local é permitido somente fora de produção. Downloads continuam mediados pela API e pelas capabilities existentes.
- **Reason**: URLs públicas ou enumeráveis violariam a privacidade de áudio e referências pessoais.
- **Trade-off**: Produção exige bucket, credenciais, backup de objetos e teste de restore antes do lançamento.
- **Scope**: API, worker e operação.
- **Date**: 2026-09-04
- **Status**: active

### AD-005

- **Decision**: A produção usa um único projeto Railway com serviços `web`, `api`, `worker`, `Postgres` e `Bucket`; migrations recorrentes pertencem ao pre-deploy da API e o seed de produtos é uma ativação inicial separada.
- **Reason**: O monorepo já possui três runtimes distintos, fila PostgreSQL e adapter S3; esta topologia reduz serviços paralelos e define um único owner do schema.
- **Trade-off**: A aplicação depende do plano de controle Railway e o Bucket exige export/backup externo.
- **Scope**: Deploy, banco, storage, CI operacional e futuras sessões de infraestrutura.
- **Date**: 2026-09-06
- **Status**: active

### AD-006

- **Decision**: O repositório usa pnpm 12.3.4 e preserva o lockfile oficial em dois documentos; o arquivo gerado fica fora do Prettier e somente as versões travadas do esbuild têm postinstall autorizado.
- **Reason**: O pnpm 12 separa metadados de ambiente e grafo do projeto; reformatar ou interpretar apenas o primeiro documento produz falsos diagnósticos e instalações não reproduzíveis.
- **Trade-off**: Ferramentas YAML antigas podem não interpretar o grafo; scanners e agentes devem usar pnpm ou ler explicitamente o último documento.
- **Scope**: desenvolvimento local, CI e builds Docker.
- **Date**: 2026-09-06
- **Status**: active

## Launch remodel decisions (2026-09-07)

### AD-007

- **Decision**: custom_song é aditivo; tema e briefing são inspiração criativa, sem cópia literal obrigatória. Fatos opcionais expressamente fornecidos continuam verificáveis; produtos anteriores preservam seu contrato.
- **Reason**: Criação livre não deve inventar relações nem converter texto do cliente em versos obrigatórios.
- **Scope**: contratos, domínio, API e estúdio do cliente.
- **Status**: superseded by AD-015/AD-016/AD-018 (2026-09-12)

### AD-008

- **Decision**: Gateway pode ficar disabled; checkout real exige preço positivo e condições comerciais publicadas. Catálogo não reprecifica snapshots históricos de pedidos.
- **Reason**: O dono ainda escolherá preço e fornecedor; configuração técnica não equivale a autorização comercial.
- **Scope**: catálogo, pagamento, checkout e ativação.
- **Status**: active

### AD-009

- **Decision**: Intenção de email é persistida antes de enviar e mantém token/mensagem em retry. Cookies vinculam tipo, pedido e versão atual; revogação invalida acessos anteriores.
- **Reason**: Evitar link morto depois de envio aceito e garantir revogação efetiva.
- **Scope**: API, worker, providers e entrega privada.
- **Status**: active

### AD-010

- **Decision**: Gateway AbacatePay integrado como provedor oficial de pagamento PIX (`PAYMENT_PROVIDER=abacatepay`). O checkout restringe métodos a PIX (`methods: ['PIX']`), consulta status de billing via `/v2/checkouts/list?id=` e aceita assinatura de webhook tanto por query param quanto por headers (`x-webhook-secret`/`x-secret`).
- **Reason**: O AbacatePay v2 unificou a consulta e requer suporte a headers nos webhooks nativos.
- **Scope**: API, provedores de pagamento, contratos e checkout.
- **Date**: 2026-09-11
- **Status**: superseded by AD-015/AD-016/AD-018 (2026-09-12)

### AD-011

- **Decision**: O retorno do checkout para a página pública de acompanhamento (`/pedido/:publicId`) conta com persistência imediata de `externalPaymentId` no ato da criação da fatura, verificação ativa e reconciliação proativa na API caso o webhook sofra latência, e polling a cada 2s com feedback visual em `payment_pending`.
- **Reason**: Elimina o atrito do cliente voltar do banco e ver "Falta o pagamento" ou botão duplicado enquanto o webhook ainda trafega.
- **Scope**: API, Web, Checkout, Jobs.
- **Date**: 2026-09-11
- **Status**: superseded by AD-015/AD-016/AD-018 (2026-09-12)

### AD-012

- **Decision**: Notificações por e-mail via Resend utilizam o remetente oficial do domínio verificado (`EMAIL_FROM=Música da Resenha <contato@renovagp.com>`).
- **Reason**: O Resend bloqueia com HTTP 403 remetentes em domínios não verificados (como `@gmail.com`).
- **Scope**: Worker, Resend, Configuração.
- **Date**: 2026-09-11
- **Status**: active

### AD-013

- **Decision**: Letra entra na mesma fila PostgreSQL do áudio (`generate_lyrics`). HTTP valida e enfileira; o worker executa OpenRouter + `validateLyrics`. Stale claim usa `releaseStaleJobs`, não CAS de 5 minutos em `orders.updatedAt`. Idempotência `lyrics:{orderId}:{nextVersion}`. Primeira geração falha → `failed`; refinamento falho → `lyrics_ready`.
- **Reason**: O request HTTP não deve segurar 3×60s; a UI já faz poll em `lyrics_generating`; uma política de lock só.
- **Trade-off**: O cliente vê `accepted` antes da letra existir; depende do worker estar no ar (incluindo `PREVIEW_AI=lyrics`).
- **Scope**: API, worker, contracts, admin recovery, preview.
- **Date**: 2026-09-11
- **Status**: active

### AD-014

- **Decision**: Contato do comprador vive em `order_contacts`. `story_sessions.data` guarda só briefing criativo. Catálogo, enum e contrato aceitam somente `custom_song`. Sem aliases Drizzle (`storySessions` / `lyricVersions` / `storedFiles`). Job de aviso é `deliver_notify`. Ponteiros de arquivo usam `file_id`.
- **Reason**: Contato e aceites fora do JSONB enviado à IA; briefing ainda pode conter dados pessoais; um produto vivo; schema sem tabelas, enums ou nomes mortos.
- **Scope**: contratos, domínio, API, worker, web, seed, migrations `0010` e `0011`.
- **Date**: 2026-09-12
- **Status**: active

## Handoff anterior — substituído pela remediação abaixo

- **Feature**: Greenfield cleanup.
- **Phase / Task**: Um produto, um enum, nomes de arquivo/job alinhados ao schema vivo.
- **Docs (2026-09-12)**: Spec em `.specs/features/greenfield-cleanup/`. Architecture, product, STATE e CI Postgres 18 atualizados. Sem deploy.
- **Completed**:
  - Contato em `order_contacts`; briefing criativo em `story_sessions.data`.
  - Enum, contrato e catálogo só `custom_song` (migration `0011`).
  - Job de aviso `deliver_notify`; colunas `file_id` / `reference_file_id` / `cover_file_id`.
  - Pacote `@resenha/config` removido; CI `postgres:18-alpine`.
- **Next step**:
  - Revisar o working tree e abrir PR quando quiser; sem deploy nesta fatia.
  - Aplicar `0011` em preview/produção antes de publicar.
  - Volume local continua Postgres 16: deixe como está. `docker compose down -v` só se for alinhar a 18 e aceitar perder o dado local.
  - No worker Railway, garantir `OPENROUTER_TEXT_MODEL` (obrigatório em produção) — sem deploy nesta fatia.
  - Definir se em produção o `AUDIO_REVIEW_MODE` será `automatic` ou `manual`.
  - Realizar teste final de compra com PIX real quando as credenciais de produção do AbacatePay forem ativadas.

## Remediação independente (2026-09-12)

### AD-015

- **Decision**: Pagamento usa porta genérica e tentativa persistida antes da rede. Estado financeiro pertence a payments; liquidação única confere provider/ID/referência/centavos/BRL. Unknown impede novo POST; refunds não são ignorados nem regressivos.
- **Reason**: Trocar gateway não deve remodelar o pedido nem duplicar dinheiro quando a rede é incerta. AbacatePay é um adapter, não escolha final obrigatória.
- **Scope**: domínio, providers, database/payment-settlement, API/webhook e reconciliação periódica do worker.
- **Status**: active

### AD-016

- **Decision**: Uma produção fixa uma versão imutável da letra. Tentativas de áudio/arquivos são históricas, com seleção explícita por variante. Cada produção tem aviso de entrega próprio; um link estável por pedido aponta a produção liberada vigente.
- **Reason**: Falha parcial, edição administrativa ou regeneração não pode misturar letras, apagar histórico nem impedir aviso da revisão.
- **Scope**: productions, audio_generations, deliveries, email_deliveries, API e worker.
- **Status**: active

### AD-017

- **Decision**: Jobs usam lease renovável e fencing. ai_calls é persistida antes da rede; resultado desconhecido exige conferência explícita. ai_usage distingue custo informado/estimado/desconhecido. É permitido completar um custo antes desconhecido mediante observação da mesma chamada e evento; valor já conhecido nunca é reprecificado.
- **Reason**: Uma queda não prova que a chamada foi gratuita, e o retorno tardio não autoriza o worker antigo a publicar artefatos.
- **Scope**: fila, providers, worker, custos e recuperação administrativa.
- **Status**: active

### AD-018

- **Decision**: Aceites são evidência versionada/datada em order_consents. Leitura sem evidência permanece desconhecida. FullLyrics é o texto canônico; se uma edição divergir da estrutura gerada, seções antigas são removidas. A saída IA mantém validação estrutural própria.
- **Reason**: Não fabricar consentimento nem manter duas versões contraditórias da letra. Criatividade pode conter dados pessoais; contato de cobrança/entrega não vai ao modelo.
- **Scope**: contratos, domínio, API, UI e migrations.
- **Status**: active

### AD-019

- **Decision**: Revisão manual é o padrão. automatic_release exige opt-in e só valida arquivo decodificável com duração mínima técnica; não simula avaliação artística automática.
- **Reason**: Arquivo válido não garante uma música aceitável ou fiel à letra.
- **Scope**: configuração, worker, admin e operação comercial.
- **Status**: active

## Encerramento da remediação local (antes da ativação externa)

- **Feature**: audit-remediation. Implementação e validação locais concluídas em 12/09/2026; [parecer independente](features/audit-remediation/validation.md): PASS local. Não publicado.
- **Preservação**: WIP anterior preservado; snapshot externo ao repo antes das mudanças. Sem commit, push, PR, deploy ou chamada paga nesta execução.
- **Banco da implementação**: PostgreSQL 18 isolado na porta 5444, com bancos separados por frente. O PostgreSQL 16 da porta 5433 e seus dados não foram migrados.
- **Git reconfirmado no encerramento**: main e origin/main em `62b571ec251e52009383f0c6aa36d88b882468c8`; código novo estava local e não publicado.
- **CI observado**: run 34573614874 de `62b571e` passou. Esse CI não cobre este WIP nem as migrations novas.
- **Railway observado**: projeto `musica`; web em `62b571e`, API/worker em `3b9ef69`. `/products` ainda expunha quatro produtos. Journal/schema remoto não foi lido (SSH sem chave registrada); não está comprovado que 0011 ou migrations posteriores estejam aplicadas.
- **Configuração remota observada**: EMAIL_FROM existe no worker; OPENROUTER_TEXT_MODEL faltava. Não foi validado envio real por esta revisão. Valores secretos não foram registrados.
- **Pendente fora da execução local**: promoção coerente com worker antigo parado; preço e políticas reais; decisão de gateway/revisão; PIX de produção; e-mail recebido da revisão publicada; backup/restore real dos objetos.

### Evidências do encerramento local

- `pnpm check` em Node 22.22.2/PostgreSQL 18.6: format, lint, typecheck, 430 testes Vitest sem skips, um teste operacional e build PASS. Playwright: 48/48; responses controladas, sem providers reais.
- Docker: web/API/worker construídos em linux/arm64, processos sem root; FFmpeg/FFprobe presentes no worker. Não é prova de imagem AMD64 ou Railway.
- Migrations `0000`–`0014`: instalação limpa e upgrade têm o mesmo catálogo, 15 entradas no journal; snapshots e constraints reais conferidos. 30 invariantes negativas e dois cenários positivos permanecem na suíte do banco.
- Verificação independente: sete mutações financeiras detectadas, controle intacto; revisões de produção, posse de jobs, custos desconhecidos e consentimentos confrontados com assertions.
- Restore conjunto sintético: PostgreSQL + dois objetos restaurados; bytes/hashes, acesso privado, Range e revogação comprovados via API isolada. Não foi restaurado o bucket Railway.
- Documentos e mapas antigos têm indicação de histórico. Rotas admin foram divididas por assunto; worker e providers têm módulos próprios sem nova infraestrutura.

## Ativação externa autorizada em 12/09/2026

### AD-020

- **Decision**: Ambiente de pagamento é explícito e persistido: live, sandbox ou local. NODE_ENV continua controlando segurança do servidor. Checkout sandbox real exige sessão admin e capability do pedido; receita comercial inclui apenas pagamentos live. Cobranças e eventos têm namespace por ambiente. Histórico sem prova permanece NULL e bloqueia reconciliação automática, sem inventar procedência.
- **Reason**: Homologar no Railway não pode aceitar dinheiro fictício como receita, desativar cookies seguros nem reinterpretar pagamentos antigos ao trocar a chave.
- **Scope**: domínio, schema/migrations 0015–0016, gateway, checkout, webhook, worker e relatórios administrativos.
- **Status**: active

- **Execução atual**: [external-activation](features/external-activation/spec.md); [evidências externas](features/external-activation/validation.md). Homologação técnica executada; fechamento de integração na [PR #2](https://github.com/gustavospriebe/music/pull/2).
- **Git/CI**: branch `codex/operational-activation`; WIP original preservado e publicado. SHA `2a7aa597c0f3dddf0e46a9800a593948fce7b2ed` passou nos runs 34703996881/34703998723 (485 Vitest + um operacional, 48 E2E e sensor Docker). Delta final acrescenta diagnóstico seguro do webhook, dois sensores e redação honesta de e-mail; conferir os checks da PR para sua revisão exata.
- **Railway comprovado**: web/API/worker SUCCESS no mesmo SHA `2a7aa597`; PostgreSQL 18.6, journal `0000`–`0016` com 17 hashes iguais ao repo. Catálogo único, preço zero; API antiga e worker antigo drenados antes da migration. API é owner do pre-deploy; CI obrigatório nos três triggers.
- **Pagamento**: sandbox real com admin + capability, checkout hospedado simulado pelo painel. Reconciliação confirmou pagamento; webhook inicial503, dois reenvios reais200, uma única produção. O painel gera identidades distintas no reenvio; repetição do mesmo ID é prova sintética. Webhook antigo removido. `environment=NULL` histórico permanece sem classificação.
- **IA e entrega**: letra, dois áudios (~122/~123 s) e capa; quatro chamadas, US$0,197599 informado, sem custo desconhecido. Revisão manual respeitada. Liberação técnica fictícia; downloads privados e Range verificados. Resend aceitou o primeiro envio, mas o domínio de ADMIN_EMAIL devolveu a mensagem; destinatário corrigido pelo dono e envio operacional pelo container worker confirmado `delivered`, sem alterar login nem apagar histórico.
- **Navegador**: `/api` na mesma origem, Nginx para API interna. História fictícia salva e recarregada com capability preservada, sem geração adicional.
- **Backup**: dump remoto e três objetos reais/6.146.685 bytes restaurados e hashes iguais. API sobre a cópia confirmou entrega, Range e revogação. Nenhum objeto original foi removido. Backup nativo/PITR exige Pro; sem upgrade. Rotina independente com retenção continua pendente.
- **Autorização e limites**: teto US$3 de IA e e-mails de teste cumprido. Sem PIX de produção, aumento de plano ou ativação comercial. Preço, políticas, KYC/escolha final do gateway, PIX real, qualidade artística, retenção e suporte continuam gates do dono. `COMMERCIAL_READY=false` e `AUDIO_REVIEW_MODE=manual`.
