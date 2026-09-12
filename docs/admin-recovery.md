> HISTÓRICO — documento anterior à remediação de 12/09/2026. Comandos, modelos, orçamento e alegações de prontidão abaixo podem estar superados e não autorizam nova execução. Use o [mapa vigente](documentation-map.md) para implementação e operação.

# Recuperar pedidos pelo painel administrativo

## Operação diária

Abra Administração → Visão geral → **Ver pedidos com falhas em etapas**. O contador e a lista filtrada incluem falhas atuais de letra, áudio, capa e aviso de entrega, inclusive em pedidos cujo áudio já foi entregue. Tentativas antigas resolvidas e pedidos cancelados ou reembolsados ficam fora dessa fila. O filtro pode ser removido na lista.

Abra o pedido desejado. O bloco **Operação do pedido** reúne as etapas, tentativas executadas/permitidas, horários, diagnóstico e ações disponíveis. Durante processamento, o detalhe se atualiza automaticamente. Uma falha de atualização mantém os últimos dados com aviso; sessão expirada oculta os dados.

Leia a causa e o próximo passo antes de confirmar. Recusa de conteúdo pede revisão editorial; saldo ou limite da chave exigem correção no provedor; autenticação exige revisar configuração. Repetir uma solicitação não corrige essas condições por si só. O painel não identifica uma palavra culpada quando o provedor não a informa.

| Etapa            | Ação                          | Efeito                                                                                                                                             |
| ---------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Letra            | Gerar letra para revisão      | Usa a história salva e o mesmo fluxo seguro do cliente, respeitando o limite de gerações.                                                          |
| Letra            | Salvar revisão                | Cria versão histórica. Antes de iniciar cobrança, devolve a revisão ao cliente; após pagamento, salva a correção aprovada para a próxima produção. |
| Áudio            | Retomar versões pendentes     | Preserva versões concluídas e produz somente o que falta.                                                                                          |
| Áudio            | Gerar uma versão novamente    | Substitui somente a faixa escolhida.                                                                                                               |
| Áudio            | Gerar as duas versões do zero | Substitui o conjunto usando a última letra aprovada.                                                                                               |
| Capa             | Retomar criação da capa       | Recupera a tentativa falhada. Se a foto original foi removida, exige novo upload e consentimento.                                                  |
| Aviso de entrega | Retomar aviso                 | Recupera apenas a notificação, usando a intenção existente; não gera áudio nem capa.                                                               |

As confirmações informam o alcance da operação e a possibilidade de custo. Alterações de letra ainda não salvas bloqueiam ações conflitantes. Durante uma ação pendente, cliques repetidos ficam bloqueados; o servidor revalida a elegibilidade sob lock, inclusive contra outras abas. Se o estado mudar, uma ação antes disponível pode ser rejeitada com motivo.

## Proteções e histórico

Áudio exige pagamento e letra aprovados. Trabalho ativo impede substituição concorrente. Cobrança em andamento bloqueia alteração de letra. Cancelamento e reembolso não podem ser contornados por retry. Um job concluído não pode ser recolocado na fila pela ação de recuperar falha.

As operações registram ator e horário nas notas administrativas. Diagnósticos anteriores relevantes ficam preservados na recuperação; detalhes exibidos são sanitizados. Uma falha histórica não significa necessariamente que o pedido continua interrompido: confira o estado atual e as tentativas posteriores.

A foto original é removida conforme a política de retenção. Se ela não existe mais, o sistema não deve silenciosamente criar uma capa apenas pelo texto. Para recuperar essa tentativa, selecione uma nova referência autorizada no próprio painel.

O aviso usa idempotência. Se já foi enviado, repetir a recuperação não duplica o envio. Acesso revogado ou expirado permanece bloqueado e exige resolver o acesso; retry não reativa links automaticamente. Limites e credenciais do provedor continuam sendo administrados na configuração apropriada, não em um formulário de secrets neste painel.

## Validação desta entrega

Validação local concluída: `pnpm check` com 289 testes, formato, lint, typecheck e build; 48 E2E; React Doctor 100/100. A verificação independente detectou as sete falhas comportamentais introduzidas propositalmente em uma cópia descartável. Resultados técnicos e rastreabilidade ficam em [validation.md](../.specs/features/admin-recovery/validation.md).

Os ensaios usam bancos descartáveis e providers controlados. No browser real, foram conferidos o contador, a lista filtrada, o diagnóstico do pedido recusado, os bloqueios de capa/e-mail e as confirmações de retomar/refazer áudio, ambas canceladas. Evidências locais em `output/admin-recovery/`. API e worker do preview foram atualizados; o pedido recusado continua com sua letra e histórico preservados. Não foram disparadas chamadas pagas para validar este painel. Nenhum commit, push ou deploy faz parte desta entrega.
