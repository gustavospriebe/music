# UI Remodel Specification

> Registro histórico de um recorte anterior. O modelo vigente e a evidência atual estão em [docs/documentation-map.md](../../../docs/documentation-map.md) e [audit-remediation](../audit-remediation/spec.md). Este registro não autoriza publicação nem gasto com providers.

## Problem Statement

A auditoria em `docs/ui-ux-audit.md` mostra base visual forte (creme, coral, preto, tipografia expressiva, tom brasileiro), mas continuidade quebrada na jornada do cliente, checkout sem confiança suficiente, administração como projeção técnica do backend com PII exposta e menu mobile sem contenção de foco. A remodelagem corrige arquitetura da informação, confiança, operação, privacidade e acessibilidade sobre os componentes, rotas, estilos e tokens existentes, sem novo frontend, template ou design system.

## Goals

- [ ] Jornada pública coerente em cinco etapas, com CTAs fiéis e recuperação explícita.
- [ ] Checkout com resumo reconhecível, estado do provider antes do clique e bloqueio explícito de lançamento até decisão jurídica/comercial.
- [ ] Cockpit administrativo orientado a exceções, sem métricas derivadas só da primeira página, sem JSON bruto e sem PII desnecessária.
- [ ] Mobile 390×844 sem overflow, menu com contenção de foco, alvos de 44px e navegação completa por teclado.

## Out of Scope

| Feature                                                                      | Reason                                                                                 |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Novo frontend, template ou design system                                     | O pedido exige trabalhar sobre o existente.                                            |
| Player de áudio demo sem mídia real autorizada                               | Não inventar prova de qualidade; reformular com honestidade.                           |
| Políticas jurídicas/comerciais (prazo, suporte, ajustes, reembolso, licença) | Não inventar; registrar como pendentes e manter lançamento bloqueado.                  |
| Chamar OpenRouter, Mercado Pago, Resend ou S3 reais                          | Custo/efeito externo; validação usa fallbacks, dados sintéticos e storage descartável. |
| Reset, clean, stash, commit, push, PR, deploy ou publicação                  | Explicitamente proibidos neste pedido.                                                 |
| Alterar `apps/worker/src/worker.ts` ou invariantes de domínio                | Preservar WIP preexistente; não facilitar a UI mudando regra de negócio.               |
| Declarar CI remoto, provider, homologação ou produção como validados         | Gates distintos exigem evidência própria.                                              |

## Assumptions & Open Questions

| Assumption / decision                    | Chosen default                                                                                                | Rationale                                                                                                    | Confirmed? |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------- |
| Modelo de jornada                        | Cinco etapas únicas: 1 História, 2 Letra, 3 Pagamento, 4 Produção, 5 Entrega                                  | `order-journey.ts` e `ProductionRail` já usam cinco etapas; o "1 de 6" do formulário é o ponto fora da curva | n          |
| Comportamento de filtros admin           | Aplicação explícita via botão "Filtrar" (sem refetch ao digitar)                                              | Elimina a ambiguidade atual (queryKey muda por tecla + `refetch` no submit); um único comportamento testável | n          |
| Confirmação de ações admin               | Confirmação em duas etapas inline (armar + confirmar) com descrição de efeito                                 | Evita modal complexo, é acessível por teclado e testável sem dependência nova                                | n          |
| Disponibilidade de pagamento             | Novo sinal legível na resposta do pedido (`payment.configured`, `payment.devFallback`)                        | A UI precisa conhecer a indisponibilidade antes do clique; aditivo e sem mudar invariante                    | n          |
| Agregados admin                          | Novo `GET /api/v1/admin/overview` com totais via SQL, sem carregar todos os pedidos                           | Corrige "receita dos primeiros 30" sem paginar tudo no cliente                                               | n          |
| Total da listagem                        | `GET /api/v1/admin/orders` passa a devolver `total` e `pageSize: 30` junto de `items` e `page`                | Aditivo e retrocompatível; habilita paginação real                                                           | n          |
| Subagentes                               | Execução inline no agente principal, sem delegar implementação                                                | O pedido exige integração final no agente principal e `AGENTS.md` não define política de delegação           | n          |
| Skills `product-design` e `react-doctor` | Não disponíveis no harness; aplicar seus objetivos manualmente (hierarquia, foco, contraste, validação React) | Não inventar execução de skill ausente; registrar a ausência no relatório                                    | n          |

**Open questions:** none — decisões jurídicas/comerciais pendentes são registradas como bloqueio de lançamento, não como perguntas desta spec.

## User Stories

### P1: Jornada do cliente em cinco etapas ⭐ MVP

