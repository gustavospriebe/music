# Auditoria UI/UX — Música da Resenha

**Data**: 2026-09-06  
**Superfícies**: jornada cliente, operação administrativa, desktop 1280×720 e mobile 390×844  
**Método**: Browser integrado sobre runtime local isolado, screenshots atuais inspecionados e confronto com o código  
**Diagnóstico geral**: base visual promissora e fluxo funcional, mas ainda não pronta para produção comercial ou operação diária

## Resumo executivo

A identidade visual pública já é coerente: tipografia expressiva, contraste de marca, CTA claro e bom reflow no mobile. A validação do formulário direciona o foco para o primeiro erro, o status do pedido traduz a produção em cinco etapas e não houve overflow horizontal nos viewports auditados.

O problema central é a continuidade. O formulário anuncia “Etapa 1 de 6”, a tela seguinte muda para “Etapa 2 de 5” e inicialmente oferece apenas outro botão de geração. O usuário precisa entender por que a letra ainda não existe, quanto tempo/custo essa ação envolve e o que acontece se fechar a página. A landing promete um áudio demonstrativo, mas renderiza apenas um cartão sem reprodução. O checkout apresenta preço e botão, porém quase nenhum sinal de confiança, política comercial ou segurança.

Na administração, os dados existem, mas ainda são uma projeção técnica do backend: eventos e status em inglês, história em JSON, moedas misturadas e pouca orientação para a próxima ação. Isso aumenta tempo de decisão, risco operacional e exposição desnecessária de payload pessoal.

## Jornada do cliente

### 1. Landing — saudável

![Landing desktop](../output/product-design/ui-ux-audit-2026-09-06/01-landing-desktop.jpg)

- A proposta de valor e o CTA primário aparecem antes da dobra.
- A linguagem é brasileira, direta e consistente com o produto-presente.
- O cartão “Áudio demonstrativo” não tem player, botão ou mídia; a promessa de prova social/qualidade não se concretiza. O código confirma que ele é apenas um `div` visual em `apps/web/src/pages/landing.tsx:30`.
- O catálogo tem três produtos ativos, mas a landing seleciona somente `friend_roast` em `apps/web/src/pages/landing.tsx:10`.

### 2. História e validação — funcional, com fricção

![Formulário desktop](../output/product-design/ui-ux-audit-2026-09-06/02-create-desktop.jpg)

![Validação com foco no primeiro erro](../output/product-design/ui-ux-audit-2026-09-06/03-create-validation.jpg)

- Os campos são legíveis e a validação inline move o foco para o primeiro erro.
- O CTA “Gerar minha letra” primeiro salva a história e navega; a geração real só acontece no CTA seguinte. A cópia deve refletir o comportamento, por exemplo “Salvar história e continuar”.
- O progresso é um trilho visual com rótulo genérico, não informa valor atual/máximo programaticamente (`apps/web/src/pages/public.tsx:146`).
- Nome e e-mail não têm `autocomplete`; isso aumenta esforço no mobile.
- O rascunho armazena todo o formulário em `localStorage` (`apps/web/src/hooks/use-draft.ts:22`) sem explicar na tela o dispositivo, duração ou como apagar os dados.

### 3. Preparação e revisão da letra — continuidade fraca, editor bom

![Etapa pronta para iniciar a geração](../output/product-design/ui-ux-audit-2026-09-06/04-lyrics-ready.jpg)

![Revisão de uma letra sintética local](../output/product-design/ui-ux-audit-2026-09-06/17-lyrics-review.jpg)

- A tela anterior à geração é quase vazia e não explica duração, privacidade, consumo de IA, recuperação após fechar a página ou o que será gerado.
- O salto “1 de 6” → “2 de 5” quebra a percepção de progresso.
- Depois de existir uma letra, editar, salvar uma nova versão histórica e aprovar ficam claros e próximos.
- A captura de revisão usa fixture sintética inserida no banco descartável; não prova a chamada real ao provider.

### 4. Checkout — funcional, mas sem confiança suficiente

![Checkout local sem iniciar pagamento](../output/product-design/ui-ux-audit-2026-09-06/18-checkout.jpg)

- Preço, conteúdo do pacote e provedor de pagamento estão visíveis.
- Faltam resumo do pedido, título/nome da homenagem, prazo, política de ajustes/reembolso, suporte, privacidade e indicação de redirecionamento seguro.
- O botão estava habilitado sem credencial Mercado Pago no processo isolado; o erro apareceria somente após o clique. A UI deveria conhecer a indisponibilidade operacional antes de oferecer a ação.
- O Browser não iniciou checkout nem navegou ao Mercado Pago.

