# Especificação completa do MVP "Música da Resenha" — Fase 2 (aderência total)

> Documento histórico congelado em 2026-08-02. Menções a providers mock/fake descrevem a meta original e não o comportamento atual. Consulte `README.md`, `ARCHITECTURE.md` e `docs/provider-setup.md`: o modo fake foi removido; testes usam adapters controlados por injeção.

Este documento foi a fonte de verdade de requisitos, arquitetura e Definition of Done para a Fase 2.
Estrutura-o para retomar/refinar o que já existe em /home/gustavo/projects/music tornando-o totalmente aderente.

---

## Veredito da Fase 1 (o que já foi feito em 2026-08-02)

A Fase 1 entregou um MVP fake funcional de ponta a ponta, porém com desvios de aderência:

- Monorepo Turborepo + pnpm + TS strict: OK
- apps/api, apps/web, apps/worker + packages/contracts, database, domain: OK
- Fastify + Zod + Drizzle + PostgreSQL + worker com fila Postgres (FOR UPDATE SKIP LOCKED): OK
- Providers mock + adapters reais por env: OK
- Estados via assertTransition, checkout fake idempotente, analytics, admin auth (Argon2): OK
- Preços em centavos: OK

DIVERGÊNCIAS A CORRIGIR na Fase 2:

1. Nomenclatura de tabelas: o prompt exige story_sessions, leads, lyric_versions, order_items, deliveries, stored_files, payment_webhook_events. O código usa story_submissions, audio_generations, stored_assets, etc. Fazer o de-para mantendo comportamento.
2. Frontend: o prompt exige React Router + React Hook Form + TanStack Query + Tailwind + MSW + Sonner + Lucide. O main.tsx atual é SPA simples (~862 linhas). Reestruturar nas rotas exigidas.
3. Testes: o prompt exige suíte completa (unit, API fastify.inject, frontend MSW, 4 fluxos E2E Playwright). Hoje só há 5 arquivos de teste.
4. Dockerfiles de produção (API, worker, web) multi-stage: não existem.
5. Estrutura packages/providers, config, eslint-config, typescript-config: não existem separadamente.
6. Comando pnpm admin:create, GitHub Actions completos, docs ARCHITECTURE.md e IMPLEMENTATION_PLAN.md renomeados.
7. Validar pnpm check (format, lint, typecheck, test, build) passando.

---

## O PROMPT COMPLETO (35 seções) — fonte de verdade

(O conteúdo integral foi preservado; a seguir está o que orienta a Fase 2. Ao receber, o Codex deve ler
os arquivos existentes, aplicar o de-para e atingir TODOS os critérios de aceite seção 34.)

### 1. Produto

Microproduto "Música da Resenha": formulário sobre amigo/grupo/ocasião -> IA gera letra personalizada,
direção musical, duas versões de música completa, página privada para ouvir/baixar.
Brasil, PT-BR, mobile-first, foco em resenha/amigos (aniversário, homenagem, despedida, viagem, churrasco,
time amador, pelada, equipe, atlética, grupo de amigos). Arquitetura extensível a novas verticais, mas MVP
implementa só a vertical de amigos/resenha.

### 2. Princípios

Modular monolith; simples/pragmático; funções sobre OO; adapters para dependências externas; regra de
negócio independente de providers; tipagem estrita; validação de entradas; contratos compartilhados;
DB fonte de verdade; operações assíncronas duráveis; webhooks idempotentes; código legível; sem complexidade
desnecessária; sem microserviço; sem K8s; sem Redis; sem dependência obrigatória de único fornecedor de IA;
sem segredo versionado; sem integração fictícia fingindo ser real. Nomes em inglês; UI em PT-BR; comentários
explicam decisões. Sem `any` (preferir unknown+validação).

### 3. Stack

Turborepo, pnpm workspaces, TS strict, Node Active LTS, Corepack, ESLint, Prettier, Vitest, GitHub Actions.
Frontend: React, Vite, TS, React Router, React Hook Form, Zod, @hookform/resolvers, TanStack Query, Tailwind,
componentes acessíveis, Lucide, Sonner, Vitest, RTL, MSW, Playwright. Sem Redux/Zustand sem necessidade.
Backend: Node, Fastify, TS, Zod, fastify-type-provider-zod, @fastify/swagger(+ui), PostgreSQL, Drizzle,
Drizzle Kit, Pino, Mercado Pago, Resend, OpenRouter, storage local dev / S3 prod, Vitest, fastify.inject.
Worker Node separado; fila PostgreSQL (FOR UPDATE SKIP LOCKED); suportar retries, backoff, max attempts,
scheduled, timeout, locking, recovery de locks abandonados, prioridade, idempotência, registro de erro,
dead-letter, graceful shutdown.

