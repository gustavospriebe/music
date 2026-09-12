# Local Readiness and UI/UX Audit Specification

> Registro histórico de um recorte anterior. O modelo vigente e a evidência atual estão em [docs/documentation-map.md](../../../docs/documentation-map.md) e [audit-remediation](../audit-remediation/spec.md). Este registro não autoriza publicação nem gasto com providers.

## Problem Statement

O repositório importado já aponta para pnpm 12 e o lockfile usa o formato oficial com um documento de ambiente seguido pelo grafo do projeto. A migração ainda precisa provar instalação congelada, política explícita de scripts e compatibilidade dos gates antes de a interface ser auditada e remodelada.

## Goals

- [x] Concluir a migração reproduzível para pnpm 12.3.4.
- [x] Provar banco, aplicação e gates locais em ambiente descartável e sem chamadas pagas.
- [x] Auditar as jornadas pública e gerencial no Browser com screenshots atuais.
- [x] Registrar prioridades de UI/UX sem implementar o redesign nesta rodada.

## Out of Scope

| Feature                                         | Reason                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| Remodelar componentes ou estilos                | A auditoria precede a escolha de direção visual.                                 |
| Chamar OpenRouter, Mercado Pago ou Resend reais | Pode gerar custo ou efeito externo; o teste local usa fallbacks.                 |
| Commit, push, PR ou deploy                      | Não foram pedidos nesta rodada.                                                  |
| Alterar o WIP funcional do worker               | A mudança pré-existente não pertence à migração.                                 |
| Declarar conformidade WCAG                      | Screenshots e inspeção de fluxo identificam riscos, não certificam conformidade. |

## Assumptions & Open Questions

| Assumption / decision  | Chosen default                                          | Rationale                                                                     | Confirmed? |
| ---------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------- |
| Versão-alvo            | pnpm 12.3.4                                             | O usuário confirmou a migração e esta é a versão já declarada/instalada.      | y          |
| Browser                | Browser integrado do Codex                              | O usuário o escolheu explicitamente.                                          | y          |
| Providers locais       | Credenciais externas vazias no processo auditado        | Evita custo e usa os fallbacks de desenvolvimento existentes.                 | y          |
| Escopo visual          | Desktop e reflow móvel das jornadas pública e gerencial | Uma análise geral precisa cobrir as duas superfícies e responsividade básica. | y          |
| Resultado desta rodada | Auditoria priorizada, sem redesign                      | O usuário quer primeiro entender e depois remodelar.                          | y          |

**Open questions:** none.

## User Stories

### P1: Ambiente local reproduzível ⭐ MVP

**User Story**: Como mantenedor, quero instalar e executar o monorepo com pnpm 12 para desenvolver sem depender do estado da máquina importada.

**Why P1**: O novo formato precisa ser aceito por instalação, build e CI antes de confiarmos no fluxo local.

**Acceptance Criteria**:

1. **LOCAL-01** WHEN a migração terminar THEN o repositório SHALL declarar pnpm 12.3.4 e manter um único arquivo de lock com os dois documentos oficiais esperados.
2. **LOCAL-02** WHEN uma instalação limpa usar `--frozen-lockfile` THEN o pnpm SHALL concluir sem alterar manifests ou lockfile.
3. **LOCAL-03** IF dependências com scripts de build forem instaladas THEN o pnpm SHALL aplicar a política explícita do workspace sem prompt interativo.

**Independent Test**: Instalar em checkout/cópia limpa com Corepack e confirmar porcelain estável depois de `--frozen-lockfile`.

### P1: Aplicação local funcional ⭐ MVP

**User Story**: Como mantenedor, quero provar o banco, os três runtimes e os testes para começar o trabalho visual sobre uma base confiável.

**Why P1**: Uma auditoria visual sobre estado quebrado produziria conclusões falsas.

**Acceptance Criteria**:

1. **LOCAL-04** WHEN o PostgreSQL descartável estiver disponível THEN o projeto SHALL aplicar migrations no banco principal e de teste e popular o catálogo inicial.
2. **LOCAL-05** WHEN os gates locais forem executados THEN o projeto SHALL concluir format, lint, typecheck, testes serializados, build e Playwright sem falhas.
3. **LOCAL-06** WHILE os processos locais auditados estiverem ativos THEN web, API e worker SHALL iniciar sem chamada real a provider pago.
4. **LOCAL-07** WHEN a API estiver pronta THEN o healthcheck SHALL responder pronto e o catálogo SHALL conter ao menos um produto seedado.