### 5. Biblioteca e status — úteis, ainda genéricos

![Minhas músicas](../output/product-design/ui-ux-audit-2026-09-06/05-my-music.jpg)

![Status do pedido](../output/product-design/ui-ux-audit-2026-09-06/06-order-status.jpg)

- A ausência de cadastro e a limitação ao navegador são explicitadas com honestidade.
- O cartão deveria priorizar nome/título, ocasião, data e progresso; hoje destaca o identificador técnico.
- O trilho de cinco etapas é a melhor peça de orientação do fluxo, com ação contextual “Acompanhar letra”.
- Recuperação em novo dispositivo e suporte para perda do acesso ainda não têm caminho claro.

### 6. Termos — bloqueio de lançamento

![Termos atuais](../output/product-design/ui-ux-audit-2026-09-06/16-terms.jpg)

- A própria página informa que o texto é apenas do MVP e requer revisão jurídica.
- Prazos, reembolso, suporte e licença final ainda dependem de aprovação jurídico-comercial.
- Não se deve abrir produção comercial antes de fechar essas decisões e refletir a política no checkout.

## Jornada gerencial

### 7. Login — mínimo funcional

![Login administrativo](../output/product-design/ui-ux-audit-2026-09-06/07-admin-login.jpg)

- Formulário simples, sem distrações e com labels acessíveis.
- Falta identidade/contexto operacional, recuperação de acesso e indicação de ambiente.
- A ausência de navegação é aceitável no login, mas após autenticar não existe um shell administrativo persistente.

### 8. Visão geral — dados sem hierarquia operacional

![Dashboard administrativo](../output/product-design/ui-ux-audit-2026-09-06/08-admin-dashboard.jpg)

- Os indicadores essenciais estão presentes e respondem no local.
- Receita aparece em reais e custos em dólares sem taxa/data de referência.
- O funil imprime eventos técnicos como `order_created` e `story_saved`; deveria usar linguagem de negócio, gráfico e conversões acionáveis.
- “Pedidos” e “receita” são derivados apenas dos itens retornados na consulta atual (`apps/web/src/admin/routes.tsx:54`), enquanto a API pagina em blocos de 30 (`apps/api/src/app.ts:1296`). Isso pode produzir métricas incompletas.

### 9. Pedidos — filtro bom, operação incompleta

![Lista administrativa](../output/product-design/ui-ux-audit-2026-09-06/09-admin-orders.jpg)

- Filtros por status, produto, identificador e data cobrem o básico.
- Status ficam em inglês e em formato técnico; o operador precisa traduzir mentalmente.
- Alterar qualquer filtro já muda a chave da consulta e dispara nova busca, enquanto “Filtrar” chama outro `refetch` (`apps/web/src/admin/routes.tsx:183`). Escolher uma única interação evita tráfego e ambiguidade.
- A API devolve `page`, mas a interface não oferece paginação (`apps/web/src/api.ts:176`).
- A listagem precisa mostrar idade do pedido, cliente/homenagem e uma próxima ação ou alerta.

### 10. Detalhe — maior risco operacional e de privacidade

![Detalhe administrativo](../output/product-design/ui-ux-audit-2026-09-06/10-admin-order-detail.jpg)

![Detalhe administrativo, continuação](../output/product-design/ui-ux-audit-2026-09-06/10b-admin-order-detail-lower.jpg)

- A história completa é exibida como JSON cru (`apps/web/src/admin/routes.tsx:334`), incluindo e-mail e conteúdo pessoal. A política do projeto pede que payloads pessoais e IDs internos não sejam expostos.
- Dados precisam virar seções semânticas, com PII minimizada/mascarada e revelação justificada quando necessária para suporte.
- Letra, pagamento, custo, fila e áudio competem no mesmo plano visual; falta um resumo do estado e da próxima ação no topo.
- Ações de retry, reprodução e “Aprovar e entregar” não têm confirmação nem resumo do efeito (`apps/web/src/admin/routes.tsx:383`).
- “Aprovar e entregar” aparece por áudio, mas o texto sugere conclusão do pedido inteiro; a unidade real da ação deve ficar inequívoca.

## Mobile e acessibilidade

![Landing mobile](../output/product-design/ui-ux-audit-2026-09-06/11-mobile-landing.jpg)