### 4. Estrutura do repo

apps/{web,api,worker}, packages/{contracts,database,domain,providers,config,eslint-config,typescript-config},
docker, docs, scripts, .github/workflows, AGENTS.md, README.md, ARCHITECTURE.md, IMPLEMENTATION_PLAN.md,
docker-compose.yml, package.json, pnpm-workspace.yaml, turbo.json.
Responsabilidades: web=landing/form/revisão/checkout/acompanhamento/entrega/admin; api=rotas HTTP/auth
admin/contratos públicos/regras de aplicação/webhooks/OpenAPI/health; worker=geração/arquivos/e-mails/retries;
contracts=schemas Zod/DTOs/enums/tipos; database=conexão/schema Diesel/migrations/seeds/helpers;
domain=regras de negócio/transições/preços/validações/casos de uso independentes; providers=adapters.

### 5. Identidade visual

Produto brasileiro de presente/entretenimento, não tool corporativa. Evitar dashboard genérico, gradientes de
IA em excesso, robôs, cérebros, linguagem técnica, destaque ao nome do modelo. Diversão, calor, energia,
emoção, mobile-first, adequado a anúncios. Brand tokens centralizados (nome, logo textual, cores, telefone,
e-mail, redes, domínio, prazo, preço, textos). Responsivo e acessível (teclado, labels, foco, contraste,
erros claros, aria-live, loading/skeletons/empty/falha recuperável).

### 6. Rotas front

/, /criar, /criar/historia, /criar/letra, /criar/checkout, /pedido/:publicOrderId, /entrega/:deliveryToken,
/privacidade, /termos, /admin/login, /admin, /admin/pedidos, /admin/pedidos/:orderId. Code-splitting na área
admin. Páginas 404, erro inesperado, serviço indisponível.

### 7. Landing

Hero+CTA, processo 3 etapas, exemplos, benefícios, como funciona, o que recebe, depoimentos (marcados como
demo se não reais), preço, garantia/política de ajustes, FAQ, CTA final, rodapé com legais. Sem inventar
números/avaliações/depoimentos reais. Sem mídia protegida. Cards de áudio demo identificados.

### 8. Formulário adaptativo

Etapas mobile com progresso, autosave (debounce+indicador salvando/salvo/erro), voltar, validação, resumo,
recuperação pós-reload. 6 etapas: Ocasião, Personalidade, Histórias, Humor/limites (zoeira leve/média/pesada
sem ofensivo), Música (gênero/clima/velocidade/voz/estilo), Contato (nome/e-mail/WhatsApp opcional/privacidade

- consentimento marketing opcional). Proibições: imitar artista/pessoa real, música protegida, hate speech,
  ameaça, exposição, acusação, sexualização de menor, ilegal. Persistência progressiva na API. Token opaco.
  Debounce autosave. Não expor IDs internos.

### 9. Geração da letra

TextGenerationProvider { generateLyrics, createMusicDirection }. OpenRouter + Mock. Provider por env.
Resposta estruturada validada com Zod (title, language pt-BR, tone, summary, pronunciationNotes,
mustInclude, safetyWarnings, sections intro/verse/pre_chorus/chorus/bridge/outro). Usar info fornecida,
respeitar assuntos proibidos, não inventar, sem acusações, refrão memorável, ~2min, gênero/tom. Validações
determinísticas pós-geração (nome presente, história presente, refrão, seções, tamanho, sem proibido, sem
vazio, sem recusa). 2a tentativa com feedback. Limite por sessão/IP/janela configurável. Registrar consumo/
latência sem segredos.

### 10. Revisão da letra

Mostrar título, seções, direção musical, pronúncia, avisos. Editar versos, mudar título, regenerar, aprovar,
voltar. Versionar tudo, nunca sobrescrever. Aprovar -> marca aprovada + gera direção estruturada + bloqueia
alteração silenciosa + vai pro checkout. Letra aprovada = exatamente a usada na música.