**User Story**: Como cliente, quero percorrer história → letra → pagamento → produção → entrega com progresso único e CTAs fiéis, para saber onde estou e o que acontece a seguir.

**Why P1**: A contradição "1 de 6" versus "2 de 5" e o duplo "gerar" quebram a confiança no funil.

**Acceptance Criteria**:

1. WHEN o cliente abrir `/criar`, `/criar/letra` ou `/criar/checkout` THEN o sistema SHALL exibir "Etapa N de 5" com N igual a 1, 2 ou 3 respectivamente e nomes História, Letra e Pagamento.
2. WHEN o cliente enviar o formulário de história THEN o sistema SHALL usar o rótulo "Salvar história e continuar" e navegar para a etapa de letra sem afirmar que a letra já foi gerada.
3. WHEN o pedido estiver em `story_completed` sem letra THEN o sistema SHALL exibir preparação com o que será gerado, tempo esperado aproximado, persistência após fechar a página e como recuperar pelo link da página do pedido.
4. WHEN a letra existir em `lyrics_ready` THEN o sistema SHALL preservar edição, salvamento como nova versão histórica e aprovação antes do pagamento.
5. IF o pedido estiver em estado que não aceita revisão THEN o sistema SHALL exibir erro legível sem oferecer geração, edição ou aprovação.
6. WHILE a letra estiver em `lyrics_generating` THEN o sistema SHALL anunciar progresso via `role="status"` e retomar por polling sem exigir novo clique.

**Independent Test**: Criar história sintética, atravessar as três primeiras etapas e confirmar rótulos "Etapa N de 5", CTA fiel e tela de preparação informativa.

### P1: Biblioteca, formulário e honestidade da landing ⭐ MVP

**User Story**: Como cliente que volta, quero reconhecer minhas músicas e controlar meu rascunho, para retomar sem depender de identificador técnico.

**Why P1**: Cartões centrados em ID técnico e rascunho invisível geram perda e suporte evitável.

**Acceptance Criteria**:

1. WHEN o cliente abrir `/minhas-musicas` com pedidos THEN o sistema SHALL exibir para cada pedido homenageado/título, ocasião quando disponível, data de criação, progresso e próxima ação, sem usar o identificador técnico como título.
2. WHEN os campos de nome e e-mail forem renderizados THEN o sistema SHALL incluir `autocomplete="name"` e `autocomplete="email"` respectivamente.
3. WHEN o formulário for exibido THEN o sistema SHALL explicar que o rascunho fica salvo somente neste navegador/dispositivo e oferecer botão "Apagar rascunho" que limpa o storage local sem afetar pedidos já salvos.
4. WHERE não existir mídia demo real e autorizada THEN o sistema SHALL exibir bloco honesto sem `<audio>`, sem botão de reprodução e sem promessa de prova sonora.
5. The system SHALL manter o progresso do formulário compreensível programaticamente com `role="progressbar"`, `aria-valuemin`, `aria-valuemax` e `aria-valuenow`.

**Independent Test**: Preencher formulário, recarregar, confirmar restauração, apagar rascunho e auditar `/minhas-musicas` e landing sem player inventado.

### P1: Checkout e confiança ⭐ MVP

**User Story**: Como cliente pronto para pagar, quero ver resumo, preço, conteúdo, redirecionamento e estado do provider antes de clicar, para decidir com informação.

**Why P1**: Preço e botão isolados não sustentam decisão de compra nem evitam erro após o clique.

**Acceptance Criteria**:

1. WHEN o cliente abrir o checkout com pedido aprovado THEN o sistema SHALL exibir produto, homenageado/título quando houver letra aprovada, preço em BRL, conteúdo do pacote e próxima etapa.
2. WHEN o checkout for exibido THEN o sistema SHALL explicar que o pagamento continua em redirecionamento ao Mercado Pago.
3. WHEN o provider não estiver configurado e não houver fallback dev THEN o sistema SHALL exibir indisponibilidade antes do clique e manter o botão desabilitado com motivo acessível.
4. WHEN prazo, suporte, ajustes ou reembolso não estiverem aprovados THEN o sistema SHALL exibir seção "A definir antes do lançamento" e manter o bloqueio de lançamento explícito sem inventar política.
5. IF o checkout falhar THEN o sistema SHALL anunciar o erro via `role="alert"` sem navegar nem duplicar pagamento.

**Independent Test**: Abrir checkout com e sem provider configurado; confirmar resumo, aviso de redirecionamento, estado desabilitado motivado e seção de pendências.

### P1: Cockpit administrativo ⭐ MVP

**User Story**: Como operador, quero um shell persistente com alertas primeiro, status em português e detalhe legível, para decidir em segundos sem traduzir o backend.

