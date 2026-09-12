# Contexto canônico — Música da Resenha

Data de referência: 2026-09-12. Este documento descreve o desenho do código local em correção pela entrega `audit-remediation`; não certifica publicação, produção ou aceite comercial. Consulte [.specs/STATE.md](../.specs/STATE.md) para refs, execuções e evidências datadas. Uma spec ou este documento é uma alegação a conferir no código e no ambiente.

## Produto

Um produto vivo, `custom_song`: história/ideia livre → letra gerada, editável e refinável → aprovação → checkout PIX → duas versões de áudio da letra aprovada → revisão humana → entrega privada por link e e-mail. Capa é opcional e paralela; sua falha não deve bloquear a música. Não há cadastro. A lista “Minhas músicas” depende deste navegador; o link de entrega concede visualização, não edição do pedido.

Preço e regras comerciais pertencem ao servidor. `products.price_cents` é o preço vigente; `orders.price_cents` é o snapshot da criação. Zero significa preço indefinido para cobrança real. O dono ainda precisa escolher preço, aprovar/publicar condições e homologar pagamento de produção.

## Mapa do código

| Fronteira            | Responsabilidade e entrada                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`           | Jornada pública e administração; consome contratos e configuração sanitizada.                                                                         |
| `apps/api`           | Fastify: HTTP, cookies/capabilities, validação, enqueue, checkout/webhook e downloads privados. Rotas administrativas separadas por responsabilidade. |
| `apps/worker`        | Processo contínuo: fila, reconciliação financeira, letra, áudio, capa e e-mail.                                                                       |
| `packages/contracts` | Zod: entrada do formulário, `CreativeBrief`, leitura sem aceite inventado, letra e payloads de jobs.                                                  |
| `packages/domain`    | Transições, identidade/monotonicidade de pagamento, texto canônico, validação, prompts, tokens e erros seguros.                                       |
| `packages/database`  | Schema Drizzle, migrations, fila com lease e settlement financeiro transacional.                                                                      |
| `packages/providers` | Adapters de pagamento, letra, armazenamento e e-mail; rede específica de áudio/capa continua no worker.                                               |

Não há Redis, framework de agentes nem fila externa. PostgreSQL guarda dados e jobs. `fetch` pontual + validação + histórico de chamadas é suficiente para o fluxo atual; nenhuma necessidade presente justifica outro runtime de IA.

## Invariantes que importam

- `Story` é uma submissão HTTP composta. `story_sessions.data` guarda `CreativeBrief`; `order_contacts` guarda contato; `order_consents` guarda finalidade, versão e instante. O briefing livre ainda pode conter dados pessoais sobre o homenageado. Separar contato não o torna anônimo.
- `fullLyrics` é o texto canônico. Se as seções deixarem de representar esse texto numa edição, são esvaziadas. A resposta do gerador tem contrato estrutural mais exigente que uma edição livre.
- Cada produção fixa `lyric_version_id`. Áudios têm histórico por produção/variante/tentativa, arquivo exclusivo e seleção explícita. Entrega aponta para a produção liberada.
- Estado do pedido descreve a jornada; não é livro financeiro. `payments` registra tentativas e dinheiro, incluindo `unknown` e `refunded`. Webhook e reconciliação aplicam o mesmo settlement.
- O worker registra `ai_calls` antes da chamada externa e condiciona efeitos ao lease. Resultado desconhecido exige reconciliação/revisão explícita; timeout não autoriza pagar outra chamada automaticamente.
- `ai_usage.cost_source` distingue informado, estimado e desconhecido. `null` não é custo zero; falta de histórico não comprova ausência de gasto.
- Revisão padrão é `AUDIO_REVIEW_MODE=manual`. `automatic_release` é liberação sem audição, não uma avaliação artística automática. O antigo valor `automatic` foi removido.
- Tokens ficam como hash; cookies são assinados e HttpOnly. Downloads passam pela API. Admin único usa `ADMIN_EMAIL`/`ADMIN_PASSWORD` do ambiente por decisão do dono; não há coluna de senha decorativa no schema novo.

## Código local, Git e Railway são provas diferentes

A auditoria encontrou trabalho local não publicado e catálogo remoto ainda incompatível com produto único. O projeto Railway conhecido é **`musica`**, com `web`, `api`, `worker`, `Postgres` e `Bucket`. Não usar o nome histórico `musica-da-resenha` como alvo de operação.

A leitura do banco local existente confirmou PostgreSQL 16.11 e migrations até `0011`; trocar a imagem do compose não atualiza um volume existente. A entrega usa PostgreSQL 18 isolado para validar as migrations `0012` a `0014`. Isso não aplica migrations ao banco existente nem ao Railway. O schema remoto não foi comprovado nesta auditoria; disponibilidade HTTP e catálogo não substituem inspeção do journal/schema.

`0012` registra produção, tentativas financeiras, consentimentos, leases e chamadas de IA. Histórico sem origem comprovável recebe `legacy_unverified`, sem adivinhar letra ou aceite. `0013` recupera o alvo de jobs de letra apenas quando a chave histórica comprova a versão; jobs ativos sem prova ficam bloqueados. `0014` vincula a intenção de e-mail à produção para permitir avisos de uma revisão sem repetir o aviso anterior. Migrations já aplicadas são imutáveis.

## Evidência e operação

`pnpm check` reúne format, lint, typecheck, testes e build; E2E é um gate separado. Só um resultado executado na revisão correspondente comprova o gate. O contrato de runtime é Node 22 e pnpm 12.3.4; CI e testes de banco devem usar PostgreSQL 18. Gates finais desta entrega ficam na sua validação, não presumidos aqui.

Nenhum teste sintético comprova PIX real, envio no Railway, qualidade artística, custo integral de produção ou restore do bucket de produção. A aplicação deve continuar comercialmente indisponível até os aceites externos. Não herdar autorizações antigas de crédito, publicação ou deploy de handoffs.

## Ordem de leitura

1. Este contexto e [.specs/STATE.md](../.specs/STATE.md).
2. [Arquitetura](architecture.md), [produto](product.md), schema e migrations.
3. [Preocupações atuais](../.specs/codebase/CONCERNS.md) e [evolução](evolucao-mvp.md).
4. [Configuração de providers](provider-setup.md), [contratos dos providers](providers.md), [checklist de produção](production-checklist.md) e [runbook externo](external-activation-runbook.md).
5. [Spec da correção](../.specs/features/audit-remediation/spec.md) e sua validação para distinguir implementado, testado e pendente.

`docs/handoff-mvp-launch.md` está arquivado. Specs antigas de três produtos/Mercado Pago são história, não contrato para novos consumidores.
