# Railway Bootstrap Specification

## Problem Statement

O repositório contém imagens e um guia de Railway, mas o CI remoto falha antes dos gates e não existe projeto Railway para a aplicação. O bootstrap precisa corrigir o gate, consolidar o contexto operacional e criar a estrutura externa sem confundir provisionamento com deploy, homologação ou produção comercial.

## Goals

- [ ] Fazer o CI instalar pnpm antes de habilitar seu cache e cobrir format.
- [ ] Manter um mapa canônico e atual da arquitetura, operação e gates.
- [ ] Criar o projeto Railway e os serviços de aplicação sem disparar deploy.
- [ ] Deixar Postgres, Bucket, migrations, seed, variáveis e promoção definidos de forma verificável.

## Out of Scope

| Feature                         | Reason                                                                   |
| ------------------------------- | ------------------------------------------------------------------------ |
| Commit, push ou PR              | Não foram pedidos e o worktree contém WIP pré-existente.                 |
| Deploy/publicação dos apps      | `AGENTS.md` proíbe deploy/publicação nesta execução.                     |
| Chamada real a providers        | Pode gerar custo ou efeito externo e requer gate próprio.                |
| Corrigir o WIP de pnpm/lockfile | A origem das mudanças locais não foi confirmada; elas serão preservadas. |
| Produção comercial              | Exige sandbox, jurídico, restore e UAT separados.                        |

## Assumptions & Open Questions

| Assumption / decision  | Chosen default                                                       | Rationale                                                                             | Confirmed? |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------- |
| Projeto Railway        | `musica-da-resenha` no único workspace acessível                     | Não há projeto homônimo ou relacionado.                                               | y          |
| Ambiente inicial       | `production`, tratado como bloqueado para tráfego comercial          | É o ambiente criado por padrão; nome não é evidência de promoção.                     | y          |
| Revisão de áudio       | `AUDIO_REVIEW_MODE=manual`                                           | É o default seguro do código até decisão comercial.                                   | y          |
| Bucket                 | Railway Bucket privado, região `iad` quando a criação for autorizada | É a região suportada mais próxima do público brasileiro entre as opções documentadas. | y          |
| Autoridade da execução | Local config/docs e estrutura vazia Railway, sem commit/push/deploy  | O pedido autoriza preparação; restrições do repositório limitam publicação.           | y          |

**Open questions:** none.

## User Stories

### P1: Recuperar o CI ⭐ MVP

**User Story**: Como mantenedor, quero que o workflow inicialize pnpm corretamente para que os gates do projeto possam executar.

**Why P1**: Hoje todas as execuções terminam antes do install.

**Acceptance Criteria**:

1. **BOOT-01** WHEN o job iniciar THEN o CI SHALL instalar a versão declarada de pnpm antes de configurar `cache: pnpm`.
2. **BOOT-02** WHEN as dependências estiverem instaladas THEN o CI SHALL executar migrations, format, lint, typecheck, testes, build e E2E.

**Independent Test**: Validar a ordem do workflow e executar seus gates numa cópia limpa do HEAD com a correção.

### P1: Preservar contexto operacional ⭐ MVP

**User Story**: Como próximo agente, quero uma fonte canônica para distinguir arquitetura, configuração, provisionamento e gates reais.

**Why P1**: Docs atuais misturam evidência antiga, intenção e estado externo.

**Acceptance Criteria**:

1. **BOOT-03** WHEN uma sessão nova começar THEN o repositório SHALL apontar para um mapa canônico com componentes, fluxos, comandos, riscos e fontes de estado.
2. **BOOT-04** IF uma etapa externa ainda não foi executada THEN a documentação SHALL marcá-la como pendente sem declarar homologação ou produção.

**Independent Test**: Comparar docs contra código, Git, CI e inventário Railway atuais.

### P1: Criar a estrutura Railway sem publicação ⭐ MVP

**User Story**: Como operador, quero um projeto isolado com serviços nomeados para configurar a aplicação sem um primeiro deploy prematuro.

**Why P1**: Conectar o repositório antes de variáveis, migration e domínios faz os serviços falharem em produção.

**Acceptance Criteria**:

1. **BOOT-05** WHEN o projeto for criado THEN Railway SHALL conter um projeto privado `musica-da-resenha` sem duplicar projeto existente.
2. **BOOT-06** WHEN a estrutura de aplicação for criada THEN Railway SHALL conter serviços vazios `web`, `api` e `worker` sem deployment.
3. **BOOT-07** IF Postgres ou Bucket exigirem deploy imediato THEN a execução SHALL parar antes da criação e registrar o bloqueio e o próximo passo exato.

**Independent Test**: Ler projeto, ambiente, serviços e deployments pelo MCP sem retornar valores secretos.

## Edge Cases

- IF um projeto homônimo aparecer antes da criação THEN a execução SHALL reutilizar ou parar para evitar duplicação.
- IF uma operação Railway disparar deploy inesperado THEN a execução SHALL interromper novas mutações e registrar o deployment.
- IF o worktree local divergir de `origin/main` THEN Railway SHALL usar apenas a revisão remota confirmada quando o deploy futuro for autorizado.
- IF variável secreta for lida THEN o relatório SHALL omitir seu valor e registrar somente o nome.

## Implicit-Requirement Dimensions

| Dimension                                | Resolution                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| Input validation & bounds                | Nomes exatos e projeto homônimo verificado antes da criação.                       |
| Failure / partial-failure states         | BOOT-07 e edge case de deploy inesperado.                                          |
| Idempotency / retry / duplicate handling | Releitura de projetos/serviços antes de cada create.                               |
| Auth boundaries & rate limits            | OAuth Railway; secrets nunca retornam em artefatos.                                |
| Concurrency / ordering                   | CI antes de futura publicação; recursos lidos após cada mutação.                   |
| Data lifecycle / expiry                  | Bucket depende de backup/export externo; criação bloqueada sem região.             |
| Observability                            | IDs/status sem valores secretos; gates separados.                                  |
| External-dependency failure              | Operação interrompe e documenta resposta do MCP.                                   |
| State-transition integrity               | Provisionado, configurado, deployed, homologado e comercial são estados distintos. |

## Requirement Traceability

| Requirement ID | Story        | Phase  | Status   |
| -------------- | ------------ | ------ | -------- |
| BOOT-01        | Recuperar CI | T1     | Verified |
| BOOT-02        | Recuperar CI | T1, T2 | Verified |
| BOOT-03        | Contexto     | T3     | Verified |
| BOOT-04        | Contexto     | T3, T4 | Verified |
| BOOT-05        | Railway      | T5     | Verified |
| BOOT-06        | Railway      | T6     | Verified |
| BOOT-07        | Railway      | T7     | Verified |

**Coverage:** 7 total, 7 mapped to tasks, 0 unmapped.

## Success Criteria

- [x] Workflow estruturalmente corrigido e gates reexecutados em checkout limpo.
- [x] Contexto canônico e runbooks coerentes com o código e a Railway atual.
- [x] Projeto e três serviços vazios verificáveis no MCP, sem app deployment.
- [x] Data services explicitamente criados ou bloqueados antes de deploy, sem ambiguidade.