### 11. Catálogo e preços

Catálogo server-side, nunca aceitar preço do front. Música da Resenha R$49,90 (letra, 2 versões, página
privada, reprodução, download, 1 regeneração). Adicionais: entrega prioritária R$9,90; 2º gênero R$14,90.
Todo valor em centavos inteiros. Subtotal/adicionais/desconto/total/BRL/snapshot no pedido. Preço configurável
num único lugar. Mudança de preço não afeta pedidos antigos.

### 12. Pagamento

PaymentProvider { createCheckout, verifyWebhook, getPayment }. MercadoPago + Mock. Usar SDK/API oficial
vigente; pesquisar docs oficiais; não inventar endpoint/header/assinatura/campos/estados/checkout. Checkout Pro
ou fluxo simples Pix+cartão sandbox. Fluxo: criar pedido interno -> preço no backend -> preferência externa ->
salvar IDs -> redirecionar -> webhooks -> validar autenticidade -> consultar pagamento -> atualizar idempotente
-> iniciar geração só após confirmação. Não confiar só em retorno do browser. Webhook rápido, delega pesado p/
jobs. Armazenar cada evento de webhook com provider/externalId/payload sanitizado/datas/resultado/erro.
Constraint de unicidade. Mock permite concluir sem serviços externos. Nunca cobrança real automática.

### 13. Geração musical

MusicGenerationProvider { generateSong }. OpenRouter + Mock. Modelo por env, domínio não acoplado a Lyria.
Antes de implementar: consultar docs oficiais OpenRouter, verificar contrato de áudio, formato entrada/saída,
síncrono/assíncrono, como arquivos/URLs retornados, limites/erros/timeouts, não deduzir de APIs de texto.
Se não houver credenciais, implementar integralmente conforme docs e validar via mock. Direção musical com:
idioma, gênero, subgênero, clima, BPM, tonalidade opcional, instrumentação, voz, pronúncia, estrutura,
intensidade, encerramento, letra aprovada. Sem imitar artistas. Após pagamento: criar job durável, priorizar
entrega prioritária, gerar 2 versões, salvar cada tentativa (provider, model, prompt, versão letra, latência,
custo, resposta sanitizada, status, erro), download, storage, marcar aguardando revisão, não entregar
automático por padrão (AUTO_DELIVER_GENERATED_AUDIO=false). Arquivos: original, MP3 quando viável, metadata,
tamanho, duração, checksum, content type; FFmpeg no worker se conversão.

### 14. Storage

FileStorageProvider { upload, createSignedDownloadUrl, delete }. Local + S3. Dev: pasta ignorada + rota
protegida, sem expor diretórios. Prod: bucket privado, URLs assinadas com expiração, sem expor credenciais.

### 15. Entrega

Após aprovação do admin: selecionar versões aprovadas, gerar token de entrega, página privada, enfileirar
e-mail, registrar data, marcar DELIVERED. Página: ouvir, ver letra/título, baixar, copiar link, compartilhar
WhatsApp, suporte. Token aleatório sem dados pessoais, armazenado seguro, revogável, expiração configurável.

### 16. E-mail

EmailProvider { sendOrderConfirmation, sendDelivery, sendAdminFailureAlert }. Resend + Console. Templates:
recebido, pago, em produção, disponível, falha. Envio no worker. Falhas retentadas sem regenerar/duplicar.

### 17. Estados e regras

Sessão: DRAFT, LEAD_CAPTURED, LYRICS_GENERATING, LYRICS_READY, LYRICS_APPROVED, CHECKOUT_PENDING, CONVERTED,
ABANDONED. Pedido: PENDING_PAYMENT, PAID, AUDIO_QUEUED, AUDIO_GENERATING, NEEDS_REVIEW, READY_FOR_DELIVERY,
DELIVERED, FAILED, REFUNDED, CANCELED. Pagamento: PENDING, APPROVED, REJECTED, CANCELED, REFUNDED,
CHARGED_BACK, UNKNOWN. Geração: PENDING, PROCESSING, COMPLETED, FAILED, REJECTED, APPROVED. Funções puras de
transição. Proibições: áudio antes de pagar; pagar sem letra aprovada; entregar áudio não aprovado com
AUTO_DELIVER off; alterar letra após geração; aprovar geração falha; processar webhook 2x; preço do cliente.

