> HISTÓRICO — leitura anterior à remediação de 12/09/2026. Alegações de schema, providers, status e prontidão abaixo podem estar superadas. Este documento não autoriza implementação, gastos ou publicação. Use o [modelo vigente](project-context.md) e sua validação.

# Relatório pós-remodelagem UI/UX — 2026-09-06

Baseline: `docs/ui-ux-audit.md` + `output/product-design/ui-ux-audit-2026-09-06/` (preservados).
Entrega: spec/design/tasks/validação em `.specs/features/ui-remodel/`.
Evidências novas: `output/product-design/ui-remodel-2026-09-06/` (14 PNGs inspecionados).

## O que foi implementado

### Jornada do cliente (5 etapas únicas)

- `JourneySteps` com "Etapa N de 5" + `role="progressbar"` (`aria-valuemin/max/now`) em `/criar` (1), `/criar/letra` (2), `/criar/checkout` (3), `/pedido/:id` (N da jornada) e entrega (5).
- CTA do formulário: "Salvar história e continuar" (antes "Gerar minha letra").
- Tela pré-geração ("Antes de criar a letra"): o que será gerado, tempo aproximado, custo de uma tentativa, persistência após fechar e recuperação pelo mesmo navegador/página do pedido.
- Edição, versionamento histórico e aprovação preservados; `lyrics_generating` com `role="status"` + polling sem novo clique; estados inválidos sem ação quebrada.
- `autocomplete="name"` / `"email"`; rascunho explica "somente neste navegador/aparelho" + botão "Apagar rascunho" (só local, sem afetar pedidos).
- Minhas músicas: título/homenageado, ocasião, data, progresso e próxima ação; sem ID técnico como título.
- Landing sem player falso: bloco honesto "Sem áudio demo automático" + FAQ corrigido. Nenhum `<audio>` demo foi criado.

### Checkout e confiança

- "Resumo do pedido": produto, homenagem/título, preço BRL, conteúdo, próxima etapa.
- Aviso de redirecionamento ao Mercado Pago (só quando o pagamento está disponível).
- `GET /orders/:publicId` expõe `payment: { configured, devFallback }`; botão nasce desabilitado com motivo acessível quando indisponível.
- Erro de checkout via `role="alert"`, sem navegação.
- Seção "A definir antes do lançamento" (prazo, suporte, ajustes, reembolso); nenhuma política inventada; lançamento segue bloqueado.

### Administração

- `AdminShell` persistente (Visão geral / Pedidos, contexto, sair) nas 3 rotas.
- `GET /admin/overview` agregado via SQL (totais + atenção); dashboard usa totais do servidor, nunca só a primeira página.
- `GET /admin/orders` com `total` + `pageSize: 30`; lista com paginação, total, estado vazio/erro e aplicação explícita no botão "Filtrar" (digitar não dispara busca).
- Linhas com status em português, idade e próxima ação; sem ID interno como chave visual.
- Funil com eventos em português.
- Detalhe seccionado (história operacional, letra, pagamento, custos, fila, áudios); sem `JSON.stringify`; e-mail mascarado (`a•••@dominio`); sem IDs internos, tokens, `externalId` ou payloads desnecessários.
- `ConfirmAction` (armar + confirmar) com efeito descrito para retry (só o job), rebuild (conjunto das duas versões, do zero) e aprovação por faixa (marca o pedido inteiro como entregue).

### Mobile e acessibilidade

- 390×844 sem overflow nas rotas auditadas (E2E mede `scrollWidth == clientWidth` em `/`, `/criar`, checkout e minhas-músicas).
- Menu mobile como `dialog` modal: `inert` + `aria-hidden` no fundo, ciclo Tab/Shift+Tab, `Escape` fecha e restaura foco ao botão.
- Semântica `nav`/`ul`/`li` no admin; nomes acessíveis; erros com `aria-describedby` + foco no primeiro; foco visível preservado; alvos ≥44px.

## Arquivos modificados (feature)

- `apps/web/src/components.tsx` (+ `JourneySteps`, menu contido)
- `apps/web/src/pages/public.tsx` (jornada, checkout, biblioteca)
- `apps/web/src/pages/landing.tsx` (demo honesto)
- `apps/web/src/types.ts` (`payment?` aditivo) + `apps/web/src/api.ts` (`adminOverview`, `total/pageSize`)
- `apps/web/src/styles.css` (tokens existentes; shell, alertas, resumo, filtros, menu)
- `apps/web/src/admin/labels.ts` (novo), `apps/web/src/admin/shell.tsx` (novo), `apps/web/src/admin/routes.tsx` (cockpit)
- `apps/api/src/app.ts` (`payment` aditivo, `overview`, `total/pageSize`)
- Testes: `apps/web/src/components.test.tsx`, `apps/web/src/public-form.test.tsx`, `apps/web/src/pages/checkout.test.tsx` (novo), `apps/web/src/admin/routes.test.tsx` (novo), `apps/api/src/flow.test.ts`, `apps/web/e2e/{mvp-flows,mvp-operable-t5,mvp-operable-t6,mvp-operable-t7,p2-cover}.spec.ts`, `apps/web/e2e/ui-remodel-qa.spec.ts` (novo, 5 testes)

