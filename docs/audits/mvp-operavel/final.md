# Auditoria final — MVP operável

Data: 2026-09-04. Escopo: jornada pública, borda HTTP, retomada assíncrona e operação local.

## Veredito

**PASS local.** Todos os P0/P1 da auditoria inicial têm implementação e teste direto. A jornada agora bloqueia estados inválidos, retoma criação e geração sem duplicar efeitos, usa capabilities assinadas e mantém título, ação e progresso visíveis em desktop e mobile. Nenhum provider pago foi chamado e nenhum deploy foi feito nesta validação.

## Comparação visual

As imagens usam os mesmos estados e viewports do baseline. A comparação foi feita lado a lado em Chromium antes deste veredito.

| Estado              | Antes                                                  | Depois                                                 | Resultado                                                                         |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Entrada 1280 × 720  | ![Entrada antes](before/01-entrada-desktop.png)        | ![Entrada depois](after/01-entrada-desktop.png)        | Identidade preservada; display ganhou espaçamento e line-height legíveis.         |
| Produção 1280 × 720 | ![Produção antes](before/09-processamento-desktop.png) | ![Produção depois](after/09-processamento-desktop.png) | Rota abre no topo; título, mensagem e faixa de cinco etapas cabem na viewport.    |
| Entrada 390 × 844   | ![Mobile antes](before/13-entrada-mobile.png)          | ![Mobile depois](after/13-entrada-mobile.png)          | Sem overflow ou CTA cortado; alvo primário mede ao menos 44 × 44 px.              |
| Menu 390 × 844      | ![Menu antes](before/14-menu-mobile.png)               | ![Menu depois](after/14-menu-mobile.png)               | Menu ocupa largura útil, mantém alvos grandes e deixa o estado aberto inequívoco. |

## Fechamento dos achados

| ID      | Pri. | Estado  | Evidência de fechamento                                                                                 |
| ------- | ---- | ------- | ------------------------------------------------------------------------------------------------------- |
| AUD-001 | P0   | Fechado | Produtos usam projeção pública estrita e teste rejeita UUID/timestamps.                                 |
| AUD-002 | P0   | Fechado | Checkout omite payment UUID; confirmação dev usa `publicId` e cookie assinado.                          |
| AUD-014 | P0   | Fechado | Cookies de pedido/visualização são assinados; marcador literal recebe 401.                              |
| AUD-003 | P1   | Fechado | `RouteFocus` foca o `main` e rola ao topo em toda mudança de pathname.                                  |
| AUD-004 | P1   | Fechado | Claim condicional permite uma chamada de letra; concorrente recebe 409 e claim velho pode ser retomado. |
| AUD-005 | P1   | Fechado | `lyrics_generating` mostra status vivo e faz polling; reload não envia POST.                            |
| AUD-006 | P1   | Fechado | UUID da tentativa sobrevive à falha parcial; hash único reutiliza pedido/evento.                        |
| AUD-007 | P1   | Fechado | Display usa Bricolage Grotesque, tracking moderado e line-height mínimo de 1.05.                        |
| AUD-008 | P1   | Fechado | Erros e status têm regiões semânticas; menu expõe nome/expansão, Escape e retorno de foco.              |
| AUD-009 | P1   | Fechado | União fechada cobre 15 estados; ausente/futuro vira inconsistência sem CTA de mutação.                  |
| AUD-010 | P1   | Fechado | Falha de letra oferece retry; falha paga orienta acompanhamento sem prometer regeneração automática.    |
| AUD-011 | P1   | Fechado | Landing e checkout usam centavos da API; falha do catálogo não inventa preço.                           |

## Backlog após o fechamento

1. **P2 — chunk público:** o build gera bundle inicial de cerca de 671 kB (192 kB gzip). Admin já é lazy; separar o módulo público pesado fica fora do caminho crítico.
2. **P2 — capa por IA:** [pesquisa e desenho de custo/privacidade](../../album-cover-backlog.md) aprovados para piloto, sem implementação ou chamada paga neste ciclo.
3. **P2 — jurídico/operação externa:** termos, privacidade, sandbox Mercado Pago, Resend, storage privado gerenciado e restore continuam pré-requisitos de produção.
4. **P2 — manutenção React:** React Doctor ficou em 71/100 com três avisos de complexidade e um falso positivo de invalidação após create+navigate; a varredura focada em design retornou zero achados.
5. **P2 — Fastify 6:** migrar `disableRequestLogging` para o novo `logController` antes do upgrade principal.

## Limites da prova

Playwright valida Chromium, teclado, reduced motion e os dois viewports definidos. API e worker usam PostgreSQL real e providers controlados. Compatibilidade com outros browsers, leitor de tela real, chamadas externas e produção não foram declaradas validadas.
