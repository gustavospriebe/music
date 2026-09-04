# MVP Operável Specification

## Problem Statement

A aplicação possui as peças do fluxo de música personalizada, mas ainda aceita estados inválidos como sucesso, perde contexto visual entre rotas, permite duplicação em operações com custo e expõe identificadores internos em respostas públicas. O MVP precisa tornar criação, geração, revisão, pagamento local, acompanhamento, entrega e recuperação previsíveis em desktop e mobile, sem depender de chamadas externas nesta validação.

## Goals

- [x] Uma pessoa conclui o fluxo feliz da história até a entrega local com estados observáveis e retomáveis.
- [x] Nenhuma resposta pública expõe UUIDs internos, hashes, tokens ou payloads pessoais desnecessários.
- [x] Operações de criação, geração, aprovação e checkout resistem a repetição e concorrência sem duplicar efeitos cobrados.
- [x] A interface preserva a identidade atual, abre cada etapa no contexto certo e comunica loading, vazio, erro e sucesso de forma acessível.
- [x] Testes derivados destes critérios falham quando status, resultado, foco, proteção ou idempotência regressam.

## Out of Scope

| Feature                                           | Reason                                                                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy, push ou publicação                        | Não autorizados nesta execução.                                                                                                                               |
| Chamada real a OpenRouter, Mercado Pago ou Resend | Exige autorização adicional e pode gerar custo ou efeito externo.                                                                                             |
| Revisão jurídica final de termos e privacidade    | Depende de jurídico/comercial.                                                                                                                                |
| Cadastro e sincronização multi-dispositivo        | O MVP mantém histórico local por navegador.                                                                                                                   |
| Clonagem de voz, imitação de artista e vídeo      | Fora da proposta e das regras de conteúdo.                                                                                                                    |
| Capa gerada por IA e foto de referência           | Faz sentido como P2, mas requer consentimento, retenção, moderação, storage e limite de custo próprios; pesquisa registrada em `docs/album-cover-backlog.md`. |
| Reestruturação ampla do monólito                  | Não é necessária para corrigir o caminho crítico.                                                                                                             |

## Assumptions & Open Questions

| Assumption / decision          | Chosen default                                                                                         | Rationale                                                                          | Confirmed? |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ---------- |
| Continuação após os artefatos  | Implementar e validar sem nova pausa de aprovação                                                      | O pedido autoriza execução autônoma, commits e delegação local até PASS.           | y          |
| Direção visual                 | Evoluir a paleta pêssego, laranja e tinta já existente                                                 | O pedido exige preservar identidade útil e evitar redesign desconectado.           | y          |
| Falha de letra                 | Permitir retry pelo cliente após mensagem acionável                                                    | A geração ocorre antes do pagamento e o retry é recuperável.                       | y          |
| Falha de áudio pago            | Orientar acompanhamento e deixar retry operacional no admin                                            | Repetição de áudio tem custo e não deve ser disparada anonimamente pelo cliente.   | y          |
| Providers sem credencial       | Pagamento e e-mail usam fallback local fora de produção; letra e áudio usam doubles somente nos testes | Esta é a convenção explícita do repositório e evita fingir integração real.        | y          |
| Preço público indisponível     | Mostrar pacote sem preço numérico até o catálogo responder                                             | Um valor estático divergente é pior que um estado temporariamente neutro.          | y          |
| Histórico                      | Manter os 20 pedidos mais recentes no navegador                                                        | É o limite atual documentado e não exige cadastro.                                 | y          |
| Retomada de geração abandonada | Liberar novo claim apenas após cinco minutos sem atualização                                           | Evita custo duplicado durante chamadas normais e recupera processos interrompidos. | y          |

**Open questions: none.**

## User Stories

### P1: Criar uma história válida uma única vez ⭐ MVP

**User Story**: Como comprador, quero preencher e reenviar a história com segurança para não criar pedidos duplicados quando a rede falhar.

**Why P1**: É a entrada de todo o funil e duplicações contaminam histórico, operação e métricas.

**Acceptance Criteria**:

1. **FLOW-01** WHEN a pessoa envia campos válidos THEN o sistema SHALL criar ou reutilizar exatamente um pedido para a chave idempotente da tentativa e abrir a revisão da letra.
2. **FLOW-02** IF nome, e-mail, homenageado, ocasião, duas lembranças ou aceite dos termos forem inválidos THEN o sistema SHALL manter o formulário, focar o primeiro campo inválido e associar uma mensagem específica ao controle.
3. **FLOW-03** WHILE o rascunho local estiver sendo salvo THEN o sistema SHALL expor um status textual em uma região `role="status"` sem bloquear a edição.
4. **FLOW-04** WHEN a página for recarregada antes do envio THEN o sistema SHALL restaurar os campos persistidos neste navegador.
5. **FLOW-05** IF o salvamento remoto falhar após a criação do pedido THEN o sistema SHALL preservar a chave da tentativa e reutilizar o mesmo pedido no próximo envio.

**Independent Test**: Repetir o POST com a mesma chave e observar o mesmo `publicId`; validar e recarregar o formulário no navegador.

### P1: Gerar e retomar a letra sem custo duplicado ⭐ MVP

**User Story**: Como comprador, quero saber que a letra está sendo criada e retomar a página sem iniciar outra cobrança de IA.

**Why P1**: A operação chama provider pago, demora e atravessa reload/retry.

**Acceptance Criteria**:

1. **GEN-01** WHEN duas requisições concorrentes tentarem iniciar a mesma geração THEN o sistema SHALL conceder um único claim e executar uma única chamada ao provider.
2. **GEN-02** WHILE o pedido estiver em `lyrics_generating` THEN o sistema SHALL mostrar “Criando sua letra” em região viva, desabilitar novo envio e consultar o pedido até obter `lyrics_ready` ou `failed`.
3. **GEN-03** WHEN a página de letra for recarregada em `lyrics_generating` THEN o sistema SHALL retomar o acompanhamento sem chamar o provider novamente.
4. **GEN-04** IF uma tentativa `lyrics_generating` não for atualizada por cinco minutos THEN o sistema SHALL permitir um único novo claim e manter todas as transições via `assertTransition`.
5. **GEN-05** IF a geração falhar antes do pagamento THEN o sistema SHALL explicar que a letra não foi concluída e oferecer “Tentar gerar novamente”.
6. **GEN-06** WHEN a geração atingir `lyrics_ready` THEN o sistema SHALL renderizar a versão de maior número e preservar versões anteriores sem alterar seu conteúdo.

**Independent Test**: Concorrer duas chamadas com provider controlado, recarregar durante o bloqueio e liberar uma tentativa envelhecida.

### P1: Revisar e aprovar a letra com resultado explícito ⭐ MVP

**User Story**: Como comprador, quero editar a letra e aprovar exatamente o texto visível para saber o que será produzido.

**Why P1**: O texto aprovado é o contrato do áudio pago.

**Acceptance Criteria**:

1. **LYRIC-01** WHEN a pessoa salvar uma edição THEN o sistema SHALL anexar uma nova versão e exibir confirmação sem mutar o conteúdo das versões anteriores.
2. **LYRIC-02** WHEN a pessoa aprovar texto alterado ainda não salvo THEN o sistema SHALL anexar e aprovar esse texto exato antes de abrir o checkout.
3. **LYRIC-03** IF salvar ou aprovar falhar THEN o sistema SHALL manter o texto digitado, permanecer na revisão e exibir erro acionável em `role="alert"`.
4. **LYRIC-04** WHILE salvar ou aprovar estiver pendente THEN o sistema SHALL desabilitar ambas as ações e nomear a operação em andamento.

**Independent Test**: Editar o último verso, aprovar sem salvar e verificar no banco que a versão aprovada contém esse verso e a anterior permanece igual.

### P1: Pagar e enfileirar áudio uma única vez ⭐ MVP

**User Story**: Como comprador, quero conferir o preço aprovado e concluir o pagamento local sem duplicar cobrança ou job.

**Why P1**: É a passagem entre conteúdo gratuito e produção com custo.

**Acceptance Criteria**:

