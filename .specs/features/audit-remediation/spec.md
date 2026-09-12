# Audit remediation Specification

## Problem Statement

A auditoria independente encontrou falhas de integridade financeira, exposição de erros internos, origem de áudio não demonstrável e recuperação insegura. O dono autorizou corrigir P0, P1 e P2 e delegar a execução em 2026-09-12. Esta entrega preserva o produto único e comprova as correções localmente antes de qualquer promoção externa.

## Goals

- [x] Eliminar os cenários incorretos demonstrados pela auditoria.
- [x] Manter histórico de dinheiro, consentimento, produção e tentativas externas.
- [x] Passar gates locais com Node 22 e PostgreSQL 18 isolado, incluindo verificação independente.
- [x] Documentar separadamente código local, CI e execução externa.

## Out of Scope

| Feature                                                     | Reason                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Commit, push, deploy e alteração de produção nesta execução | Exigem autorização específica e resultado local reviewable primeiro.         |
| Chamadas pagas e PIX real                                   | Sem autorização de gasto e teto nesta execução.                              |
| Escolher preço ou gateway comercial final                   | Decisão do dono; configuração ficará honestamente indisponível até definida. |
| Inventar aceite jurídico ou homologação externa             | Artefatos operacionais prontos não substituem aceite e execução reais.       |
| Cadastro, microserviços e framework de IA                   | Sem necessidade no produto autorizado; não corrigem os defeitos auditados.   |

## Assumptions & Open Questions

| Assumption / decision               | Chosen default                                                                       | Rationale                                                                                                    | Confirmed? |
| ----------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ---------- |
| Escopo de execução                  | Todo backlog auditado, implementação local e validação                               | Autorização expressa do dono                                                                                 | y          |
| Revisão de áudio                    | Humana por padrão; auto release explicitamente nomeado                               | Arquivo válido não comprova qualidade artística                                                              | n          |
| Gate técnico de áudio               | Decodificável e pelo menos 10 segundos                                               | Evitar cabeçalho vazio ou arquivo curto como música entregue; silêncio e qualidade dependem da escuta humana | n          |
| Resultado externo incerto           | Reconciliar ou revisão operacional, sem repetir automaticamente                      | Timeout não prova ausência de cobrança                                                                       | n          |
| Histórico anterior sem vínculo      | Marcar legacy_unverified, nunca inventar proveniência/consentimento                  | Não há dado suficiente para reconstruir fatos passados                                                       | n          |
| Reembolso integral confirmado       | Persistir financeiro, impedir produção nova e revogar entrega                        | Produto não deve continuar como pago após devolução                                                          | n          |
| Domínio criativo e formulário       | CreativeBrief separado; HTTP compõe contato e consentimento                          | Evitar roundtrip de PII apenas para satisfazer tipos                                                         | y          |
| Aceite comercial de desenvolvimento | policyVersion draft-v1 explicitamente apresentada; produção exige política publicada | Sem inventar textos definitivos do negócio                                                                   | n          |
| P2 condicionado a crescimento       | Instrumentar e limitar; streaming implementado sem nova infraestrutura               | Medição antes de réplicas e prioridade sofisticada                                                           | n          |

Open questions: none for local implementation. Escolhas comerciais e provas externas permanecem gates de ativação separados; os defaults de implementação estão explicitados acima.

## User Stories

### P0: Cobrança e acesso confiáveis

**User Story**: Como dono, quero que somente a cobrança correta produza música e que erros não exponham dados.

**Acceptance Criteria**:

1. **PAY-01** WHEN a cobrança for consultada THEN o sistema SHALL exigir ID, provider, referência, valor em centavos e BRL correspondentes à tentativa persistida antes de aprovar o pedido.
2. **PAY-02** WHEN checkout for solicitado THEN o sistema SHALL persistir a tentativa e sua chave antes da rede e reutilizar a tentativa ativa em pedidos concorrentes.
3. **PAY-03** IF criação externa tiver resultado incerto THEN o sistema SHALL manter unknown e impedir segunda criação automática até reconciliação inequívoca.
4. **PAY-04** WHEN reembolso integral for confirmado THEN o sistema SHALL registrar refunded, impedir nova produção paga e revogar acesso à entrega sem apagar histórico.
5. **PAY-05** WHEN webhook ou consulta periódica atualizar cobrança THEN o sistema SHALL aplicar a mesma regra transacional pelo provider da tentativa e deduplicar eventos sem regredir approved para expired.
6. **SEC-01** IF erro interno ocorrer THEN a API SHALL responder 500 genérico com requestId sem query, parâmetros, tokens ou mensagem arbitrária do upstream.
7. **SEC-02** WHEN cliente editar ou aprovar letra THEN o sistema SHALL aplicar validação de conteúdo e preservar exatamente o texto canônico aceito para geração.
8. **SEC-03** WHEN formulário ou referência forem aceitos THEN o sistema SHALL persistir finalidade, versão e instante do consentimento sem reconstruir aceite ausente como verdadeiro.

**Independent Test**: Handlers com provider injetado e PostgreSQL isolado demonstram cobrança divergente, concorrência, timeout, refund e erros sanitizados.

### P0: Produção recuperável

**User Story**: Como cliente, quero receber duas faixas da letra aprovada e preservar o resultado anterior durante recuperação.

**Acceptance Criteria**:

1. **PROD-01** WHEN produção for criada THEN o sistema SHALL vinculá-la a uma versão imutável da letra e exigir as duas variantes dessa produção para entrega.
2. **PROD-02** WHEN áudio for regenerado THEN o sistema SHALL preservar registros e objetos anteriores e gravar cada nova geração em chave exclusiva.
3. **JOB-01** WHILE um job estiver processing o sistema SHALL renovar sua posse e condicionar conclusão e efeitos persistidos ao lease vigente.
4. **JOB-02** IF execução anterior perder o lease ou deixar chamada externa iniciada sem resultado THEN o sistema SHALL impedir seu overwrite e evitar nova chamada automática de resultado desconhecido.
5. **JOB-03** WHEN retry explícito de letra esgotada for aceito THEN o sistema SHALL liberar uma tentativa válida ou responder bloqueio antes de mudar o pedido para lyrics_generating.
6. **PROD-03** IF áudio não for decodificável ou tiver menos de 10 segundos THEN o sistema SHALL rejeitá-lo antes de marcar completed.
7. **MAIL-01** WHEN produção for liberada THEN o sistema SHALL enfileirar deliver_notify transacionalmente, preservando o tipo do job de áudio e a intenção estável de e-mail.

**Independent Test**: Provedores sintéticos e áudio válido gerado localmente demonstram versão fixa, falha parcial, takeover de lease e notificação retomável.

### P1: Modelo e operação honestos

**User Story**: Como operador, quero observar custo, dinheiro e riscos reais sem depender de estados de tela.

**Acceptance Criteria**:

1. **DATA-01** The system SHALL separar CreativeBrief, contato e consentimentos e manter constraints de centavos, variantes e associação de produção/arquivos.
2. **DATA-02** WHEN migrations forem aplicadas em banco vazio ou até 0011 THEN o schema resultante SHALL corresponder ao schema declarativo sem editar migrations previamente aplicadas.
3. **COST-01** WHEN chamada de IA for iniciada THEN o sistema SHALL registrar sua identidade antes do I/O e distinguir custo informado, estimado e desconhecido mesmo com resposta inválida.
4. **OPS-01** WHEN cockpit for consultado THEN o sistema SHALL calcular receita pelo financeiro e expor backlog, jobs expirados e chamadas desconhecidas sem PII.
5. **OPS-02** WHEN worker iniciar em produção THEN o sistema SHALL exigir credenciais das capacidades usadas e manter revisão humana como default.
6. **OPS-03** WHEN configuração comercial estiver incompleta THEN o sistema SHALL manter checkout real indisponível e apresentar pendências sem declarar prontidão.

**Independent Test**: Integração verifica receita após falha de áudio, métricas, custos e validação de configuração.

### P2: Simplificação e validação final

**User Story**: Como mantenedor, quero estrutura pequena e documentação que permita operar sem reproduzir dívida antiga.

**Acceptance Criteria**:

1. **CLEAN-01** The system SHALL remover estruturas sem consumidor identificadas na auditoria ou lhes dar um fluxo verificável de produto.
2. **FILE-01** WHEN download autorizado requisitar Range válido THEN a API SHALL servir o intervalo privado sem carregar o objeto completo em memória.
3. **DOC-01** The system documentation SHALL identificar decisões superadas, prova local, CI, Railway e gates comerciais sem apresentar specs históricas como contrato atual.
4. **VERIFY-01** The system SHALL passar format, lint, typecheck, testes, build, E2E e verificação independente com sensor discriminante em ambiente isolado.

**Independent Test**: Gates completos e revisão independente confrontam critérios com código e resultados.

## Edge Cases

- IF cobrança de outro pedido tiver o mesmo valor THEN o sistema SHALL recusar aprovação.
- IF refund chegar antes de consulta atrasada de pagamento THEN o sistema SHALL preservar refunded.
- IF faixa 1 estiver pronta e a letra mudar THEN o sistema SHALL criar outra produção para o par sem misturar versões.
- IF consentimento antigo não estiver preservado THEN a leitura SHALL informar ausência em vez de aceite positivo.
- IF provider falhar após receber uma requisição THEN o sistema SHALL tratar a execução como potencialmente cobrada até evidência contrária.

## Requirement Traceability

| Requirement ID | Story         | Phase     | Status     |
| -------------- | ------------- | --------- | ---------- |
| PAY-01         | Cobrança      | T3/T5     | PASS local |
| PAY-02         | Cobrança      | T4        | PASS local |
| PAY-03         | Cobrança      | T4/T5     | PASS local |
| PAY-04         | Cobrança      | T5        | PASS local |
| PAY-05         | Cobrança      | T5        | PASS local |
| SEC-01         | Acesso        | T6        | PASS local |
| SEC-02         | Conteúdo      | T7        | PASS local |
| SEC-03         | Consentimento | T2/T7/T13 | PASS local |
| PROD-01        | Produção      | T1/T10    | PASS local |
| PROD-02        | Produção      | T10       | PASS local |
| JOB-01         | Fila          | T8        | PASS local |
| JOB-02         | Fila          | T8/T9     | PASS local |
| JOB-03         | Fila          | T7/T8     | PASS local |
| PROD-03        | Áudio         | T10       | PASS local |
| MAIL-01        | Entrega       | T11       | PASS local |
| DATA-01        | Modelo        | T1/T2     | PASS local |
| DATA-02        | Modelo        | T1/T14    | PASS local |
| COST-01        | Custo         | T9        | PASS local |
| OPS-01         | Operação      | T13       | PASS local |
| OPS-02         | Operação      | T14       | PASS local |
| OPS-03         | Operação      | T13/T14   | PASS local |
| CLEAN-01       | Simplificação | T2/T15    | PASS local |
| FILE-01        | Arquivos      | T12       | PASS local |
| DOC-01         | Documentação  | T15       | PASS local |
| VERIFY-01      | Validação     | T16       | PASS local |

## Success Criteria

- [x] Critérios acima possuem evidência de resultado e testes pertinentes.
- [x] Gate local completo passa sem provider pago e sem usar dados existentes do dono.
- [x] Verificador independente aprova código e sensor; gates externos continuam discriminados.