**Independent Test**: Subir banco e processos com credenciais externas vazias, consultar readiness/catalog e executar a suíte documentada.

### P1: Auditoria UI/UX baseada em evidência ⭐ MVP

**User Story**: Como responsável pelo produto, quero entender a experiência do cliente e do time gerencial para priorizar a remodelagem.

**Why P1**: O redesign precisa atacar fricção real, hierarquia, confiança e acessibilidade, não preferência abstrata.

**Acceptance Criteria**:

1. **AUDIT-01** WHEN a jornada pública for auditada THEN o relatório SHALL incluir screenshots atuais em ordem, saúde de cada etapa e achados ligados às telas.
2. **AUDIT-02** WHEN a jornada gerencial for auditada THEN o relatório SHALL incluir screenshots atuais em ordem, saúde de cada etapa e achados ligados às telas.
3. **AUDIT-03** WHEN o audit terminar THEN o relatório SHALL separar forças, riscos de UX, riscos de acessibilidade, limites de evidência e recomendações priorizadas.
4. **AUDIT-04** IF uma etapa não puder ser concluída sem provider real ou efeito externo THEN o relatório SHALL nomear o bloqueio sem simular sucesso.

**Independent Test**: Reabrir as capturas aceitas e confrontar cada achado com uma etapa numerada do Browser.

## Edge Cases

- IF o `.env` local contiver credenciais reais THEN os processos de auditoria SHALL sobrescrevê-las com valores vazios sem imprimir seus conteúdos.
- IF a porta padrão estiver ocupada THEN o ambiente SHALL usar portas locais explícitas e registrá-las sem encerrar processo alheio.
- IF uma instalação não congelada mudar versões de aplicação além do necessário THEN a migração SHALL parar para revisão antes de aceitar o novo lockfile.
- IF uma captura estiver vazia, cortada, carregando ou na tela errada THEN ela SHALL ser rejeitada e recapturada.
- IF uma afirmação exigir teste de teclado, leitor de tela ou contraste calculado THEN o relatório SHALL marcá-la como risco ou lacuna, não como conformidade confirmada.

## Implicit-Requirement Dimensions

| Dimension                                | Resolution                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| Input validation & bounds                | Pin exato de pnpm e portas/URLs explícitas no ambiente auditado.                         |
| Failure / partial-failure states         | Erros de install, migration, boot ou captura interrompem a etapa e viram evidência.      |
| Idempotency / retry / duplicate handling | Frozen install deve ser estável; seed e migrations são comprovados em banco descartável. |
| Auth boundaries & rate limits            | Login admin local é auditado; valores secretos não entram em logs ou artefatos.          |
| Concurrency / ordering                   | Suítes de banco rodam serializadas antes do Browser audit.                               |
| Data lifecycle / expiry                  | Banco e storage temporários são descartáveis; nenhum dado real é usado.                  |
| Observability                            | Health, catálogo, processos e resultados de gates ficam registrados.                     |
| External-dependency failure              | Providers externos são deliberadamente desativados; limites ficam explícitos.            |
| State-transition integrity               | Instalação, gates, boot, audit e redesign continuam estados separados.                   |

## Requirement Traceability

| Requirement ID | Story     | Phase  | Status   |
| -------------- | --------- | ------ | -------- |
| LOCAL-01       | Ambiente  | T1, T3 | Verified |
| LOCAL-02       | Ambiente  | T3, T4 | Verified |
| LOCAL-03       | Ambiente  | T2, T3 | Verified |
| LOCAL-04       | Funcional | T6     | Verified |
| LOCAL-05       | Funcional | T6, T8 | Verified |
| LOCAL-06       | Funcional | T5, T6 | Verified |
| LOCAL-07       | Funcional | T6     | Verified |
| AUDIT-01       | Auditoria | T7     | Verified |
| AUDIT-02       | Auditoria | T7     | Verified |
| AUDIT-03       | Auditoria | T7, T8 | Verified |
| AUDIT-04       | Auditoria | T7     | Verified |

**Coverage:** 11 total, 11 mapped to tasks, 0 unmapped.

## Success Criteria

- [x] `corepack pnpm install --frozen-lockfile` passa com o lockfile multi-documento oficial e byte-estável.
- [x] Banco descartável, gates automatizados e boot local passam sem provider real.
- [x] Jornadas pública e gerencial têm screenshots aceitos e relatório priorizado.
- [x] Estado do projeto aponta para a próxima decisão de redesign sem declarar UAT humana ou deploy.
