# Prompt para retomar em outro chat

Continue o desenvolvimento do projeto em:

`/home/gustavo/projects/music`

Você tem permissão full access para ler, criar, editar arquivos, instalar dependências, subir Docker/PostgreSQL, executar migrations, testes, build e E2E. Não faça deploy, commit/push, compras ou chamadas pagas reais sem confirmação explícita.

## Objetivo

Entregar o MVP completo “Música da Resenha”: aplicação brasileira de músicas personalizadas por IA, com React/Vite, Fastify, worker PostgreSQL, providers fake locais completos e adapters reais preparados/documentados para OpenRouter, Mercado Pago, Resend e S3.

A especificação integral original está em:

`/home/gustavo/.codex/attachments/3226c6de-7c6d-4eae-9560-fd2aa239da7d/pasted-text-1.txt`

Leia-a inteira antes de continuar. Ela é a fonte de verdade para requisitos, arquitetura, testes e Definition of Done.

## Estado atual

O repositório foi iniciado, mas está incompleto.

Já existem:

- Configuração inicial pnpm workspace/Turborepo/TypeScript/ESLint/Prettier.
- `apps/api`, `apps/worker`, `packages/contracts`, `packages/domain`, `packages/database`.
- `.env.example`, Docker Compose e documentação inicial.
- Providers fake de letra e geração local de WAV no worker.
- Parte das rotas Fastify.
- Documentação: `README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/product.md`, `docs/providers.md`, `docs/runbook.md` e `docs/implementation-plan.md`.
- Um subagente pode ter começado `apps/web`; inspecione o estado real antes de editar.

Importante: não há repositório Git inicializado nessa pasta.

## Problema conhecido

`pnpm install` foi concluído usando `pnpm` diretamente. `corepack pnpm` usa versão incorreta neste ambiente; prefira:

```sh
pnpm install
pnpm typecheck
```

O typecheck estava falhando em `apps/api/src/providers.ts` com `TS1005: ',' expected`. Corrija isso primeiro e depois execute todas as validações. Também foi adicionado `@types/node` ao `packages/domain`.

## Segurança e IA

Não versione nem exiba chaves. Uma chave Gemini foi compartilhada no chat anterior, portanto trate-a como exposta e recomende rotação. Ela não foi salva em `.env`.

Não use essa chave para chamadas pagas ou geração real sem necessidade explícita. OpenRouter requer chave própria; chave Gemini não é compatível com OpenRouter.

Os adapters reais devem existir e ser documentados, mas só podem ser declarados “validados” após chamada real autorizada e bem-sucedida.

## Como trabalhar

1. Inspecione o estado atual antes de modificar arquivos.
2. Atualize `docs/implementation-plan.md` conforme as fases forem concluídas.
3. Use subagentes para tarefas independentes, sem edições concorrentes nos mesmos arquivos.
4. Priorize o fluxo local fake completamente funcional: landing, formulário adaptativo com autosave, geração/edição/aprovação de letra, checkout fake, pagamento idempotente, worker PostgreSQL, duas WAVs locais, entrega privada, e-mail console e administração.
5. Implemente adapters reais seguindo documentação oficial atual, sem inventar contratos.
6. Crie migrations reproduzíveis e seed idempotente.
7. Implemente testes unitários, integração com PostgreSQL real, frontend e Playwright E2E.
8. Crie GitHub Actions sem deploy.
9. Rode e corrija `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` e `pnpm test:e2e`.
10. Não finalize até auditar todos os itens do Definition of Done da especificação original.

Ao terminar, entregue relatório factual: arquivos criados, decisões, comandos executados, resultados das validações, URLs locais, credenciais apenas de desenvolvimento, variáveis necessárias, providers realmente validados e limitações restantes.
