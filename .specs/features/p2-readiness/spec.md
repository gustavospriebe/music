# P2 Readiness Specification

## Problem Statement

O MVP funciona, mas ainda entrega JavaScript público pesado, não oferece uma capa presenteável e deixa cinco pré-requisitos operacionais no backlog. Esta feature fecha tudo que é localmente implementável e separa, sem ambiguidade, o que ainda depende de credenciais, infraestrutura, piloto pago ou aprovação jurídica.

## Goals

- [x] Manter o chunk de entrada abaixo de 500.000 bytes com rotas operacionais lazy.
- [x] Oferecer uma capa quadrada opcional após pagamento, com uma geração e uma regeneração.
- [x] Tratar foto de referência como arquivo privado, consentido, sanitizado e transitório.
- [x] Deixar providers, storage e restore prontos para ativação, sem alegar homologação externa.
- [x] Remover a depreciação do Fastify 6 e os avisos React sob controle desta mudança.

## Out of Scope

| Feature                                             | Reason                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| Chamada real/paga de capa                           | Exige orçamento e autorização adicional.                           |
| Homologar Mercado Pago/Resend                       | Exige credenciais, webhook/domínio e efeitos externos.             |
| Provisionar bucket ou fazer deploy                  | Infraestrutura externa e publicação não foram autorizadas.         |
| Aprovar texto jurídico                              | Depende de jurídico/comercial e política para menores.             |
| Alterar `orders.status` pela capa                   | A música continua sendo o produto contratado.                      |
| Editor, múltiplas referências ou mais de duas capas | Não são necessários para testar valor e custo.                     |
| Alterar `apps/web/src/admin/routes.tsx`             | O arquivo já contém mudanças do dono que não podem ser absorvidas. |

## Assumptions & Open Questions

| Assumption / decision         | Chosen default                                              | Rationale                                                                | Confirmed? |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ | ---------- |
| Continuação autônoma          | Especificar, implementar, testar e verificar sem nova pausa | O dono pediu para deixar todos os P2 prontos e continuar até o objetivo. | y          |
| Momento da capa               | Disponível após `paid` e em todas as etapas posteriores     | Evita abuso gratuito sem bloquear a música.                              | y          |
| Limite comercial              | Uma geração e uma regeneração explícita                     | Mantém teto de custo previsível.                                         | y          |
| Modelo                        | Lite sem foto; Flash com foto, configuráveis por env        | Equilibra custo e consistência conforme pesquisa oficial.                | y          |
| Falta de credencial em dev    | Mostrar indisponibilidade, sem imagem fake                  | A convenção do repositório proíbe provider falso.                        | y          |
| Referência                    | Um raster de até 8 MiB, re-encoded e removido ao encerrar   | Minimiza exposição e remove metadados.                                   | y          |
| Storage em produção           | S3 compatível privado; local só fora de produção            | Downloads já são mediados por capability da API.                         | y          |
| Texto na arte                 | Não é requisito                                             | Modelos não garantem tipografia exata; o título fica na UI/metadado.     | y          |
| Jurídico e providers externos | Prontos para ativação, mas `EXTERNAL BLOCKED`               | Não existe evidência real sem terceiro/credencial.                       | y          |

**Open questions: none.**

## User Stories

### P1: Criar e entregar uma capa privada ⭐ MVP

**User Story**: Como comprador, quero transformar o contexto da música em uma capa para compartilhar um presente mais completo.

**Why P1**: É o novo valor de produto pedido pelo dono e concentra os riscos de custo e privacidade.

**Acceptance Criteria**:

1. **COVER-01** WHEN um pedido com acesso de edição estiver pago ou em etapa posterior THEN o sistema SHALL permitir solicitar a primeira capa uma única vez.
2. **COVER-02** WHEN já existir uma capa concluída THEN o sistema SHALL permitir exatamente uma regeneração explícita e preservar as duas tentativas históricas.
3. **COVER-03** IF o pedido ainda não estiver pago, o acesso for somente leitura ou duas tentativas já existirem THEN o sistema SHALL rejeitar a mutação antes de chamar o provider.
4. **COVER-04** WHEN uma solicitação não incluir referência THEN o worker SHALL usar `google/gemini-3.1-flash-lite-image`; WHEN incluir referência THEN o worker SHALL usar `google/gemini-3.1-flash-image`.
5. **COVER-05** WHEN o cliente enviar referência THEN a API SHALL aceitar somente JPEG, PNG ou WebP de até 8 MiB com assinatura compatível, consentimento afirmativo e chave privada aleatória.
6. **COVER-06** WHEN o worker encerrar uma tentativa com referência com sucesso ou falha terminal THEN o sistema SHALL excluir os bytes da referência sem registrar sua chave.
7. **COVER-07** WHEN o mesmo job for retomado ou a página recarregada THEN o sistema SHALL reutilizar a tentativa persistida sem criar outra chamada de provider.
8. **COVER-08** WHEN o provider responder THEN o worker SHALL aceitar somente JPEG, PNG ou WebP e registrar provider, modelo, tokens, custo USD e latência no ledger.
9. **COVER-09** WHEN uma capa for consultada por sessão autorizada ou token de entrega THEN a API SHALL devolver somente estado, tentativa, saldo, URLs por capability e metadados públicos.
10. **COVER-10** WHEN a UI mostrar uma capa concluída THEN o sistema SHALL identificá-la como criada com IA, oferecer download e informar o saldo de regeneração.

**Independent Test**: Enfileirar duas tentativas com provider controlado, provar o limite/DTO e baixar ambas pelas capabilities sem expor IDs.

### P1: Carregar a jornada com menos JavaScript ⭐ MVP

**User Story**: Como visitante em rede móvel, quero abrir a landing sem baixar o formulário e toda a operação antes de precisar deles.

**Why P1**: O entry atual tem cerca de 671 kB e concentra todas as páginas num módulo.

**Acceptance Criteria**:

1. **PERF-01** WHEN o web build for gerado THEN o chunk de entrada SHALL ter menos de 500.000 bytes e cada página operacional pública SHALL ser carregada por import dinâmico.
2. **PERF-02** WHILE uma rota lazy estiver carregando o sistema SHALL mostrar fallback acessível e preservar navegação e foco.

**Independent Test**: Inspecionar o manifest/chunks do build e abrir landing mais uma rota operacional no Playwright.

### P1: Remover dívida de manutenção controlável ⭐ MVP

**User Story**: Como mantenedor, quero APIs atuais e componentes menores para atualizar dependências sem carregar avisos conhecidos.

**Why P1**: Fastify remove a opção no v6 e Doctor sinalizou complexidade pública.

**Acceptance Criteria**:

1. **MAINT-01** WHEN a API iniciar THEN o sistema SHALL configurar `LogController({ disableRequestLogging: true })` e emitir um único log sanitizado de conclusão por request.
2. **MAINT-02** WHEN React Doctor rodar THEN os componentes públicos alterados SHALL ficar sem avisos sem modificar o arquivo admin pré-alterado.

**Independent Test**: Capturar logs de `fastify.inject`, executar Doctor e conferir o diff do arquivo admin.

### P1: Preparar operação e revisão externa ⭐ MVP

**User Story**: Como operador, quero ativar providers e restaurar dados por um roteiro verificável sem confundir implementação com homologação.

**Why P1**: Esses itens bloqueiam produção mesmo com o fluxo local aprovado.

**Acceptance Criteria**:

1. **OPS-01** WHEN `NODE_ENV=production` THEN a configuração SHALL falhar sem modelos de capa e storage privado persistente explicitamente selecionado.
2. **OPS-02** WHEN operadores prepararem Mercado Pago, Resend, storage ou restore THEN o repositório SHALL fornecer comandos, evidências esperadas, rollback e campos de aceite.
3. **OPS-03** WHEN uma referência cumprir sete dias ou o job encerrar THEN o runbook SHALL exigir remoção; o conteúdo legal SHALL explicar finalidade, IA, retenção, direitos e canal de exclusão com marca de revisão jurídica.

**Independent Test**: Rodar testes de config, validar links/comandos e executar restore local isolado sem credenciais externas.