1. **PAY-01** WHEN catálogo e pedido forem exibidos THEN o sistema SHALL usar valores em centavos vindos da API e formatar o mesmo preço em landing e checkout.
2. **PAY-02** WHEN checkout for repetido para um pagamento pendente THEN o sistema SHALL reutilizar a preferência existente e manter um único pagamento pendente.
3. **PAY-03** WHERE o ambiente não for produção e Mercado Pago não tiver credencial, WHEN a pessoa confirmar THEN o sistema SHALL aprovar pelo `publicId` sob o cookie do pedido e criar um único job de áudio.
4. **PAY-04** IF a confirmação local não tiver cookie do pedido THEN o sistema SHALL responder 401 sem alterar pagamento, pedido ou fila.
5. **PAY-05** WHILE a confirmação estiver pendente THEN o sistema SHALL desabilitar o CTA e comunicar “Confirmando pagamento”.

**Independent Test**: Repetir checkout e confirmação local, contar pagamentos/jobs no PostgreSQL e verificar o mesmo preço nas duas telas.

### P1: Acompanhar, recuperar e concluir a produção ⭐ MVP

**User Story**: Como comprador, quero entender o estado do pedido, recarregar ou voltar depois e chegar às duas versões ou a uma recuperação honesta.

**Why P1**: A produção é assíncrona e o valor só é entregue no final.

**Acceptance Criteria**:

1. **ASYNC-01** WHILE o pedido estiver em `paid`, `audio_queued`, `audio_generating` ou `review_required` THEN o sistema SHALL destacar “Produção do áudio” como etapa atual e atualizar o estado por polling.
2. **ASYNC-02** WHEN o pedido atingir `delivered` com duas variantes completas THEN o sistema SHALL marcar cinco etapas concluídas e oferecer acesso aos dois players e downloads.
3. **ASYNC-03** IF o áudio pago falhar THEN o sistema SHALL informar que a produção não foi concluída, evitar promessa de regeneração automática e orientar acompanhamento pelo pedido.
4. **ASYNC-04** WHEN um link de entrega válido for trocado por acesso THEN o sistema SHALL registrar o `publicId` no histórico local e abrir o pedido sem expor o token novamente.
5. **ASYNC-05** WHEN a página de pedido for recarregada THEN o sistema SHALL derivar título, mensagem, etapa e ações exclusivamente de um status conhecido.
6. **ASYNC-06** IF a API devolver status desconhecido ou ausente THEN o sistema SHALL exibir erro de estado inconsistente e não classificá-lo como produção.
7. **ASYNC-07** WHILE o histórico local estiver vazio THEN o sistema SHALL explicar o escopo por navegador e oferecer uma ação para criar música.

**Independent Test**: Percorrer fixtures completas de cada status, recarregar processamento/entrega e rejeitar fixture sem status.

### P1: Navegar com contexto visual e acessível ⭐ MVP

**User Story**: Como pessoa em desktop, mobile ou teclado, quero chegar ao início de cada etapa e receber feedback perceptível.

**Why P1**: Hoje rotas abrem fora do contexto e estados críticos não são anunciados.

**Acceptance Criteria**:

1. **A11Y-01** WHEN o pathname mudar THEN o sistema SHALL rolar para `scrollY=0` e mover foco programático para o `main` sem criar parada adicional na ordem normal de Tab.
2. **A11Y-02** WHEN um controle receber foco por teclado THEN o sistema SHALL mostrar contorno com contraste de pelo menos 3:1 contra o fundo adjacente.
3. **A11Y-03** WHEN o menu mobile abrir ou fechar THEN o sistema SHALL atualizar `aria-expanded`, nome acessível e visibilidade; Escape SHALL fechar e devolver foco ao botão.
4. **A11Y-04** WHILE a viewport tiver 390 px de largura THEN o sistema SHALL refluír sem overflow horizontal e manter CTAs primários com área mínima de 44 × 44 px.
5. **A11Y-05** The system SHALL usar um único `h1` legível por rota, line-height mínimo de 1.05 e tracking que preserve espaços entre palavras.
6. **A11Y-06** WHEN loading, erro, vazio ou sucesso forem renderizados THEN o sistema SHALL usar texto explícito e sem depender apenas de cor ou ícone.
7. **A11Y-07** WHERE movimento decorativo for usado, WHILE `prefers-reduced-motion: reduce` estiver ativo THEN o sistema SHALL remover animação não essencial.

**Independent Test**: Executar jornada por Tab/Escape nos dois viewports e comparar screenshots de cada estado.

