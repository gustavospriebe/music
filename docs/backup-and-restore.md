# Backup e restauração

Banco e objetos são dois conjuntos de recuperação. A restauração só está completa quando o banco referencia arquivos recuperados e o acesso privado funciona. Esta execução comprovou dump/restore conjunto de PostgreSQL 18 e dois objetos sintéticos, seguido de download privado, Range e revogação na API restaurada; não executou backup/restore do bucket Railway.

## Rotina a ativar antes de vender

Defina responsável, destino externo ao projeto de produção, retenção e metas de perda/tempo de recuperação. Uma proposta inicial é backup diário e cópia de objetos após produção concluída; isso ainda exige escolha e configuração operacional. O banco contém contato, história e tokens em hash; os arquivos contêm áudio/capa/imagem. Restrinja acesso e retenção de ambos. Não registre nomes de objetos, URLs privadas ou conteúdo nos relatórios.

1. Gere dump consistente do PostgreSQL usando credencial de backup com permissão mínima. Guarde hash, hora UTC e versão do servidor em inventário privado.
2. Copie os objetos imutáveis para armazenamento independente. Registre tamanho e SHA-256 por objeto no inventário privado; não suponha que ETag é SHA-256.
3. Evite inconsistência durante a cópia: pare novas produções durante um ensaio ou use uma janela/inventário de objetos que cubra todas as referências do dump. Cópia concluída não autoriza apagar o original.
4. Monitore falha/atraso do backup. A existência do serviço Bucket não comprova versionamento, retenção nem backup configurado.
5. Faça o primeiro restore completo antes da primeira venda e repita periodicamente ou após mudança relevante de schema/storage.

## Ensaio do banco

Use origem sintética e destino descartável cujo nome termine em `_restore` ou `_restore_drill`. `scripts/restore-drill.sh` confere identidades distintas, exige confirmação explícita, restaura com falha imediata e compara contagens de pedidos, migrations, arquivos, produções, consentimentos e pagamentos. O dump temporário é privado e removido ao terminar. Execute com ferramentas cliente da versão adequada do PostgreSQL; nunca com `bash -x`.

```sh
# Injete as duas URLs sem imprimi-las. O destino será substituído.
RESTORE_DRILL_CONFIRM=ERASE_RESTORE_DRILL_DATABASE bash scripts/restore-drill.sh
```

Variáveis: `DATABASE_URL` (origem) e `RESTORE_DRILL_DATABASE_URL` (destino). Identidades diferentes e sufixo do destino são barreiras adicionais; o responsável ainda precisa escolher um destino realmente isolado. Contagens iguais não provam todos os invariantes ou autorização de download: valide o fluxo da aplicação restaurada em seguida.

## Ensaio dos objetos

Exporte o backup e sua cópia restaurada para diretórios isolados com acesso restrito. O verificador compara todas as chaves relativas, tamanhos e SHA-256 em streaming, recusa origem igual ao destino e recusa export vazio. Não imprime chaves ou conteúdo.

```sh
node scripts/verify-object-restore.mjs /caminho/backup-exportado /caminho/restaurado
```

Esse comando verifica os arquivos que recebeu. Não configura agendamento de backup, não demonstra que o export do bucket está completo e não testa a política S3. Confronte o inventário com `stored_files`, depois use a API isolada para baixar áudio/capa sintéticos, testar Range e recusar acesso sem capability. Registre quantidade, hash do inventário, duração e resultados, sem anexar conteúdo privado.

## Evidência de produção ainda necessária

Destino externo configurado, primeira cópia completa, monitoramento de falha, restore real do bucket, consistência banco/objetos e download privado recuperado. Preencha responsável, data UTC, ambiente, RPO e RTO observados. O ensaio local não satisfaz esses itens.
