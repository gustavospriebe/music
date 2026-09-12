# Preocupações atuais do código

Referência: 2026-09-12, remediação e ativação externa. Cada item abaixo distingue desenho/código de prova externa. Gate final e publicação ficam em [STATE](../STATE.md); critérios verificáveis em [audit-remediation/spec.md](../features/audit-remediation/spec.md). Este arquivo substitui recomendações antigas de persistir contato em `leads`, mover letra ainda síncrona ou adicionar índices que já existem.

## Riscos de lançamento, não motivo para reescrever arquitetura

| Risco                                                   | Impacto / probabilidade / esforço                 | Evidência que falta                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| PIX de produção e refund real não demonstrados          | Alto / conhecido / médio                          | Homologação sandbox e reconciliação passaram; falta transação real autorizada e refund real                                      |
| Promoções futuras misturarem revisões                   | Alto / controlado por processo / baixo            | Conferir CI e três SHAs; promoção inicial conjunta e journal0000–0016 já comprovados                                             |
| Preço/textos comerciais ainda não aceitos               | Alto / conhecido / decisão do dono                | Preço positivo, políticas publicadas/versionadas e aceite antes de `COMMERCIAL_READY`                                            |
| Backup recorrente independente sem retenção configurada | Alto / incidente / médio                          | Restore pontual banco + três objetos passou; falta recorrência e destino independente                                            |
| Bounce não reconciliado automaticamente pelo app        | Alto para entrega / observado / operação inicial  | Resend confirmou delivered após correção do destinatário; monitorar devoluções no painel. Sent significa aceite, não recebimento |
| Qualidade musical não provada por arquivo válido        | Alto / inerente ao provider / operação recorrente | Audição das duas versões, letra correta; default `manual`                                                                        |

## Fronteiras implementadas e cobertas

- **Financeiro:** `packages/domain/src/payment.ts`, `packages/providers/src/payment.ts`, `packages/database/src/payment-settlement.ts`, `apps/api/src/routes/payment.ts`. Tentativa/identidade completas, uma ativa por pedido, resultado desconhecido sem recriação e settlement compartilhado. Não declarar um segundo gateway implementado sem seus quatro caminhos: criar, autenticar evento, consultar e reconciliar.
- **Produção:** `packages/database/src/schema.ts`, `apps/worker/src/audio.ts`, `apps/api/src/routes/admin-production.ts`. Produções fixam letra, áudios preservam tentativas/arquivos, seleção é por produção/variante. Legado `legacy_unverified` não comprova origem.
- **Fila e custo:** `packages/database/src/jobs.ts`, `apps/worker/src/ai-call.ts`, `apps/worker/src/lyrics.ts`. Lease/heartbeat/fencing e chamada durável antes da rede; `unknown` bloqueia repetição automática. `ai_usage` distingue informado, estimado e desconhecido. A fila não oferece exatamente uma cobrança externa.
- **Entrada e privacidade:** `packages/contracts/src/index.ts`, `packages/domain/src/index.ts`, `apps/api/src/routes/orders.ts`. Briefing criativo separado de comprador/aceites; consentimento ausente permanece desconhecido. `fullLyrics` é canônico e edição/aprovação validam conteúdo. Separação de contato não anonimiza texto livre.
- **Schema:** migrations `0012_audit_remediation.sql`, `0013_lyrics_target_version.sql` `0014_email_production.sql`, `0015_payment_environment.sql` e `0016_webhook_environment.sql`, snapshots e schema. Upgrade não inventa origem de áudio, paidAt ou consentimento. Backfill de alvo de letra exige prova da chave histórica; trabalho ativo sem prova é bloqueado para revisão. E-mail tem intenção por produção, para uma revisão não herdar indevidamente o aviso enviado anteriormente.
- **HTTP/admin:** `apps/api/src/app.ts` e `apps/api/src/routes/admin-*.ts`. Erro interno deve ser genérico com requestId; módulos administrativos agora separam autenticação, leitura, recuperação, produção, acesso e relatórios. DTO público e log não recebem parâmetros SQL, secrets ou PII.

## Limites persistentes e caminho de evolução

**Jornada não é contabilidade.** `orders.status` ainda resume etapas do cliente; cálculo de receita, cobrança e reembolso deve usar `payments`. Nova regra deve consultar a fonte própria, sem proliferar flags ou estados mistos.

**Serialização e concorrência.** Default de um worker/um job, duas faixas sequenciais. Não há capacidade comercial medida. Medir idade da fila, duração, erros/unknown, limites de provider e revisão humana antes de aumentar concorrência. `SKIP LOCKED` e índice não constituem um ensaio de carga.

**Operação unknown.** Falha depois do envio pode ter custo mesmo sem arquivo. Resolução administrativa exige nota e reconhecimento de possível custo duplicado, preservando ledger. Não usar retry para esconder ausência de reconciliação.

**Conteúdo e PII.** Filtro local e filtro probabilístico de provider não garantem segurança de todo resultado. Briefing, letra, referências e e-mails continuam dados sensíveis à operação. Não há prova de política completa de retenção/exclusão somente porque existe limpeza de fotos.

**Admin.** Senha no ambiente continua decisão explícita de um operador. `password_hash` decorativo foi removido; não afirmar que foi substituído por autenticação em banco. Rotação, sessão e acesso ao ambiente continuam responsabilidade operacional.

**Drizzle e SQL.** Não editar migrations aplicadas para fazê-las parecer geradas recentemente. Comparar schema real, constraints e ordem de colunas em FKs compostas: introspecção pode propor recriação equivalente. Snapshot sozinho não prova migração aplicada. `context.ts` continua denso; extrair somente responsabilidades concretas.

## Limites de evidência

Testes puros cobrem contratos/transições; integração com PostgreSQL cobre concorrência e invariantes nos cenários executados; E2E cobre navegação sob o ambiente preparado. `pnpm check` sem variáveis de integração pode não executar provas de banco, e não inclui por si E2E nem providers reais. Conferir resultados e skips.

Provas isoladas de upgrade/instalação limpa não alteram o PostgreSQL local existente nem o Railway. O banco local existente foi observado em 16.11 até `0011`, apesar da configuração 18 no compose/CI. Atualizar imagem não migra volume. Gate Node 22 também precisa ser executado, não inferido do Dockerfile.

Não são lacunas do produto autorizado: framework de agentes, Redis, estúdio conversacional, usuários/cadastro ou segundo gateway parcialmente implementado. Só reconsiderar com requisito e evidência novos.
