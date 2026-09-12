> HISTÓRICO — documento anterior à remediação de 12/09/2026. Comandos, modelos, orçamento e alegações de prontidão abaixo podem estar superados e não autorizam nova execução. Use o [mapa vigente](documentation-map.md) para implementação e operação.

# Plano de implementação (histórico)

O plano canônico da Fase 2 agora está em [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md). Este arquivo é mantido para links existentes.

- [x] Fundação de workspace, domínio, contratos, schema e fila PostgreSQL.
- [x] API, worker, adapters de provider, interface pública, checkout e entrega local.
- [x] Dockerfiles multi-stage, GitHub Actions, pacotes de configuração e documentação operacional.
- [x] Nomenclatura de schema, frontend por rotas e ampliação inicial da suíte de testes/E2E.

O modo fake foi removido. Fora de produção, somente pagamento e e-mail possuem fallback local; geração de letra/áudio usa OpenRouter quando o fluxo real é executado. Testes injetam providers controlados e não provam a rede. Uma integração real só é declarada validada quando há chamada autorizada e bem-sucedida registrada.
