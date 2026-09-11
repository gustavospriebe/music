# Operação e recuperação de pedidos

## Problem Statement

O administrador identifica falhas e resolve letra, áudio, capa e aviso de entrega pelo painel. Ações disponíveis refletem regras do servidor e não dependem de alterações manuais no banco. Escopo autorizado pelo pedido do usuário; trabalho local, sem commit/push/deploy ou chamadas pagas de teste nesta entrega.

## User Stories

Como administrador, quero entender a falha e retomar a etapa correta para resolver o pedido sem terminal e sem refazer trabalho válido.

Como cliente, quero preservar minha letra, pagamento e arquivos prontos durante a recuperação administrativa.

## Assumptions & Open Questions

O admin existente é o operador autorizado. PostgreSQL, fila, transições e histórico atuais continuam sendo a fonte de verdade. Pagamento aprovado inclui confirmação local de desenvolvimento. Não há decisão pendente para executar o escopo local; novo aceite humano e homologação externa são gates separados.

## Out of Scope

Deploy, alteração de secrets/preços, reembolso, aprovação artística automática e retomada forçada de trabalho ainda em execução.

## Critérios de aceite

- **OPS-01**: WHEN o admin consultar o resumo ou a lista de pedidos THEN SHALL encontrar contador e filtro de falhas atuais, incluindo capa e notificação em pedidos entregues, sem contar falhas históricas já resolvidas. WHEN abrir um pedido THEN a interface SHALL mostrar estado das etapas, tentativas, horários, causas e próximos passos, com atualização durante trabalho ativo. Erros técnicos seguros ficam em detalhes. Cada ação administrativa de recuperação SHALL registrar ator e horário no histórico existente, preservando diagnóstico anterior relevante sem secrets.
- **OPS-02**: WHEN o admin solicitar retry de um job THEN a API SHALL aceitar somente falha elegível sob lock, retornar404 para inexistente e409 para estado incompatível ou processamento concorrente, preservar contadores e limitar tentativas. Ações indisponíveis SHALL informar o motivo e nenhuma ação SHALL roubar lock de worker ativo.
- **OPS-03**: WHEN o admin retomar áudio THEN o sistema SHALL preservar variantes concluídas e processar somente faltantes. WHEN solicitar regeneração explícita THEN SHALL refazer somente a variante selecionada ou as duas conforme a ação. A API SHALL exigir pagamento aprovado, letra aprovada e ausência de job ativo; a UI SHALL explicar substituição e possibilidade de novo custo antes da confirmação.
- **OPS-04**: WHEN a letra falhar ou exigir correção THEN o admin SHALL poder gerar pelo mesmo fluxo seguro do cliente ou salvar edição histórica. Antes do pagamento, a edição SHALL retornar a lyrics_ready sem aprovação administrativa implícita; depois do pagamento, a correção SHALL preservar histórico e ser usada na produção subsequente. Jobs ativos SHALL impedir edição conflitante. Geração SHALL manter limite de quatro, segurança e privacidade.
- **OPS-05**: WHEN uma capa falhar THEN retry SHALL restaurar a tentativa ao estado processável. WHEN houve referência mas ela foi removida THEN o admin SHALL reenviar foto com consentimento antes do retry; o worker SHALL rejeitar ausência da referência esperada sem gerar silenciosamente só por texto. Upload inválido SHALL falhar sem perder a tentativa. Capa concluída não é retry de falha.
- **OPS-06**: WHEN o aviso de entrega precisar de recuperação THEN o admin SHALL poder retomar somente a notificação, sem regenerar áudio. A intenção e idempotência existentes SHALL ser preservadas; envio já concluído SHALL ser sem efeito, acesso revogado/expirado SHALL permanecer bloqueado e jobs concorrentes SHALL ser impedidos. A interface SHALL distinguir falha no aviso de falha no áudio.
- **OPS-07**: WHEN o admin executar qualquer ação THEN a UI SHALL apresentar confirmação de impacto, estado pendente e resultado/erro, sem duplicar operações por cliques repetidos. Testes de rota/worker SHALL verificar efeitos no banco isolado; testes de UI e browser SHALL verificar diagnóstico, ações e atualização, sem confundir mocks com provider real.

## Decisões e limites

PostgreSQL continua como fila, locks e histórico. Providers, credenciais, preços e letras/capas atuais não mudam durante os testes. O histórico existente de notas administrativas registra recuperação. DTO recovery explicita capabilities e motivos, validados novamente em cada endpoint; o frontend não decide regras financeiras. Retomada de foto removida requer novo upload, sem mudança automática para criação sem foto. Não há reembolso automático, novo painel de configuração de secrets, retomada forçada de locks em execução ou garantia artística.

Letra já aprovada, mas com cobrança ainda não iniciada, pode receber edição e voltar a lyrics_ready para nova aprovação do cliente. Em payment_pending, edição e nova geração ficam bloqueadas para evitar disputa com confirmação externa. Campos de erros em jobs, capas, notificações e aiUsage são sanitizados no servidor; detalhes técnicos preservam apenas diagnóstico seguro, sem payloads do provedor ou segredos.

## Arquivos e responsabilidades

Backend: apps/api/src/app.ts, helpers e testes de recuperação; apps/worker/src/worker.ts e testes; contracts/domain somente quando necessários às transições e schemas HTTP. Frontend: apps/web/src/admin, api.ts, tipos e testes unit/E2E associados. Principal: especificação, documentação, browser e integração. Verificador independente: leitura, gates isolados, sensor e validation.md.

## Validação

Vitest/fastify.inject e worker com PostgreSQL descartável. Testes derivam dos efeitos acima: histórico preservado, ausência de duplicidade/cobrança indevida, estados recuperáveis e referências obrigatórias. Formato, lint, typecheck, build, React Doctor e browser pertinentes. Falhas antigas de CI e Railway sem deployment permanecem gates externos separados.

## Requirement Traceability

| Requirement | Tasks      | Evidence                             |
| ----------- | ---------- | ------------------------------------ |
| OPS-01      | T1, T6, T7 | API, UI e histórico                  |
| OPS-02      | T2, T7     | Retry transacional                   |
| OPS-03      | T2, T7     | Escopo de áudio e gates              |
| OPS-04      | T3, T7     | Geração e edição de letra            |
| OPS-05      | T4, T7     | Capa e referência                    |
| OPS-06      | T5, T7     | Aviso de entrega idempotente         |
| OPS-07      | T6, T7     | Interface e verificação independente |
