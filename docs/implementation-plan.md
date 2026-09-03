# Plano de implementação (histórico)

O plano canônico da Fase 2 agora está em [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md). Este arquivo é mantido para links existentes.

- [x] Fundação de workspace, domínio, contratos, schema e fila PostgreSQL.
- [x] API, worker, providers fake, interface pública, checkout e entrega local.
- [x] Dockerfiles multi-stage, GitHub Actions, pacotes de configuração e documentação operacional.
- [x] Nomenclatura de schema, frontend por rotas e ampliação inicial da suíte de testes/E2E.

O padrão local continua fake e sem rede. Providers reais só são selecionados por ambiente e não são validados sem chamada autorizada e bem-sucedida.