### P1: Proteger a borda pública e observar sem dados sensíveis ⭐ MVP

**User Story**: Como operador e comprador, quero respostas e logs mínimos para que o suporte não crie vazamento de dados.

**Why P1**: UUIDs de produto/pagamento já atravessam a borda pública.

**Acceptance Criteria**:

1. **SAFE-01** WHEN produtos forem listados publicamente THEN o sistema SHALL devolver apenas `type`, `name`, `priceCents` e `active`.
2. **SAFE-02** WHEN checkout público responder THEN o sistema SHALL omitir UUID de pagamento, IDs internos, hashes e tokens.
3. **SAFE-03** The system SHALL omitir IDs internos, hashes, tokens e payloads pessoais de todas as respostas públicas de pedido, letra, áudio e entrega.
4. **SAFE-04** WHEN uma operação assíncrona ou HTTP for registrada THEN o sistema SHALL incluir apenas request ID, rota template, status, tentativa, duração e referências públicas necessárias.
5. **SAFE-05** IF um provider externo falhar THEN o sistema SHALL persistir erro sanitizado com no máximo 500 caracteres e nunca registrar credencial, letra inteira ou formulário.
6. **SAFE-06** WHERE o ambiente for produção THEN o sistema SHALL falhar na inicialização quando credenciais obrigatórias do processo estiverem ausentes.
7. **SAFE-07** IF um cliente forjar `order_<publicId>=1` ou `order_view_<publicId>=1` THEN o sistema SHALL responder 401; somente cookies assinados pelo servidor SHALL conceder acesso.

**Independent Test**: Comparar exatamente chaves de todos os DTOs públicos e procurar padrões secretos/UUIDs internos em respostas e logs de teste.

### P1: Provar o comportamento especificado ⭐ MVP

**User Story**: Como mantenedor, quero gates que validem resultados reais para não aceitar um fluxo falso positivo.

**Why P1**: A suíte atual aceita `status` ausente como produção.

**Acceptance Criteria**:

1. **TEST-01** WHEN o E2E executar o fluxo feliz THEN o sistema SHALL validar cada fixture de pedido com status conhecido e afirmar história, letra, preço, produção e entrega observáveis.
2. **TEST-02** WHEN regressões de idempotência forem injetadas THEN o sistema SHALL falhar testes de criação, geração, checkout e job único.
3. **TEST-03** WHEN regressões visuais ou de teclado forem injetadas THEN o sistema SHALL falhar testes de scroll, foco, menu e estados acessíveis.
4. **TEST-04** WHEN o gate final executar THEN o sistema SHALL passar format, lint, typecheck, testes, build, migrations, seed, E2E, React Doctor e UAT nos dois viewports.

**Independent Test**: Rodar o gate completo e o discrimination sensor em cópia isolada do trabalho.

## Edge Cases

- IF localStorage estiver indisponível THEN o sistema SHALL manter o fluxo da sessão atual sem lançar erro não tratado.
- IF o catálogo falhar THEN o sistema SHALL manter o CTA de criação e omitir preço numérico potencialmente incorreto.
- IF só uma variante de áudio estiver completa THEN o sistema SHALL impedir status `delivered` e manter o pedido em produção ou revisão.
- IF o cookie de visualização não pertencer ao pedido THEN o sistema SHALL responder 401 sem revelar se dados privados existem.
- WHEN versões de letra forem listadas THEN o sistema SHALL ordenar por número decrescente e usar a maior versão como edição atual.

## Implicit-Requirement Dimensions

| Dimension                                | Resolution                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Input validation & bounds                | FLOW-02 e schemas Zod compartilhados.                                                                                   |
| Failure / partial-failure states         | GEN-05, LYRIC-03, ASYNC-03 e edge case de variante parcial.                                                             |
| Idempotency / retry / duplicate handling | FLOW-01/05, GEN-01/04 e PAY-02/03.                                                                                      |
| Auth boundaries & rate limits            | PAY-04, SAFE-02/03; rate limit existente de geração permanece em cinco por hora.                                        |
| Concurrency / ordering                   | GEN-01/04, PAY-02 e ordenação de versões no edge case.                                                                  |
| Data lifecycle / expiry                  | Histórico local limitado a 20; alteração de retenção no PostgreSQL é N/A porque exige política jurídica fora do escopo. |
| Observability                            | SAFE-04/05.                                                                                                             |
| External-dependency failure              | SAFE-05/06 e fallbacks decididos nas suposições.                                                                        |
| State-transition integrity               | GEN-04, ASYNC-01/02/05/06 e `assertTransition` obrigatório.                                                             |