### 18. Modelo de dados

Migrations reais p/ tabelas: admins, admin_sessions, leads, story_sessions, story_session_events,
lyric_versions, orders, order_items, payments, payment_webhook_events, generation_jobs, audio_generations,
stored_files, deliveries, revision_requests, analytics_events, audit_events. Campos conforme prompt seção 18
(story_sessions com public_id, access_token_hash, lead_id, occasion, form_schema_version, answers JSONB, utm,
status, dates; lyric_versions com structured_lyrics JSONB, raw_model_output, model, prompt_version,
is_approved; orders com approved_lyric_version_id, catalog_snapshot, subtotal/discount/total, priority;
payments com external ids + provider_payload sanitizado; generation_jobs com priority/attempts/max_attempts/
available_at/locked_at/locked_by/last_error; audio_generations detalhado; stored_files; analytics_events com
utm fields). Índices p/ public ids, status, jobs disponíveis, external payment ids, webhook event ids, order
id, session id, created_at, delivery tokens. Unicidade quando necessário.

### 19. API

Prefixo /api/v1. Health /health/live e /health/ready. Endpoints conforme seção 19 completos (story-sessions
CRUD+answers+lyrics+approve, catalog, orders, checkout, webhooks/mercado-pago, deliveries/:token, issues,
analytics/events, admin auth/dashboard/orders/regenerate/deliver/cancel/audio approve-reject/jobs/retry).
Todos com schema Zod + response schema + status correto + erros padronizados + OpenAPI + testes.
Formato de erro: { error: { code, message, details?, requestId } }.

### 20. Autenticação admin

Só admin, sem contas de cliente. E-mail+senha Hash Argon2id, sessão persistida, cookie HttpOnly, Secure em
prod, SameSite, expiração, logout, rate limit login, seed por comando, auditoria. Sem senha padrão no repo.
Comando pnpm admin:create.

### 21. Painel administrativo

Dashboard com métricas (sessões, letras, checkouts, pagamentos, aguardando geração/revisão, entregues,
falhas, receita, ticket médio, conversão). Lista pedidos com filtros. Detalhe com comprador/ocasião/respostas/
letra/direção/itens/pagamento/timeline/jobs/tentativas/players/logs/ações (ouvir/aprovar/rejeitar/regenerar/
entregar/reenviar e-mail/cancelar/nota). Destrutivas com confirmação.

### 22. Analytics

First-party. Eventos mínimos da seção 22 (landing_viewed ... refund_requested). Capture anonymous_id,
session_id, order_id, UTM fields, referrer, device hints, timestamp. Meta Pixel/GA opcionais condicionados a
consentimento, por env, não bloquear app.

### 23. Segurança e privacidade

Helmet, CORS restrito, rate limiting, request IDs, body size limits, schemas, sanitização de nomes, path
traversal, cookies seguros, Argon2id, tokens randômicos, URLs assinadas, logs sem segredos, payload sanitizado,
IDOR, controle admin, headers, tratamento de erro seguro, timeout externo, retries, graceful shutdown, validação
webook, limites de geração. Nunca logar senhas/tokens/keys/cookies/cartão. Páginas privacidade/termos com
marcação p/ revisão jurídica. Função/script de anonimizar/excluir dados de sessão.

### 24. Observabilidade

Pino logs estruturados com request/job/order/session/provider/operation/duration/status. Não expor histórias/
letras em logs comuns. Métricas internas via DB+dashboard. Sentry opcional.

### 25. Ambiente local

docker-compose com PostgreSQL (+Mailpit opcional). Providers mock sem contas externas. corepack enable;
pnpm install; docker compose up -d; pnpm db:migrate; pnpm db:seed; pnpm dev (web+api+worker). .env.example
completo validado com Zod. Variáveis da seção 25. Não compartilhar privadas com Vite.

### 26. Providers mock

Texto determinístico plausível (não lorem ipsum). Pagamento mock: checkout local, página simulada, aprovar/
rejeitar, mesmo fluxo de webhook, testar idempotência. Música mock: arquivos fixture claramente mock, delays/
sucesso/falha/retry/múltiplas versões, cenários controláveis em dev, UI informa que não é real. E-mail mock
para Mailpit.

### 27. Testes