**Why P1**: Eventos em inglês, JSON bruto, PII exposta e métricas da primeira página aumentam tempo de decisão e risco operacional.

**Acceptance Criteria**:

1. WHEN o operador navegar entre `/admin`, `/admin/pedidos` e `/admin/pedidos/:orderId` THEN o sistema SHALL manter shell persistente com navegação Visão geral e Pedidos, contexto operacional e saída.
2. WHEN eventos ou status técnicos forem exibidos THEN o sistema SHALL traduzi-los para linguagem operacional em português.
3. WHEN o dashboard carregar THEN o sistema SHALL exibir primeiro alertas e pedidos que exigem ação com a próxima decisão, antes de métricas secundárias.
4. WHEN o dashboard exibir pedidos e receita THEN o sistema SHALL usar agregados do servidor (`GET /api/v1/admin/overview`) e nunca derivar totais apenas dos itens da primeira página.
5. WHEN a lista for consultada THEN o sistema SHALL exibir paginação com página atual, total e estado vazio/erro, usando `total` e `pageSize` da API.
6. WHEN qualquer filtro mudar THEN o sistema SHALL aguardar o botão "Filtrar" para aplicar (sem busca automática por tecla) e recomeçar da página 1.
7. WHEN o detalhe abrir THEN o sistema SHALL exibir seções legíveis em vez de JSON bruto para história, letra, pagamento, custos, fila e áudios.
8. WHEN dados pessoais aparecerem THEN o sistema SHALL mascarar e-mail e minimizar PII, sem exibir IDs internos, tokens, `externalId` ou payloads pessoais desnecessários.
9. WHEN o operador acionar retry, rebuild ou aprovação/entrega THEN o sistema SHALL exigir confirmação em duas etapas com descrição do efeito antes de executar.
10. WHEN ações de áudio forem exibidas THEN o sistema SHALL declarar se afetam uma faixa ou o conjunto das duas versões.

**Independent Test**: Logar como admin sintético, percorrer visão geral, lista paginada com filtros explícitos e detalhe seccionado com confirmações e PII mascarada.

### P1: Mobile e acessibilidade ⭐ MVP

**User Story**: Como usuário de mobile e teclado, quero reflow sem overflow, menu contido e nomes/estados acessíveis, para operar a jornada e o admin sem mouse.

**Why P1**: Foco que escapa do menu e progresso não programático excluem usuários e quebram operação.

**Acceptance Criteria**:

1. WHILE a viewport for 390×844 THEN o sistema SHALL manter `documentElement.scrollWidth` igual a `clientWidth` nas rotas públicas e administrativas auditadas.
2. WHEN o menu mobile abrir THEN o sistema SHALL aplicar contenção de foco (foco preso no menu, fundo com `inert`), e o Tab nunca SHALL alcançar conteúdo coberto.
3. WHEN o usuário pressionar `Escape` com o menu aberto THEN o sistema SHALL fechar o menu e restaurar o foco ao botão do menu.
4. The system SHALL expor nomes acessíveis em navegação, botões e progresso, com semântica `nav`, `main`, `dialog` ou equivalente onde aplicável.
5. The system SHALL manter alvos interativos com pelo menos 44×44 px nas superfícies auditadas.
6. WHEN validação falhar THEN o sistema SHALL associar cada erro ao campo via `aria-describedby`, mover o foco ao primeiro erro e manter foco visível.
7. WHEN a navegação por teclado percorrer a jornada THEN o usuário SHALL concluir sem armadilha de foco e com ordem coerente.

**Independent Test**: Percorrer landing, criação, letra, checkout, minhas-músicas, login admin, dashboard, lista e detalhe a 1280×720 e 390×844 só por teclado, com medição de overflow e foco.

## Edge Cases

- IF o storage local estiver bloqueado THEN o sistema SHALL manter o fluxo com fallback em memória e anunciar que o rascunho não será persistido.
- IF o pedido não existir ou o acesso for inválido THEN o sistema SHALL exibir erro legível com retorno ao início, sem expor dados pessoais.
- IF a letra estiver ausente em `lyrics_ready` THEN o sistema SHALL tratar como estado inconsistente sem oferecer edição.
- IF a entrega estiver parcial (`delivered` sem duas variantes concluídas) THEN o sistema SHALL tratar como inconsistente e não oferecer player.
- IF a API de overview ou lista falhar THEN o dashboard e a lista SHALL exibir erro com nova tentativa, sem métricas inventadas.
- IF `MERCADO_PAGO_ACCESS_TOKEN` estiver ausente em produção THEN o checkout SHALL nascer desabilitado com motivo, sem aguardar o clique.
- WHEN o operador confirmar rebuild THEN o sistema SHALL declarar que ambas as versões serão refeitas do zero a partir da letra aprovada mais recente.