Não tocados pela feature: `apps/worker/src/worker.ts` (diff preexistente preservado), invariantes de domínio, contratos quebrados.

## Resultados exatos dos testes

- `git diff --check`: PASS.
- `pnpm format:check`: PASS.
- `pnpm lint`: PASS (8 tasks).
- `pnpm typecheck`: PASS (8 tasks).
- `pnpm exec turbo run test --concurrency=1 --force` (bancos `resenha`/`resenha_test` locais, 2026-09-06): PASS, 12 tasks — web 63, api 38, worker 20, contracts 8, domain 7, providers 3 (total 139).
- `pnpm build`: PASS (8 tasks).
- `pnpm test:e2e`: PASS, 37/37 (7 arquivos: landing, mvp-flows, t5, t6, t7, p2-cover, ui-remodel-qa com 5 testes).
- `react-doctor apps/web`: 84/100, 4 warnings restantes (login `onSuccess` sem invalidação — navegação, sem dado; complexidade AdminDashboard/AdminOrders/Checkout — decomposição adiada conscientemente).
- TLC: `validate_spec.py` 0/0; `validate_tasks.py` 0 errors, 2 warnings (`Tests: none` em T10/T11, matriz diz `none`).
- Verificação independente (2ª passada): 25/31 ACs com evidência valor-exata; 6 residuais parciais (1–2 assertions cada, sem buraco de comportamento); sensor 3/3 killed. Detalhe em `.specs/features/ui-remodel/validation.md`.
- Browser QA: 5/5 PASS em 1280×720 e 390×844; 14 screenshots novas inspecionadas.

## Problemas encontrados e corrigidos

1. Menu `dialog` invisível no E2E: wrapper `div` herdava `display:none` do `nav` no mobile. Correção: `.menu-dialog { display: contents }` + painel absoluto no wrapper.
2. Duplicidade visual "Falhou · há 0 min" + coluna repetida: removida a 4ª coluna; "agora mesmo" para <1 min.
3. Filtros admin disparavam por tecla (queryKey com valores digitados): key e consulta usam só valores confirmados no submit.
4. `typecheck` API no `count` paginado: usado `countRow?.count ?? 0`.
5. Teste cockpit assumia banco vazio: comparado com contagem SQL real.
6. react-doctor: 8→4 warnings (button type, `ul`/`nav` semânticos, loop duplo de áudios extraído para `completedAudio`).

## Adendo 2026-09-06 — remoção do bloco "Key OpenRouter" do dashboard

A pedido do dono: o painel admin não exibe mais uso, limite ou restantes da key OpenRouter (`GET /key`), mesmo quando a key não tem limite configurado. Removidos `fetchOpenRouterKeyUsage` e o campo `key` de `GET /api/v1/admin/ai-usage/summary`; o custo rastreado real (`ai_usage`: mês, chamadas, letra/áudio, bloqueios) permanece. Nenhum outro comportamento mudou; gates re-rodados após a remoção (ver seção acima).

## Decisões jurídicas/comerciais bloqueadas

Prazo de produção, suporte, ajustes, reembolso e licença final seguem sem aprovação. O checkout exibe "A definir antes do lançamento" e o lançamento comercial permanece bloqueado. Nada foi inventado.

## Separação de gates

- Local (validado aqui): format, lint, typecheck, 139 testes serializados (`--force`), build, 37 E2E, Browser QA desktop/mobile, screenshots, `git diff --check`, validadores TLC, react-doctor.
- CI remoto: não observado (sem commit/push autorizados).
- Providers (OpenRouter/Mercado Pago/Resend/S3): não chamados; fallbacks e mocks apenas.
- Railway/homologação/produção: nenhuma ação; seguem gates distintos.
- UAT humana: não executada.

## Pergunta objetiva (sem bloqueio da entrega)

Nenhuma decisão de domínio foi necessária. Se a operação quiser, o próximo passo sugerido é decidir os textos reais de prazo/suporte/ajustes/reembolso com jurídico/comercial — sem isso, o lançamento segue bloqueado por desenho.
