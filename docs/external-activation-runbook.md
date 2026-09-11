# Ativação externa e restore

Estado inicial de AbacatePay, Resend, volume de arquivos e capa OpenRouter: **EXTERNAL BLOCKED**. Execute somente com autorização, credenciais de teste e orçamento. Nunca cole secrets, payload pessoal, foto, letra, token ou URL privada na evidência.

## AbacatePay sandbox

- Comando: criar o produto (R$ 49,90) e a API key no dashboard; cadastrar o webhook (`POST /api/v1/webhooks/abacate-pay?webhookSecret=<secret>` por HTTPS, eventos `checkout.completed` + `checkout.refunded`); iniciar API/worker com as credenciais e criar um pedido sintético pela UI, pagando a cobrança devMode.
- Evidência esperada: checkout criado com `amount` igual ao total, webhook com secret aceito uma vez, consulta remota confirma `externalId`/valor/status `PAID`, duplicata não cria segundo pagamento/job.
- Rollback: revogar key/webhook, remover pedidos exclusivamente sintéticos pelo procedimento aprovado e restaurar fallback fora de produção.
- Aceite: `[ ] responsável`, `[ ] data UTC`, `[ ] ambiente`, `[ ] evidência sanitizada`, `[ ] rollback testado`.

## Resend

- Comando: verificar domínio, definir `RESEND_API_KEY`/`EMAIL_FROM`, criar entrega sintética e consultar o registro em `email_deliveries`.
- Evidência esperada: um envio por chave idempotente, remetente autenticado, link privado recebido e nenhum token em log.
- Rollback: revogar key, remover DNS de teste se aplicável e voltar ao registro local somente fora de produção.
- Aceite: `[ ] responsável`, `[ ] data UTC`, `[ ] domínio`, `[ ] entrega sanitizada`, `[ ] rollback testado`.

## Volume de arquivos compartilhado

- Comando: montar o mesmo volume em `api` e `worker` (`LOCAL_STORAGE_PATH` absoluto e idêntico); executar `pnpm --filter @resenha/providers test` e um upload/download/exclusão sintético pelo fluxo da aplicação.
- Evidência esperada: arquivo escrito pelo worker legível pela API via capability autenticada, diretório nunca listado, exclusão remove objeto.
- Rollback: desmontar o volume, remover apenas objetos do prefixo sintético e restaurar backup/configuração anterior.
- Aceite: `[ ] responsável`, `[ ] data UTC`, `[ ] mesmo caminho nos dois serviços`, `[ ] backup/export separado avaliado`, `[ ] rollback testado`.

## Capa OpenRouter

- Comando: definir os dois modelos de capa, limite de gasto e usar pedido/foto sintéticos consentidos; solicitar uma capa sem foto e outra com foto.
- Evidência esperada: raster 1:1 privado, modelo esperado em `ai_usage`, custo/latência registrados, no máximo duas tentativas e referência apagada.
- Rollback: remover modelos da configuração para indisponibilizar a ação, revogar key se necessário e excluir dados sintéticos conforme política.
- Aceite: `[ ] responsável`, `[ ] data UTC`, `[ ] orçamento`, `[ ] custo medido`, `[ ] limpeza comprovada`, `[ ] rollback testado`.

## Restore drill isolado

Pré-condições: `DATABASE_URL` aponta para a origem de teste e `RESTORE_DRILL_DATABASE_URL` para um banco vazio e descartável diferente. O script exige confirmação explícita porque executa `pg_restore --clean` no destino.

```sh
export DATABASE_URL='postgresql://.../origem_teste'
export RESTORE_DRILL_DATABASE_URL='postgresql://.../restore_isolado'
RESTORE_DRILL_CONFIRM=ERASE_RESTORE_DRILL_DATABASE ./scripts/restore-drill.sh
```

- Evidência esperada: dump criado em diretório temporário, restore termina, migrations e contagens essenciais são consultáveis; registrar duração, RPO/RTO observado e hash/identificador do backup, nunca conteúdo.
- Objetos: copiar o diretório de storage para prefixo isolado, comparar inventário por quantidade/tamanho e baixar um áudio/capa sintéticos via API apontada ao ambiente isolado.
- Rollback: destruir somente o banco e prefixo isolados pelo console/IaC autorizado; não apontar o script para produção.
- Aceite: `[ ] responsável`, `[ ] data UTC`, `[ ] origem não produtiva`, `[ ] destino isolado`, `[ ] integridade`, `[ ] RPO/RTO`, `[ ] limpeza do drill`.

Depois de cada seção, altere o estado daquela integração para `VALIDATED <data UTC> <responsável>`. Até lá, preserve **EXTERNAL BLOCKED**.