## Implicit-Requirement Dimensions

| Dimension                                | Resolution                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Input validation & bounds                | Filtros admin validados por `adminOrdersQuerySchema`; paginação mínima 1; formulários mantêm Zod atual.          |
| Failure / partial-failure states         | Erros de pedido, letra, checkout, overview e lista têm estado dedicado com `role="alert"` e nova tentativa.      |
| Idempotency / retry / duplicate handling | Criação mantém `creationKey`; checkout reaproveita redirecionamento; retry/rebuild exigem confirmação explícita. |
| Auth boundaries & rate limits            | Rotas admin exigem sessão; detalhe público nunca expõe `story` sem capability; sem mudança de guarda.            |
| Concurrency / ordering                   | Geração de letra mantém claim compare-and-set de 5 minutos; polling só consulta.                                 |
| Data lifecycle / expiry                  | Rascunho local com apagamento explícito; pedidos e capabilities seguem regras atuais.                            |
| Observability                            | Beacons de funil preservados; erros de analytics seguem best-effort sem quebrar a venda.                         |
| External-dependency failure              | Provider ausente vira estado visível antes da ação; overview/listagem degradam sem inventar número.              |
| State-transition integrity               | Nenhuma transição nova; toda mudança passa por `assertTransition`; letra continua histórica e imutável.          |

## Requirement Traceability

| Requirement ID | Story          | Phase      | Status  |
| -------------- | -------------- | ---------- | ------- |
| JOURNEY-01     | P1: Jornada    | T1, T4     | Pending |
| JOURNEY-02     | P1: Jornada    | T4         | Pending |
| JOURNEY-03     | P1: Jornada    | T4         | Pending |
| JOURNEY-04     | P1: Jornada    | T4         | Pending |
| LIB-01         | P1: Biblioteca | T5         | Pending |
| FORM-01        | P1: Biblioteca | T4         | Pending |
| FORM-02        | P1: Biblioteca | T4         | Pending |
| DEMO-01        | P1: Biblioteca | T5         | Pending |
| CHECK-01       | P1: Checkout   | T3, T5     | Pending |
| CHECK-02       | P1: Checkout   | T5         | Pending |
| CHECK-03       | P1: Checkout   | T3, T5     | Pending |
| CHECK-04       | P1: Checkout   | T5         | Pending |
| ADMIN-01       | P1: Cockpit    | T6         | Pending |
| ADMIN-02       | P1: Cockpit    | T2, T6, T7 | Pending |
| ADMIN-03       | P1: Cockpit    | T2, T6     | Pending |
| ADMIN-04       | P1: Cockpit    | T2, T6     | Pending |
| ADMIN-05       | P1: Cockpit    | T2, T7     | Pending |
| ADMIN-06       | P1: Cockpit    | T7         | Pending |
| ADMIN-07       | P1: Cockpit    | T8         | Pending |
| ADMIN-08       | P1: Cockpit    | T2, T8     | Pending |
| ADMIN-09       | P1: Cockpit    | T8         | Pending |
| ADMIN-10       | P1: Cockpit    | T8         | Pending |
| ADMIN-11       | P1: Cockpit    | T8         | Pending |
| A11Y-01        | P1: Mobile     | T9         | Pending |
| A11Y-02        | P1: Mobile     | T1, T9     | Pending |
| A11Y-03        | P1: Mobile     | T1, T9     | Pending |
| A11Y-04        | P1: Mobile     | T1, T9     | Pending |
| A11Y-05        | P1: Mobile     | T9         | Pending |
| A11Y-06        | P1: Mobile     | T4, T9     | Pending |
| A11Y-07        | P1: Mobile     | T9         | Pending |
| GUARD-01       | Todas          | Todas      | Pending |

**Coverage:** 31 total, 31 mapped to tasks, 0 unmapped.

## Success Criteria

- [ ] Jornada pública exibe "Etapa N de 5" consistente, CTA fiel e preparação informativa antes de gerar.
- [ ] Checkout exibe resumo, redirecionamento, estado do provider antes do clique e pendências jurídico-comerciais sem política inventada.
- [ ] Admin opera em shell persistente com alertas primeiro, agregados do servidor, paginação/total, filtros explícitos, seções legíveis, PII mascarada e confirmações com efeito.
- [ ] Mobile 390×844 sem overflow, menu com foco contido, Escape com restauração e jornada completa por teclado.
- [ ] Gates locais, Browser QA nos dois viewports, screenshots inspecionadas, `git diff --check` e validadores TLC passam sem provider real.
