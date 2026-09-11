# Plano de implementação — Fase 2

Fonte de verdade: [docs/mvp-spec-full.md](docs/mvp-spec-full.md).

- [x] Fundação Turborepo/pnpm, domínio, contratos, Drizzle e fila PostgreSQL.
- [x] Fluxo local de sessão, letra, pedido, pagamento, worker e entrega com providers controlados em teste.
- [x] Preparação de infraestrutura: Dockerfiles multi-stage não-root, health checks e workflow de CI.
- [ ] Infraestrutura externa: provisionar/validar Railway, migration, seed, bucket e restore.
- [x] Pacotes de fronteira `providers`, `config`, `eslint-config` e `typescript-config` criados.
- [x] Documentação operacional, providers e checklist de produção.
- [x] Migração de nomenclatura de schema, reorganização por rotas e suíte de regressão/E2E.

Decisão permanente: não há modo fake de provider. Fora de produção, pagamento e e-mail têm fallback local; geração de letra/áudio exige OpenRouter. Testes injetam providers controlados e não validam a rede. Uma integração real só é considerada validada após chamada autorizada e bem-sucedida.
