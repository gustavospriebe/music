# Runbook operacional

## Job preso ou falha de provider

Confira `generation_jobs`: jobs em `processing` além de `JOB_LOCK_TIMEOUT_MS` devem voltar a `pending`; jobs transitórios recebem backoff exponencial e no máximo três tentativas. Reprocesse pelo endpoint administrativo somente após verificar o erro sanitizado. Não reexecute um job concluído.

## Pagamento confirmado sem geração

Valide pagamento junto ao Mercado Pago, confirme `externalPaymentId`, valor BRL e pedido. Na mesma transação, marque pago e insira `audio:<order-id>` com chave única. Se o job não existir, crie-o uma vez; não marque entrega manualmente.

## Token de cliente

Revogue acesso, gere token forte novo, armazene apenas o hash e envie novo link. Nunca coloque token em logs, analytics ou histórico administrativo.

## Armazenamento e backup

Assets são privados. Em desenvolvimento, `var/storage` é descartável; em produção, faça backup versionado do PostgreSQL e do bucket, teste restauração e aplique política de retenção/anominização aprovada juridicamente.

## Observabilidade mínima

Use request ID, status de pedido/job, provider/modelo, duração e tentativa. Nunca registre letra inteira, formulário, token, senha ou chave. Alarmes: jobs falhos, backlog, pagamento sem job e falhas de e-mail.