### P1: Provar fechamento sem falsos positivos ⭐ MVP

**User Story**: Como dono, quero evidência independente para saber exatamente o que está pronto e o que ainda precisa de terceiros.

**Why P1**: “Pronto” não pode significar apenas código compilando.

**Acceptance Criteria**:

1. **TEST-01** WHEN os gates locais rodarem THEN format, lint, typecheck, testes, build, migrations e E2E pertinentes SHALL passar.
2. **TEST-02** WHEN a implementação for validada THEN um verificador independente SHALL mapear cada requisito a evidência observável e executar um teste de discriminação em scratch.

**Independent Test**: Executar o gate completo, o validator estrutural e o relatório do verificador.

## Edge Cases

- IF a capa falhar THEN o sistema SHALL manter áudio, entrega e `orders.status` inalterados.
- IF duas solicitações concorrentes ocorrerem THEN o sistema SHALL persistir uma única tentativa de produto por número.
- IF a referência for arquivo ativo, truncado ou tiver MIME divergente THEN o sistema SHALL responder 400 sem persistir bytes, tentativa ou job.
- IF o output do provider for SVG, vazio ou base64 inválido THEN o worker SHALL marcar falha terminal e remover a referência.
- IF storage externo falhar após provider cobrado THEN o worker SHALL manter a mesma tentativa, registrar custo/erro sanitizado e não repetir automaticamente a chamada paga.

## Implicit-Requirement Dimensions

| Dimension                     | Resolution                                                |
| ----------------------------- | --------------------------------------------------------- |
| Input validation & bounds     | COVER-05 e edge case de assinatura/MIME.                  |
| Failure / partial failure     | Edge cases de provider e storage; capa não altera pedido. |
| Idempotency / retry           | COVER-02, COVER-07 e índice único por tentativa.          |
| Auth boundaries & rate limits | COVER-03/09; criação recebe limite dedicado.              |
| Concurrency / ordering        | Tentativas 1 e 2 são serializadas em transação.           |
| Data lifecycle / expiry       | COVER-06 e OPS-03.                                        |
| Observability                 | COVER-08 e MAINT-01.                                      |
| External dependency failure   | Falha explícita sem fake; retry técnico no mesmo job.     |
| State transition integrity    | Capa é independente; status principal não muda.           |

## Requirement Traceability

| Requirement ID | Story        | Phase  | Status   |
| -------------- | ------------ | ------ | -------- |
| COVER-01       | Capa privada | T4     | Verified |
| COVER-02       | Capa privada | T4     | Verified |
| COVER-03       | Capa privada | T4     | Verified |
| COVER-04       | Capa privada | T5     | Verified |
| COVER-05       | Capa privada | T4     | Verified |
| COVER-06       | Capa privada | T5     | Verified |
| COVER-07       | Capa privada | T4, T5 | Verified |
| COVER-08       | Capa privada | T5     | Verified |
| COVER-09       | Capa privada | T4     | Verified |
| COVER-10       | Capa privada | T6     | Verified |
| PERF-01        | Performance  | T3     | Verified |
| PERF-02        | Performance  | T3     | Verified |
| MAINT-01       | Manutenção   | T2     | Verified |
| MAINT-02       | Manutenção   | T6     | Verified |
| OPS-01         | Operação     | T7     | Verified |
| OPS-02         | Operação     | T7     | Verified |
| OPS-03         | Operação     | T7     | Verified |
| TEST-01        | Validação    | T8     | Verified |
| TEST-02        | Validação    | T8     | Verified |

**Coverage:** 19 total, 19 mapped to tasks, 0 unmapped.

## Success Criteria

- [x] Entry web menor que 500.000 bytes e rotas operacionais dinâmicas.
- [x] Duas tentativas máximas de capa, sem chamada real nos testes.
- [x] Referências e capas acessíveis apenas por capability e referências removidas no prazo.
- [x] Fastify sem opção depreciada e Doctor sem avisos nos arquivos públicos alterados.
- [x] Gates locais e verifier passam; dependências externas permanecem nomeadas como bloqueios.
