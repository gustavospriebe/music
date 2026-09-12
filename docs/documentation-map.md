# Mapa da documentação

O código e as migrations são a implementação; estes documentos explicam decisões e evidências, sem substituir a verificação.

| Pergunta                           | Fonte vigente                                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Produto e jornada                  | [product.md](product.md)                                                                                                                                             |
| Onde começar e fronteiras          | [project-context.md](project-context.md), [architecture.md](architecture.md)                                                                                         |
| Schema efetivo                     | `packages/database/src/schema.ts` e migrations versionadas                                                                                                           |
| Regras executáveis                 | `packages/contracts` e `packages/domain`                                                                                                                             |
| Decisões e o que está publicado    | [STATE](../.specs/STATE.md)                                                                                                                                          |
| Correções da auditoria e validação | [audit-remediation](../.specs/features/audit-remediation/spec.md)                                                                                                    |
| Ativação e homologação externa     | [external-activation](../.specs/features/external-activation/spec.md), [evidências](../.specs/features/external-activation/validation.md)                            |
| Ambiente e providers               | [provider-setup.md](provider-setup.md), [providers.md](providers.md), [railway-setup.md](railway-setup.md)                                                           |
| Operação e venda                   | [production-checklist.md](production-checklist.md), [external-activation-runbook.md](external-activation-runbook.md), [backup-and-restore.md](backup-and-restore.md) |

As outras pastas em `.specs/features` registram recortes anteriores. Seu status Complete descreve aquele recorte na época, não o produto atual ou a produção. Specs de Mercado Pago, múltiplos produtos, chamadas síncronas de letra e tentativas antigas não autorizam reintroduzir contratos removidos. Orçamentos históricos de provider não autorizam gastos novos.

Relatórios de UI, ensaios de prompts e handoffs anteriores continuam como evidência histórica. Para implementar, parta do mapa acima e confronte a alegação com consumidores, migrations, testes e refs atuais. Alterações de comportamento devem atualizar a fonte vigente; não é necessário reescrever retrospectivamente a história de cada spec.
