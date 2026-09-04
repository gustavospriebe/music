# Runbook operacional

## Job preso ou falha de provider

Confira `generation_jobs`: jobs em `processing` além de `JOB_LOCK_TIMEOUT_MS` devem voltar a `pending`; jobs transitórios recebem backoff exponencial e no máximo três tentativas. Reprocesse pelo endpoint administrativo somente após verificar o erro sanitizado. Não reexecute um job concluído.

Falha de letra antes do pagamento é retomada pelo próprio comprador em “Tentar gerar novamente”. O claim novo só entra após o estado `failed` ou após cinco minutos sem atualização em `lyrics_generating`. Falha de áudio depois do pagamento não dispara regeneração no browser: confira tentativas e custo, corrija a letra se necessário e use o rebuild administrativo uma vez. O pedido e as duas variantes existentes continuam sendo a fonte de verdade.

Nunca altere status com SQL em operação normal. Use apenas handlers que chamam `assertTransition`; eventos, versões de letra e tentativas permanecem históricos.

## Pagamento confirmado sem geração

Valide pagamento junto ao Mercado Pago, confirme `externalPaymentId`, valor BRL e pedido. Na mesma transação, marque pago e insira `audio:<order-id>` com chave única. Se o job não existir, crie-o uma vez; não marque entrega manualmente.

## Token de cliente

Revogue acesso, gere token forte novo, armazene apenas o hash e envie novo link. O endpoint de recuperação troca o token por cookie de visualização assinado e não concede acesso ao formulário nem a mutações. Nunca coloque token, cookie ou URL concreta de entrega em logs, analytics ou histórico administrativo.

## Armazenamento e backup

Assets são privados. Em desenvolvimento, `var/storage` é descartável; em produção, faça backup versionado do PostgreSQL e do bucket, teste restauração e aplique política de retenção/anominização aprovada juridicamente.

## Observabilidade mínima

HTTP registra request ID, template de rota, status e duração. Worker registra tipo do job, status, tentativa e duração, sem UUID interno. O ledger de IA guarda provider/modelo e custo sob acesso administrativo. Nunca registre letra inteira, formulário, e-mail, token, cookie, senha ou chave. Alarmes: jobs falhos, backlog, pagamento sem job e falhas de e-mail.