## Requirement Traceability

| Requirement ID | Story                  | Phase          | Status |
| -------------- | ---------------------- | -------------- | ------ |
| FLOW-01        | Criar história         | T1, T2, T5     | Done   |
| FLOW-02        | Criar história         | T5, F2         | Done   |
| FLOW-03        | Criar história         | T5             | Done   |
| FLOW-04        | Criar história         | T5             | Done   |
| FLOW-05        | Criar história         | T2, T5         | Done   |
| GEN-01         | Gerar letra            | T4             | Done   |
| GEN-02         | Gerar letra            | T6             | Done   |
| GEN-03         | Gerar letra            | T6             | Done   |
| GEN-04         | Gerar letra            | T4             | Done   |
| GEN-05         | Gerar letra            | T6             | Done   |
| GEN-06         | Gerar letra            | T4, T6         | Done   |
| LYRIC-01       | Revisar letra          | T4, F2         | Done   |
| LYRIC-02       | Revisar letra          | T4             | Done   |
| LYRIC-03       | Revisar letra          | T6             | Done   |
| LYRIC-04       | Revisar letra          | T6             | Done   |
| PAY-01         | Pagamento              | T1, T5         | Done   |
| PAY-02         | Pagamento              | T3             | Done   |
| PAY-03         | Pagamento              | T3, T5         | Done   |
| PAY-04         | Pagamento              | T3             | Done   |
| PAY-05         | Pagamento              | T5             | Done   |
| ASYNC-01       | Produção e entrega     | T6, F2         | Done   |
| ASYNC-02       | Produção e entrega     | T6, F2         | Done   |
| ASYNC-03       | Produção e entrega     | T6             | Done   |
| ASYNC-04       | Produção e entrega     | T6, F2         | Done   |
| ASYNC-05       | Produção e entrega     | T1, T6         | Done   |
| ASYNC-06       | Produção e entrega     | T1, T6         | Done   |
| ASYNC-07       | Produção e entrega     | T6             | Done   |
| A11Y-01        | Navegação acessível    | T7             | Done   |
| A11Y-02        | Navegação acessível    | T7, F3         | Done   |
| A11Y-03        | Navegação acessível    | T7             | Done   |
| A11Y-04        | Navegação acessível    | T7             | Done   |
| A11Y-05        | Navegação acessível    | T7, F3         | Done   |
| A11Y-06        | Navegação acessível    | T7             | Done   |
| A11Y-07        | Navegação acessível    | T7             | Done   |
| SAFE-01        | Borda pública          | T1, T3         | Done   |
| SAFE-02        | Borda pública          | T1, T3         | Done   |
| SAFE-03        | Borda pública          | T1, T2, T3, F1 | Done   |
| SAFE-04        | Borda pública          | T8, F1         | Done   |
| SAFE-05        | Borda pública          | T4             | Done   |
| SAFE-06        | Borda pública          | T8             | Done   |
| SAFE-07        | Borda pública          | T3             | Done   |
| TEST-01        | Prova de comportamento | T7, T8         | Done   |
| TEST-02        | Prova de comportamento | T8             | Done   |
| TEST-03        | Prova de comportamento | T7, T8         | Done   |
| TEST-04        | Prova de comportamento | T8             | Done   |

**Coverage:** 45 total, 45 mapped to tasks, 0 pending design.

## Success Criteria

- [ ] Os 45 requisitos possuem evidência direta em `validation.md`.
- [x] Nenhum P0 ou P1 da auditoria inicial permanece aberto.
- [x] O fluxo crítico termina com duas variantes acessíveis usando providers controlados e PostgreSQL real.
- [x] Screenshots finais desktop/mobile mostram entrada no topo e estados legíveis, acionáveis e responsivos.
- [ ] Todos os gates finais saem com código 0 e o Verifier independente retorna PASS.