Unit: preço, adicionais, transições, validação letra, direção musical, sanitização, retries, claiming,
idempotência, aprovação/entrega. API (fastify.inject): criação sessão, autosave, geração letra, edição,
aprovação, pedido, checkout mock, confirmação pagamento, webhook duplicado, jobs, auth admin, aprovação áudio,
entrega, acesso inválido, rate limits. Frontend (Vitest+RTL+MSW): validação form, navegação, autosave, erro,
revisão letra, resumo pedido, checkout, dashboard, a11y. E2E (Playwright): fluxo completo sucesso (14 passos),
pagamento duplicado, falha/retry, sessão inválida.

### 28. Qualidade e automação

Scripts raiz: dev, build, lint, lint:fix, typecheck, test, test:watch, test:e2e, check (lint+typecheck+test+
build), db:generate, db:migrate, db:seed, db:studio, admin:create. GitHub Actions com cache pnpm, lint,
typecheck, test, build, e2e, PostgreSQL service, sem credenciais. Coverage com limites sensatos.

### 29. Docker e implantação

Dockerfiles prod API/worker/web multi-stage, não rodar como root, health check. Documentar alternativas
(A: web Vercel/Netlify + API/worker Railway + PG gerenciado + S3; B: tudo em VPS Docker Compose + reverse
proxy + PG isolado + volumes + backups + HTTPS). Não fazer deploy real.

### 30. Documentação

README.md (visão, stack, estrutura, pré-req, instalação, execução, testes, variáveis, providers, migrations,
admin, troubleshooting). ARCHITECTURE.md (componentes, fluxos, worker, estados, segurança, providers, decisões,
trade-offs, Mermaid). IMPLEMENTATION_PLAN.md (etapas/progresso/decisões/limit). AGENTS.md (convenções).
docs/provider-setup.md, docs/production-checklist.md.

### 31. Decisões importantes (requisitos)

1 sem conta; 2 letra antes do pagamento; 3 música só após pagamento confirmado; 4 duas versões; 5 letra
versionada; 6 áudio versionado+histórico; 7 revisão humana default; 8 fila PostgreSQL; 9 Mercado Pago principal;
10 OpenRouter encapsulado/substituível; 11 mock roda tudo local; 12 funil registrado; 13 mobile-first;
14 UI vende resultado não IA; 15 funciona sem Pixel/GA/Sentry/Resend; 16 não prometer prazo que não mede;
17 sem alegação social falsa; 18 nada crítico depende de variável não documentada.

### 32. Fora de escopo MVP

app nativo, assinatura, marketplace, rede social, multi-idioma, compositor humano, edição áudio avançada,
clonagem de voz, imitação de artista, geração vídeo, WhatsApp Business API, afiliados, cupons complexos,
multi-tenant, white-label, K8s, microserviços, Redis, websocket, processamento distribuído. Só pontos de
extensão baratos.

### 33. Ordem de execução

1 plano; 2 monorepo; 3 tooling; 4 PG/Drizzle; 5 contratos/domínio; 6 API; 7 worker/fila; 8 providers mock;
9 frontend público; 10 checkout mock; 11 painel admin; 12 entrega; 13 integrações reais; 14 testes; 15 Docker/
CI; 16 UI no browser; 17 E2E; 18 corrigir; 19 docs. Agentes paralelos sem divergir contratos.

### 34. Critérios de aceite (somente concluído quando TODOS)

Monorepo funcional; pnpm install; docker compose up; migrations; seed; pnpm dev inicia web+api+worker;
formulário salva progressivo; letra mock gerada; letra editável/aprovável; pedido com preço server-side;
checkout mock confirma; webhook idempotente; worker gera 2 músicas mock; admin vê e aprova; entrega gera
página privada; cliente baixa; e-mails processados; analytics registrados; OpenAPI disponível; auth admin
protegida; fluxo completo com teste E2E; lint/typecheck/test/build passam; sem segredo versionado; integrações
reais implementadas ou claramente documentadas se dependerem de credenciais; sem TODOs no caminho crítico;
sem botão principal sem função; sem dados falsos apresentados como reais.

### 35. Entrega final

Relatório: implementado, arquitetura, comandos, URLs locais, credenciais/comando admin, fluxo mock, config
OpenRouter/Mercado Pago/Resend/storage, testes+resultados, limitações reais, itens p/ validação jurídica/
comercial, arquivos mais importantes, próximos passos. Não apresentar como concluído o que não está
implementado.
