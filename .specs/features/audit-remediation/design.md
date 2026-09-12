# Audit remediation Design

Status: Approved for local execution by the owner's audit-backlog authorization.

## Architecture Overview

Manter monólito modular. Corrigir fontes de verdade: payments controla dinheiro; productions fixa letra e artefatos; generation_jobs controla agendamento; ai_calls controla tentativa externa; ai_usage registra custo observado. A jornada pública deriva dessas fontes, sem contabilidade baseada em orders.status.

## Components

- Dados: schema/migrations0012–0014, contratos criativos e consentimentos. Owner dados.
- Pagamento: adapter estrito e coordenador transacional; tentativa persistida antes de rede; webhook e consulta periódica usam o mesmo coordenador. Owner pagamento.
- Worker: lease com renovação/fencing, chamada externa durável, produção vinculada à letra, áudio válido, e-mail separado e storage stream. Owner worker.
- API/web: erros públicos classificados, briefing e aceite, callbacks/consulta reaproveitando coordenador, operação de produção, indicadores e downloads. Owner root.
- Infra/docs/integração: PostgreSQL18 isolado, Node22, gates, runbook e documentação canônica. Owner root.

## Data Models

- payments.status: creating, unknown, pending, approved, refunded, rejected, cancelled, expired. attempt, idempotencyKey, externalReference, expiresAt, lastReconciledAt, reconcileAfter, paidAt/refundedAt. ID externo único no namespace provider; única tentativa ativa por pedido.
- productions: id, orderId, number, lyricVersionId, status queued/processing/review_required/completed/failed; provenance recorded/legacy_unverified. orders.currentProductionId e deliveries.productionId.
- audio_generations: productionId, jobId, leaseToken, attempt, selected. Histórico por (productionId,variant,attempt); uma seleção por produção/variante. Objeto usa generation ID.
- generation_jobs: leaseToken, leaseExpiresAt e lockedAt renovados; conclusão verifica token. Resultado incerto não vira chamada nova automática.
- ai_calls: id, orderId, jobId, kind, provider, model, status started/completed/failed/unknown, leaseToken, externalId, createdAt, finishedAt. ai_usage referencia chamada e distingue reported/estimated/unknown.
- order_consents: orderId, kind terms/privacy/marketing/content_rights/reference_image, policyVersion, accepted, recordedAt; referência opcional à capa.
- CreativeBrief exclui contato e aceites. Story é submissão HTTP com policyVersion explícita. Leitura antiga pode ter aceite desconhecido; não preencher true.

- email_deliveries: productionId vincula a intenção ao lançamento da produção; unicidade por pedido/produção/template, sem reescrever e-mails de revisões anteriores. Produção já liberada sempre ganha nova identidade ao revisar; a parceira tecnicamente validada pode ser reutilizada por referência com evento de origem, sem chamada paga adicional.
- lyricsContentSchema aceita texto canônico editado sem seções derivadas divergentes; generatedLyricsSchema exige a estrutura do provider. Áudio usa fullLyrics da versão fixada.
- Custo conhecido é histórico imutável. Observação tardia pode completar unknown/nulo com valor conhecido, uma única vez e com evento; resolver chamada incerta não transforma custo em zero.
- Entrega anterior permanece disponível durante revisão, pela produção completed fixada em deliveries. Reembolso, revogação e expiração continuam bloqueando acesso.

## Code Reuse Analysis

Preservar capabilities, transições válidas, fila PostgreSQL, versões de letra, adapter S3 e intenção de e-mail. order_events recebe eventos transacionais; remover password_hash e helpers sem fluxo. Migration0012 preserva dados e marca proveniência não demonstrada; nenhuma mudança em0000–0011.

## Error Handling Strategy

Erros esperados de negócio são classificados; 500 nunca publica message arbitrária. Chamada externa incerta fica unknown; o operador reconcilia antes de retry. Reembolso não regride com evento atrasado. Falha parcial não mistura versões de produção.

## Risks & Concerns

| Concern                                          | Impact               | Mitigation                                                                       |
| ------------------------------------------------ | -------------------- | -------------------------------------------------------------------------------- |
| WIP local anterior                               | Perda de trabalho    | Snapshot externo ao repo e edição incremental sem reset/stash                    |
| Migrations antigas aplicadas                     | Corrupção de lineage | Append0012–0014; teste upgrade e criação limpa; reconciliar snapshot             |
| Gateway sem garantia documentada de idempotência | Cobrança duplicada   | Uma tentativa durável; resultado unknown bloqueia recobrança                     |
| Worker antigo durante alteração de schema        | Falha de runtime     | Runbook de promoção coordenada; nenhuma alteração remota nesta execução          |
| Qualidade artística não é validade técnica       | Entrega inadequada   | Arquivo decodificável >=10s e revisão humana default                             |
| Testes existentes com fixtures antigas           | Falso sucesso        | Migrar fixtures conforme novo contrato, preservar cenários e reforçar assertions |

## Tech Decisions

Escolhida evolução incremental do agregado com produção explícita. Rejected: reescrever stack; manter slots de áudio sem origem. Uso de ffprobe/ffmpeg para verificar arquivo é dependência operacional explícita, instalada em CI/Docker. Preço/gateway final/aceite comercial permanecem decisões externas, com sistema bloqueado quando faltarem.
