# Evolução do MVP — decisões, diagnóstico e plano

> Documento vivo. Toda decisão do dono e toda sugestão priorizada entra aqui antes de virar código.

## 1. Decisões registradas (dono)

| #   | Decisão                                                                                                                                                                                                          | Data               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1   | Admin via `ADMIN_EMAIL`/`ADMIN_PASSWORD` em plaintext no `.env` (sem hash; não "consertar")                                                                                                                      | handoff 03/09/2026 |
| 2   | Sem modo fake de providers (removido por decisão); fora de produção, fallback local: pagamento dev + e-mail em `var/emails`; produção exige chaves                                                               | handoff 03/09/2026 |
| 3   | Contenção interna de gasto removida em 04/09/2026 (gastar com juízo, sem estourar); o limite do provider (US$ 25 na key, via `GET /key`) segue existindo e é monitorado no painel                                | 04/09/2026         |
| 4   | GitHub criado pelo dono (`gustavospriebe/music`); commits por conta dele                                                                                                                                         | 04/09/2026         |
| 5   | Pagamento (MP) e e-mail (Resend) reais **depois** do produto funcional; primeiro: funil, dados, admin                                                                                                            | 04/09/2026         |
| 6   | Sem cadastro para criar música (zero fricção); acesso via navegador do usuário                                                                                                                                   | 04/09/2026         |
| 7   | Correção excepcional 04/09: pedido `X6NUN8uFT8YpsPRm` voltou `delivered→audio_generating` via SQL direto para completar a prova de custo (sem caminho de domínio para isso; caminho correto seria rebuild admin) | 04/09/2026         |

## 2. Custo real medido (pedido `X6NUN8uFT8YpsPRm`, 04/09/2026)

| Etapa                              | Modelo                          | Custo                                         |
| ---------------------------------- | ------------------------------- | --------------------------------------------- |
| Letra (419 in / 1068 out, 7,9s)    | `google/gemini-3-flash-preview` | US$ 0,003414                                  |
| Áudio v1 (343 in / 290 out, 27,5s) | `google/lyria-3-pro-preview`    | US$ 0,08                                      |
| Áudio v2                           | idem                            | US$ 0,08                                      |
| **Total por venda**                |                                 | **US$ 0,163414 (~R$ 0,89 / R$ 49,90 ≈ 1,8%)** |

Key em 04/09: US$ 21,59 usados de US$ 25. Prova controlada: 1 variante por execução (`variants` injetável), job com `maxAttempts: 1` e `run_at` futuro para o worker dev não reivindicar; execução parcial nunca entrega (só o par 1+2 fecha a venda — teste cobre).

## 3. Por que custos antigos zerados e fails de áudio

- `ai_usage` nasceu em 03/09/2026: pedidos anteriores não têm linhas (o `usage` era descartado). Zeros antigos são esperados, não bug; sem backfill possível.
- Filtro Lyria é probabilístico (sem determinismo alegado); `PROHIBITED_CONTENT` agora é terminal após 2 sings (era 5×6=30 queimas). Falha esgotada/terminal vira `failed` por `assertTransition` + evento `failed` no funil; admin reedita e reconstrói, usuário vê explicação sem custo extra.

## 4. Bancos: um servidor, dois databases

Um PostgreSQL (`:5433`), dois databases: `resenha` (dev/prova) e `resenha_test` (suíte automatizada). Padrão CI/dev — nunca misturar. Migrations aplicam nos dois (`pnpm db:migrate` + `DATABASE_URL=..._test pnpm db:migrate`).

## 5. Diagnóstico: app enxuta? O que falta para MVP

Núcleo enxuto e correto (contratos, domínio, fila, providers). Falta, por escolha (pagamento/e-mail depois):

1. **Funil e comportamento** — ENTREGUE (§6.A).
2. **"Minhas músicas" sem cadastro**: ENTREGUE (localStorage + `/minhas-musicas`).
3. **Admin com indicadores** — ENTREGUE 04/09/2026: lista com status/produto/busca publicId/período (`adminOrdersQuerySchema`, status inválido é 400; período = dia corrido `America/Sao_Paulo` convertido para UTC, persistência segue UTC); cards de entregues/pagos com % de entrega (funil 30d) e bloqueios do filtro (7d, `blocked` diário no summary).
4. **P1 produto** — ENTREGUE 04/09/2026: aprovar letra envia o texto atual só se mudou (sem edição → aprova a versão existente, sem `edited` espúria; com edição → nova versão aprovada na mesma transação); admin com botão "Aprovar e entregar" em `review_required` (só com par 1+2 `completed` com asset — parcial é 400; enfileira job `deliver-notify` para o worker enviar o e-mail com o link privado); checkout mostra `priceCents` do servidor; recovery via link de entrega (`POST /deliveries/:token/access` → cookie `order_view_*` só-leitura, sem story/PII, sem mutações).
5. Termos/privacidade reais (jurídico), credenciais MP/Resend, `PAYMENT_MODE` (desenho pronto).

## 6. Planos propostos (aguardando ordem do dono)

### A. Funil analytics — ENTREGUE 04/09/2026

- `analytics_events`: `visitor_id` (UUID, sem PII) + índices (migration 0003).
- Beacon público `POST /analytics/beacon` (whitelist `landing_view`/`form_started`/`form_completed`, limite 60/min, best-effort); web dispara nos 3 pontos.
- Eventos server-side: `order_created` (+visitor), `story_saved`, `lyrics_generated`, `lyrics_approved`, `checkout_started` (só em criação nova), `paid` (webhook+dev), `delivered` (admin+worker).
- Admin: `GET /admin/analytics/funnel` (visitantes pré-pedido, etapas com conversão, custo exato por venda) + seção no dashboard.
- Achado crítico no caminho: rate limits por rota **não disparavam** (`void app.register` antes das rotas; hooks `onRoute` perdidos) — `buildApp` virou async, callers migrados, 429 provado em teste. Valia também para o 5/h de letra e 5/15min de login.
- Worker dev com código novo processou jobs antigos pendentes: 30 sings bloqueados (grátis) + 2 pedidos esgotados → `failed` (comportamento correto; eram dados de teste).
- Privacidade: só `publicId` + etapa; nada de história/letra nos eventos.

### B. Minhas músicas (localStorage + lookup) — ENTREGUE 04/09/2026

- Web guarda `resenha:my-orders: [publicId, ...]` (cap 20, dedupe, sem quebrar em modo privado) a cada criação; página `/minhas-musicas` lista status de cada um via `GET /orders/:publicId`. Sem endpoint novo (reuso do DTO público; sem PII extra).
- Cookie ausente (outro aparelho/dados limpos) → 401 por item vira card "disponível só neste navegador/dispositivo" com link para tentar abrir mesmo assim.
- Sem conta, sem senha; em aparelho novo, perde (limitação assumida e documentada no README).

### C. Admin indicadores (completar)

- Cards: taxa de entrega, bloqueios/semana, ticket custo/venda, funil resumido; filtro por período + status na lista (hoje sem filtro/busca).

## 7. Sugestões aplicadas desta sessão (rastreabilidade)

Segurança da borda (DTOs públicos, cookie em mutações, versão por número, download por variante com gate, logs por template) + `ai_usage` + painel de custo + funil analytics + testes (API 22, worker 10, e2e 5). Detalhes de auditoria: relatórios de sessão anteriores.