![Menu mobile aberto](../output/product-design/ui-ux-audit-2026-09-06/12-mobile-menu.jpg)

![Formulário mobile](../output/product-design/ui-ux-audit-2026-09-06/13-mobile-form.jpg)

![Dashboard mobile](../output/product-design/ui-ux-audit-2026-09-06/14-mobile-admin-dashboard.jpg)

![Pedidos mobile](../output/product-design/ui-ux-audit-2026-09-06/15-mobile-admin-orders.jpg)

- Landing e formulário fazem reflow sem overflow horizontal; inputs medidos entre 46 e 50 px e menu em 44 px.
- `Escape` fecha o menu e devolve foco ao botão, o que é positivo.
- O foco não fica preso no menu: depois dos quatro links, `Tab` alcança o CTA e FAQs por trás da sobreposição. O código controla scroll/Escape, mas não `dialog`, `aria-modal`, `inert` ou focus trap (`apps/web/src/components.tsx:23`).
- O formulário vira uma rolagem longa, mas mantém agrupamento e legibilidade. Uma divisão progressiva deve evitar perda do rascunho e permitir revisão antes de avançar.
- O admin empilha sem overflow, porém seis cards antes do funil tornam a visão geral lenta; em mobile convém priorizar alertas e ações, deixando métricas secundárias recolhíveis.

Esta auditoria não certifica WCAG. Não houve teste com leitor de tela, contraste calculado, zoom extremo, redução de movimento ou aparelho físico.

## Prioridades recomendadas

| Prioridade | Problema                                  | Recomendação                                                                                        | Critério de saída                                                  |
| ---------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| P0         | Termos e política comercial incompletos   | Fechar prazo, suporte, licença, ajuste/reembolso e revisão jurídica; refletir no checkout.          | Texto aprovado e checkout consistente com a operação.              |
| P1         | Jornada 1/6 → 2/5 e dupla ação de “gerar” | Adotar um único modelo de cinco etapas, CTA fiel e uma etapa de preparação informativa.             | Usuário prevê próxima ação e estado sem contradição.               |
| P1         | Prova de qualidade ausente                | Trocar o cartão demo por player real autorizado, com duração e transcrição curta.                   | Áudio tocável, acessível e claramente identificado como demo.      |
| P1         | Checkout com baixa confiança              | Adicionar resumo, prazo, política, suporte, privacidade e estado de disponibilidade do provider.    | Decisão de compra informada antes do redirecionamento.             |
| P1         | Admin técnico e com payload pessoal       | Criar shell operacional, resumo/alertas, status humanos e detalhe sem JSON/PII desnecessária.       | Operador encontra estado, risco e próxima ação em poucos segundos. |
| P1         | Menu mobile sem contenção de foco         | Implementar padrão de disclosure/modal coerente, `inert` no fundo e ciclo de foco testado.          | Teclado não alcança conteúdo coberto; Escape restaura foco.        |
| P2         | Biblioteca pouco reconhecível             | Mostrar título/homenageado, ocasião, data e progresso; oferecer recuperação de acesso.              | Pedido reconhecível sem depender do ID.                            |
| P2         | Admin sem paginação e filtros ambíguos    | Escolher busca automática com debounce ou aplicação explícita e adicionar paginação/contagem total. | Métricas e lista não dependem dos primeiros 30 registros.          |
| P2         | Formulário e rascunho                     | Adicionar `autocomplete`, explicar persistência local e oferecer apagar rascunho.                   | Menos digitação e controle explícito dos dados locais.             |

## Direção para a remodelagem

Preservar o que já diferencia a marca — creme, coral, preto, tipografia grande e tom brasileiro — e remodelar a arquitetura de informação antes da estética. A próxima rodada deve desenhar dois sistemas coordenados:

1. um funil cliente de cinco etapas, com expectativa, confiança e recuperação em cada transição;
2. um cockpit gerencial orientado por exceções, onde alertas e próxima ação vêm antes de métricas e dados técnicos.

## Limites da evidência

- Foram usados somente dados sintéticos e banco/storage descartáveis.
- A letra de revisão foi inserida como fixture local para abrir estados posteriores sem gasto.
- Geração OpenRouter, checkout Mercado Pago, e-mail Resend, áudio, capa, entrega e download reais não foram executados.
- As screenshots antigas de `docs/audits/mvp-operavel` não foram usadas como evidência desta auditoria.
- Os 119 testes, 30 E2E e Browser audit são gates técnicos; UAT humana, homologação Railway e produção continuam separados.
