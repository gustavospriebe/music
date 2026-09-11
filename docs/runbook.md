# Runbook operacional

## Job preso ou falha de provider

Confira `generation_jobs`: jobs em `processing` além de `JOB_LOCK_TIMEOUT_MS` devem voltar a `pending`; jobs transitórios recebem backoff exponencial e no máximo três tentativas. Reprocesse pelo endpoint administrativo somente após verificar o erro sanitizado. Não reexecute um job concluído.

Falha de letra antes do pagamento é retomada pelo próprio comprador em “Tentar gerar novamente”. O claim novo só entra após o estado `failed` ou após cinco minutos sem atualização em `lyrics_generating`. Falha de áudio depois do pagamento não dispara regeneração no browser: confira tentativas e custo, corrija a letra se necessário e use o rebuild administrativo uma vez. O pedido e as duas variantes existentes continuam sendo a fonte de verdade.

Nunca altere status com SQL em operação normal. Use apenas handlers que chamam `assertTransition`; eventos, versões de letra e tentativas permanecem históricos.

## Pagamento confirmado sem geração

Valide o pagamento junto ao provider habilitado, conferindo referência, valor e moeda. Reenvie a notificação pelo mecanismo do provider ou investigue o evento falho: o webhook permite retry e confirma pagamento + job na mesma transação. Não marque pagamento por SQL nem use retorno do navegador como comprovante. Não repita checkout de pedido já pago.

## Token de cliente

No detalhe administrativo, use a ação de revogar acesso e confirme seu efeito. Ela invalida cookies antigos e links de entrega antigos. Não prometa que o mesmo link volta a funcionar; uma nova entrega deve seguir o fluxo administrativo existente e sua revisão. O endpoint de recuperação troca o token por cookie de visualização assinado e não concede acesso ao formulário nem a mutações. Nunca coloque token, cookie ou URL concreta de entrega em logs, analytics ou histórico administrativo.

## Armazenamento e backup

Assets são privados. Em desenvolvimento, `var/storage` é descartável; produção exige S3 compatível privado. O worker remove referências ao encerrar cada tentativa e um safety net limpa órfãs com mais de sete dias. Não apague capas/áudios ou registros financeiros por esse processo. Faça backup versionado do PostgreSQL e do bucket, execute o restore drill isolado e aplique política de retenção/anonimização aprovada juridicamente.

Procedimentos externos e restore: [external-activation-runbook.md](external-activation-runbook.md). Sem evidência anexada, registre **EXTERNAL BLOCKED**; não transforme “adapter implementado” em “provider homologado”.

## Observabilidade mínima

HTTP registra request ID, template de rota, status e duração. Worker registra tipo do job, status, tentativa e duração, sem UUID interno. O ledger de IA guarda provider/modelo e custo sob acesso administrativo. Nunca registre letra inteira, formulário, e-mail, token, cookie, senha ou chave. Sinais a monitorar: jobs falhos, backlog, pagamento sem job e falhas de e-mail. O repositório não provisiona alertas externos; configure-os na plataforma antes da ativação comercial.

## E-mail pendente

Uma intenção pending conserva provider, destinatário, remetente e URL. Corrija a configuração e reexecute o job pelo admin; não altere token ou snapshot para forçar envio. Se o provider foi trocado durante uma tentativa, restaure a configuração correspondente antes de retomar. Entrega legada sem confirmação de envio pode exigir revisão manual, pois o token antigo não pode ser recuperado do hash. Resend tem janela limitada de deduplicação; um retry tardio pode repetir o aviso, mas o link permanece consistente.

## Restore local

Use ferramentas PostgreSQL da mesma versão principal do servidor. O teste desta entrega executou o script dentro do container PostgreSQL 16, de music_launch_preview para music_launch_restore, com dados exclusivamente sintéticos. Isso não prova restore de bucket nem backup de produção.
