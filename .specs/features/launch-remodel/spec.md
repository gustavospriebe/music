# Launch Remodel Specification

## Problem Statement

A criação atual força uma brincadeira entre amigos e um formulário extenso. A revisão confirmou falhas em retry de pagamento, links de entrega, suporte e configuração de providers. Esta entrega amplia o produto e corrige caminhos essenciais para ativação posterior.

## Goals

- [x] Criar músicas com liberdade em uma jornada guiada e responsiva.
- [x] Configurar pagamento, email e condições sem acoplar UX ao gateway.
- [x] Validar dinheiro, entrega, privacidade e aplicação local.

## Out of Scope

| Feature                                          | Reason                                          |
| ------------------------------------------------ | ----------------------------------------------- |
| Commit, push, alteração de visibilidade e deploy | Não autorizados explicitamente.                 |
| Chamada paga ou envio real                       | Chaves e orçamento não autorizados.             |
| Definir preço, licença ou política jurídica      | Usuário decidirá posteriormente.                |
| Implementar gateways futuros desconhecidos       | Adapter depende da escolha e documentação real. |

## Assumptions & Open Questions

| Assumption / decision | Chosen default                                                                  | Rationale                                                     | Confirmed? |
| --------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------- |
| Marca                 | Manter Música da Resenha, ampliar posicionamento                                | Usuário questionou limite do produto, sem escolher novo nome. | n          |
| Produto               | custom_song aditivo                                                             | Preserva pedidos legados e permite criação livre.             | n          |
| Preço                 | Catálogo e snapshot; preço novo opcional; checkout real bloqueado sem condições | Usuário ainda vai definir preço.                              | y          |
| Email                 | Resend e local-log com contrato extensível                                      | Não inventar integrações.                                     | n          |
| Pagamento             | Mercado Pago existente e disabled explícito, adapter extensível                 | Gateway final não escolhido.                                  | y          |
| Execução              | Três subagentes com ownership exclusivo e verificador independente              | Pedido explícito do usuário.                                  | y          |

**Open questions:** none; decisões comerciais permanecem bloqueios de ativação, não da implementação local.

## User Stories

### P1: Criação livre

**User Story**: Como cliente ou operador, quero criação livre para usar a aplicação com confiança.

**Acceptance Criteria**:

1. WHEN uma história custom_song válida for enviada THEN o sistema SHALL persistir brief de 10 a 3000 caracteres, assunto e escolhas musicais sem inventar relações ou fatos.

2. WHEN a letra custom_song interpretar o tema e o brief THEN o sistema SHALL aceitar paráfrase sem exigir cópia literal desses campos; facts opcionais explicitamente fornecidos continuam obrigatórios literalmente.

**Requirement**: CREATE-01

**Independent Test**: Verificar o resultado observável e os casos de erro nos testes de T1, T2, T3.

### P1: Formulário guiado

**User Story**: Como cliente ou operador, quero formulário guiado para usar a aplicação com confiança.

**Acceptance Criteria**:

1. WHEN o cliente abrir a criação THEN o sistema SHALL apresentar quatro passos internos com voltar, validação por passo, resumo editável e restauração de rascunho.

**Requirement**: CREATE-02

**Independent Test**: Verificar o resultado observável e os casos de erro nos testes de T3.

### P1: Controle do rascunho

**User Story**: Como cliente ou operador, quero controle do rascunho para usar a aplicação com confiança.

**Acceptance Criteria**:

1. WHEN o cliente apagar o rascunho THEN o sistema SHALL limpar campos e storage sem restaurar os dados apagados na próxima edição.

**Requirement**: CREATE-03

**Independent Test**: Verificar o resultado observável e os casos de erro nos testes de T3.

### P1: Identidade do produto

**User Story**: Como cliente ou operador, quero identidade do produto para usar a aplicação com confiança.

**Acceptance Criteria**:

1. WHEN o cliente abrir a landing THEN o sistema SHALL oferecer caminhos de amizade, romance, presente, homenagem e ideia livre sem restringir a criação a resenha.

**Requirement**: UX-01

**Independent Test**: Verificar o resultado observável e os casos de erro nos testes de T4.

### P1: Configuração comercial

**User Story**: Como cliente ou operador, quero configuração comercial para usar a aplicação com confiança.

**Acceptance Criteria**:

1. WHEN a configuração pública for consultada THEN o sistema SHALL retornar somente estado comercial e identidade/disponibilidade do pagamento sem segredos.

**Requirement**: PAY-01

**Independent Test**: Verificar o resultado observável e os casos de erro nos testes de T5, T6.

### P1: Preço e lançamento

**User Story**: Como cliente ou operador, quero preço e lançamento para usar a aplicação com confiança.

**Acceptance Criteria**:

1. WHILE preço e condições comerciais não estiverem definidos the system SHALL impedir checkout real e apresentar motivo, preservando preço dos pedidos antigos e permitindo simulação local explícita.

**Requirement**: PAY-02

**Independent Test**: Verificar o resultado observável e os casos de erro nos testes de T2, T5, T6.

### P1: Pagamento repetido

**User Story**: Como cliente ou operador, quero pagamento repetido para usar a aplicação com confiança.

