# UI Remodel Local Validation

> Registro histórico de um recorte anterior. O modelo vigente e a evidência atual estão em [docs/documentation-map.md](../../../docs/documentation-map.md) e [audit-remediation](../audit-remediation/spec.md). Este registro não autoriza publicação nem gasto com providers.

**Date**: 2026-09-06
**Feature**: `.specs/features/ui-remodel/`
**Environment**: macOS, Node v24.14.1, pnpm 12.3.4, PostgreSQL descartável (`resenha_remodel`, `resenha_remodel_test`, `resenha_qa`)
**Result**: PASS dentro dos limites abaixo

## Portas e isolamento

- Banco local existente `music-postgres-1` em `localhost:5433` foi reutilizado; nenhum container foi parado ou recriado.
- Bancos descartáveis criados para esta feature: `resenha_remodel`, `resenha_remodel_test`, `resenha_qa`.
- `resenha_remodel` e `resenha_remodel_test` receberam migrations; `resenha_remodel` recebeu seed (3 produtos ativos).
- Processos preexistentes nas portas 5175/3001 não foram encerrados; tentativa QA em 3021/5191 foi descartada em favor de Playwright + mocks.
- `apps/worker/src/worker.ts` segue com o diff preexistente (só reordenação de imports); nenhum teste desta feature o tocou.

## Gates executados

| Gate                                       | Result             | Evidence                                                                                                                                                                        |
| ------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git diff --check`                         | PASS               | sem whitespace errors                                                                                                                                                           |
| `pnpm format:check`                        | PASS               | workspace inteiro                                                                                                                                                               |
| `pnpm lint`                                | PASS               | 8 Turbo tasks                                                                                                                                                                   |
| `pnpm typecheck`                           | PASS               | 8 Turbo tasks                                                                                                                                                                   |
| `pnpm exec turbo run test --concurrency=1` | PASS               | 12 tasks: web 51, api 38, worker 20, contracts 8, domain 7, providers 3 (total 127)                                                                                             |
| `pnpm build`                               | PASS               | 8 Turbo tasks; web entry abaixo do teto                                                                                                                                         |
| `pnpm test:e2e`                            | PASS               | 34/34 Playwright (30 preexistentes + 2 QA remodel + correção menu)                                                                                                              |
| `react-doctor apps/web`                    | 84/100, 4 warnings | login sem `onSuccess`→nav coberto por rota; complexidades AdminDashboard/AdminOrders/Checkout aceitas sem decomposição nesta rodada; a11y/performance corrigidos (2 eliminados) |
| TLC `validate_spec.py`                     | PASS               | 0 errors, 0 warnings                                                                                                                                                            |
| TLC `validate_tasks.py`                    | PASS               | 0 errors, 2 warnings (`Tests: none` em T10/T11, matriz diz `none`)                                                                                                              |

## Browser QA (Playwright + mocks, sem provider real)

Arquivo: `apps/web/e2e/ui-remodel-qa.spec.ts` (2 testes, ambos PASS).

- Jornada cliente 1280×720: `progressbar` "Etapa 1 de 5", tela "Antes de criar a letra", checkout com "Resumo do pedido" e botão desabilitado com motivo.
- Mobile 390×844: `/`, `/criar` e checkout sem overflow (`scrollWidth == clientWidth`); menu abre como `dialog`, fundo com `inert`, `Escape` restaura foco.
- Admin: shell persistente, alertas primeiro com totais do servidor, lista paginada com total, detalhe sem e-mail cheio, sem ID interno e sem `externalId`.
- Navegação completa por teclado coberta pelos E2E de menu + fluxos; leitor de tela, contraste calculado além do foco, zoom extremo e aparelho físico continuam fora do escopo (mesmo limite da auditoria).

## Screenshots

Baseline preservada em `output/product-design/ui-ux-audit-2026-09-06/` (19 arquivos, intocados).
Novas evidências em `output/product-design/ui-remodel-2026-09-06/` (14 arquivos):

- `01..09`: estados E2E atualizados (landing sem demo falso, formulário, preparação, revisão, checkout com resumo, mobile).
- `10-qa-checkout.png`, `11-qa-mobile-menu.png`: jornada QA.
- `12-qa-admin.png`, `13-qa-admin-orders.png`, `14-qa-admin-detail.png`: cockpit QA.
- Todas foram reabertas e inspecionadas visualmente nesta sessão (checkout, preparação, menu mobile, dashboard, lista, detalhe).

## Contadores finais

- `resenha_remodel`: `orders=0`, `ai_usage=0`, `payments=0`, `generation_jobs=0` (suítes usam `resenha_remodel_test` com truncate; QA usa mocks).
- Nenhuma chamada a OpenRouter, Mercado Pago, Resend ou S3 foi feita; nenhum clique real em geração paga, pagamento, rebuild, entrega ou envio ocorreu.

## Limites

- Testes locais + Browser QA com mocks; CI remoto, providers reais, Railway, homologação, UAT humana e produção seguem gates separados e não validados aqui.
- Texto jurídico/comercial continua pendente; lançamento comercial segue bloqueado.
