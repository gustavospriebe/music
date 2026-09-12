# Ativação externa

Este roteiro é uma etapa de publicação/operação com autorização e orçamento próprios. A execução local de `audit-remediation` não fez deploy, não cobrou PIX e não chamou IA ou e-mail pagos. Registre evidência sanitizada; não registre secrets, payload pessoal, letra, foto ou URL privada.

## Promover uma revisão coerente

1. Confira a revisão aprovada e o CI do SHA exato. Mantenha API, worker e web conectados ao mesmo repositório, com espera pelo CI e watch patterns que incluam os pacotes compartilhados. Durante esta promoção incompatível, controle os disparos automáticos para impedir a implantação de apenas parte dos serviços.
2. Retire a API antiga do tráfego e interrompa novos pedidos, checkouts e callbacks durante a manutenção. Drene requisições em andamento e pause o worker antigo, aguardando as chamadas externas já iniciadas. Se uma chamada for interrompida sem resultado, registre a necessidade de conferência antes de qualquer retry.
3. Confirme ausência de escritores antigos e faça backup consistente de banco e objetos. Confira journal/hashes reais e os dados que receberão as novas constraints: tentativas financeiras ativas duplicadas, referências de arquivos, produções legadas e jobs sem origem comprovada. Um ensaio em banco vazio não comprova esses dados.
4. Aplique migrations pelo único owner, o pre-deploy da API. Mantenha o worker parado até confirmar journal/hashes e schema da revisão. As migrations renomeiam colunas e tornam campos financeiros obrigatórios: a API antiga também é incompatível com o schema novo. Seed é só ativação inicial do produto, nunca mecanismo de migration.
5. Publique API e web do mesmo SHA validado. Confirme Node 22, configuração do banco/storage, credenciais/modelos de texto mesmo com áudio Google e `/api/v1/configuration` e `/api/v1/products`. O catálogo deve expor somente `custom_song`; cobrança pública permanece bloqueada até preço e políticas aprovados.
6. Publique o worker do mesmo SHA, confirme FFmpeg, `EMAIL_FROM`, revisão manual e o ambiente monetário das tentativas pendentes antes de retomar consumo. Reabra o tráfego e os callbacks somente com os três serviços coerentes; reconcilie eventos que chegaram durante a manutenção.

Se a promoção falhar depois da migration, mantenha manutenção e consumo suspenso. Reimplantar o SHA antigo sobre o schema novo não é rollback seguro. Use o plano de restauração e uma revisão compatível, conferindo banco e objetos antes de reabrir acesso.

## PIX

Escolha o gateway que será homologado; o adapter existente é AbacatePay. A URL vigente é `/api/v1/webhooks/abacatepay`, com secret e assinatura dos bytes brutos conforme configuração. Sandbox/devMode não é PIX de produção.

Configure `PAYMENT_ENVIRONMENT=sandbox` para homologação administrativa e `live` para cobrança real, mantendo `NODE_ENV=production` nos serviços hospedados. API e worker devem usar o mesmo ambiente monetário e credenciais correspondentes. O ambiente fica persistido em cada tentativa; trocar a configuração não muda pagamentos anteriores. Histórico com ambiente desconhecido exige conferência explícita, sem presumir `live` ou `sandbox`.

Sandbox mantém o checkout público indisponível. Uma solicitação de homologação exige simultaneamente sessão administrativa e capability do pedido; não existe flag pública para liberar cobrança. Confira esse bloqueio antes do teste administrativo. Encerrar ou reconciliar tentativas no seu ambiente de origem precede qualquer troca de credenciais. Dinheiro de sandbox não compõe a receita real nem comprova homologação de PIX real.

Com limite de gasto aprovado, faça um pedido sintético completo e um PIX real. Prove: uma tentativa persistida antes da rede, cobrança com valor/referência exatos, retorno ao pedido, webhook autenticado, consulta e um único início de produção. Reenvie a notificação para provar deduplicação. Confira no gateway e no banco o mesmo pagamento, sem publicar IDs externos ou dados do comprador.

Exercite reconciliação sem visita à página, resposta de criação desconhecida, evento atrasado e refund. Não provoque nova cobrança para resolver timeout: consulte a referência existente. Só declare refund homologado quando a consulta autenticada confirmar o estado e a aplicação revogar entrega/interromper trabalho.

## IA e revisão

Defina orçamento e acompanhe o consumo no provider e `ai_usage`. Letra, áudio e capa têm chamadas separadas. Teste conteúdo sintético consentido e confira que contato/aceites não entram no prompt. Um resultado desconhecido pode ter sido cobrado; a conferência administrativa libera uma nova tentativa, não declara custo zero.

Comece em `AUDIO_REVIEW_MODE=manual`. Ouça as duas faixas: palavras, pronúncia, qualidade e adequação. O gate FFmpeg/duração rejeita arquivos tecnicamente inválidos; não julga música. Só use `automatic_release` por decisão consciente dessa limitação.

## E-mail e entrega

Verifique domínio e `EMAIL_FROM` no worker. Receba o e-mail, abra o link em outro navegador, teste visualização/stream/download privado e negue acesso após revogação. Faça uma revisão de produção: ela deve gerar novo aviso com intenção própria, preservando o link do pedido e o histórico anterior.

O status `sent` indica aceite pelo transporte; consulte `last_event` e bounce no Resend para confirmar entrega. Um domínio inválido em ADMIN_EMAIL foi identificado na homologação: credencial de admin não comprova que a caixa existe. Corrigir o destinatário exige nova intenção explícita; não mude destinatário/mensagem de uma tentativa já enviada. Em erro de envio, conserve intenção e chave. Após a janela de idempotência do Resend, confira o envio no provider antes de tomar uma decisão manual: repetir uma chamada fora da janela pode duplicar e-mail.

## Backup/restore e decisão final

Execute [backup-and-restore.md](backup-and-restore.md), incluindo objetos reais em destino isolado. Só depois preencha os itens comerciais e operacionais de [production-checklist.md](production-checklist.md). Para cada prova registre responsável, data UTC, ambiente, revisão, resultado observado e limite da evidência. Falha de etapa mantém sua pendência aberta; não transforme testes locais em homologação externa.
