# Plano de implementação — Fase 2

Fonte de verdade: [docs/mvp-spec-full.md](docs/mvp-spec-full.md).

- [x] Fundação Turborepo/pnpm, domínio, contratos, Drizzle e fila PostgreSQL.
- [x] Fluxo fake local de sessão, letra, pedido, pagamento, worker e entrega.
- [x] Infraestrutura de produção: Dockerfiles multi-stage não-root, health checks e CI.
- [x] Pacotes de fronteira `providers`, `config`, `eslint-config` e `typescript-config` criados.
- [x] Documentação operacional, providers e checklist de produção.
- [x] Migração de nomenclatura de schema, reorganização por rotas e suíte de regressão/E2E.

Decisão permanente: adapters reais existem somente por configuração e não são considerados validados sem uma chamada autorizada e bem-sucedida. Localmente, todos os providers devem permanecer fake.