**Acceptance Criteria**:

1. WHEN checkout ou webhook for repetido ou concorrente THEN o sistema SHALL evitar crédito e produção duplicados e permitir retry de processamento falho.

**Requirement**: PAY-03

**Independent Test**: Verificar o resultado observável e os casos de erro nos testes de T7.

### P1: Envio retomável

**User Story**: Como cliente ou operador, quero envio retomável para usar a aplicação com confiança.

**Acceptance Criteria**:

1. WHEN o envio aceito falhar antes de registrar sucesso THEN o sistema SHALL reutilizar intenção e link válidos no retry sem rotacionar o token.

**Requirement**: MAIL-01

**Independent Test**: Verificar o resultado observável e os casos de erro nos testes de T8, T9.

### P1: Provider de email

**User Story**: Como cliente ou operador, quero provider de email para usar a aplicação com confiança.

**Acceptance Criteria**:

1. WHEN o provider de email for selecionado THEN o sistema SHALL validar configuração e usar adapter Resend ou registro local fora de produção, sem fallback silencioso de produção.

**Requirement**: MAIL-02

**Independent Test**: Verificar o resultado observável e os casos de erro nos testes de T8.

### P1: Revogação efetiva

**User Story**: Como cliente ou operador, quero revogação efetiva para usar a aplicação com confiança.

**Acceptance Criteria**:

1. WHEN o administrador revogar acesso THEN o sistema SHALL invalidar cookies anteriores e links de entrega anteriores.

**Requirement**: ACCESS-01

**Independent Test**: Verificar o resultado observável e os casos de erro nos testes de T10.

### P1: Arquivos privados

**User Story**: Como cliente ou operador, quero arquivos privados para usar a aplicação com confiança.

**Acceptance Criteria**:

1. IF faltar autorização ou entrega concluída THEN o sistema SHALL negar download privado sem retornar arquivo.

**Requirement**: ACCESS-02

**Independent Test**: Verificar o resultado observável e os casos de erro nos testes de T10.

### P1: Pedido de ajuste operável

**User Story**: Como cliente ou operador, quero pedido de ajuste operável para usar a aplicação com confiança.

**Acceptance Criteria**:

1. WHEN cliente entregue solicitar ajuste THEN o sistema SHALL registrar pedido único visível no admin e aplicar a transição de domínio revision_requested.

**Requirement**: SUPPORT-01

**Independent Test**: Verificar o resultado observável e os casos de erro nos testes de T11.

### P1: Operação segura

**User Story**: Como cliente ou operador, quero operação segura para usar a aplicação com confiança.

**Acceptance Criteria**:

1. WHEN a aplicação web servir links de entrega THEN o sistema SHALL evitar registrar capabilities no access log.

**Requirement**: OPS-01

**Independent Test**: Verificar o resultado observável e os casos de erro nos testes de T12.

### P1: Validação integrada

**User Story**: Como cliente ou operador, quero validação integrada para usar a aplicação com confiança.

**Acceptance Criteria**:

1. WHEN a entrega local for concluída THEN o sistema SHALL ter gates locais executados em Node 22, browser do Codex acessível e relatório distinguindo providers reais, CI remoto e produção.

**Requirement**: QA-01

**Independent Test**: Verificar o resultado observável e os casos de erro nos testes de T13.

## Edge Cases

- IF um formulário falhar THEN o sistema SHALL preservar dados e anunciar erro acessível.
- IF um webhook tiver valor ou moeda divergente THEN o sistema SHALL negar confirmação de pagamento.
- IF uma entrega estiver revogada ou expirada THEN o sistema SHALL impedir o retry de reativar seu link.

## Implicit Requirement Dimensions

| Dimension                   | Resolution                               |
| --------------------------- | ---------------------------------------- |
| Input and bounds            | CREATE-01 e validação existente.         |
| Failure and partial failure | PAY-03, MAIL-01.                         |
| Idempotency and concurrency | PAY-03, MAIL-01.                         |
| Auth and rate limits        | ACCESS-01/02 e limites existentes.       |
| Lifecycle and expiry        | ACCESS-01, links expirados não reativam. |
| Observability               | OPS-01 e relatório sanitizado.           |
| External dependencies       | MAIL-02, PAY-01/02.                      |
| State transitions           | SUPPORT-01 e assertTransition existente. |

## Requirement Traceability

| ID         | Task       | Status   |
| ---------- | ---------- | -------- |
| CREATE-01  | T1, T2, T3 | Complete |
| CREATE-02  | T3         | Complete |
| CREATE-03  | T3         | Complete |
| UX-01      | T4         | Complete |
| PAY-01     | T5, T6     | Complete |
| PAY-02     | T2, T5, T6 | Complete |
| PAY-03     | T7         | Complete |
| MAIL-01    | T8, T9     | Complete |
| MAIL-02    | T8         | Complete |
| ACCESS-01  | T10        | Complete |
| ACCESS-02  | T10        | Complete |
| SUPPORT-01 | T11        | Complete |
| OPS-01     | T12        | Complete |
| QA-01      | T13        | Complete |

## Success Criteria

- [x] Requisitos cobertos por evidências e verificador independente.
- [x] Preview local navegável e gates documentados.
