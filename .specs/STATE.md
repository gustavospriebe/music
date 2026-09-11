# STATE

## Decisions

### AD-001

- **Decision**: Cookies públicos de capability são sempre assinados e verificados no servidor; um marcador literal nunca concede acesso.
- **Reason**: O nome do cookie contém uma referência pública e pode ser forjado por qualquer cliente HTTP.
- **Trade-off**: Sessões locais antigas com marcador não assinado deixam de funcionar e precisam ser recuperadas por um link de entrega válido.
- **Scope**: API pública, pedidos e entregas.
- **Date**: 2026-09-04
- **Status**: active

### AD-002

- **Decision**: Operações síncronas com provider externo usam claim compare-and-set no PostgreSQL e só retomam claims sem atualização após timeout explícito.
- **Reason**: O banco já é a fonte de verdade e evita uma segunda infraestrutura de lock/fila para a geração de letra.
- **Trade-off**: Uma interrupção exige aguardar o timeout de recuperação; não há cancelamento imediato da chamada em curso.
- **Scope**: API, worker e futuras operações externas cobradas.
- **Date**: 2026-09-04
- **Status**: active

### AD-003

- **Decision**: A capa de álbum é um agregado opcional pós-pagamento, com até duas tentativas históricas, sem participar de `orders.status`.
- **Reason**: A música continua sendo o produto contratado; uma falha visual não pode bloquear áudio, entrega ou reembolso.
- **Trade-off**: A UI combina dois estados assíncronos independentes e o suporte precisa observá-los separadamente.
- **Scope**: API pública, worker, storage e entrega.
- **Date**: 2026-09-04
- **Status**: active

### AD-004

- **Decision**: Arquivos de produção usam storage S3 compatível privado; disco local é permitido somente fora de produção. Downloads continuam mediados pela API e pelas capabilities existentes.
- **Reason**: URLs públicas ou enumeráveis violariam a privacidade de áudio e referências pessoais.
- **Trade-off**: Produção exige bucket, credenciais, backup de objetos e teste de restore antes do lançamento.
- **Scope**: API, worker e operação.
- **Date**: 2026-09-04
- **Status**: active

### AD-005

- **Decision**: A produção usa um único projeto Railway com serviços `web`, `api`, `worker`, `Postgres` e `Bucket`; migrations recorrentes pertencem ao pre-deploy da API e o seed de produtos é uma ativação inicial separada.
- **Reason**: O monorepo já possui três runtimes distintos, fila PostgreSQL e adapter S3; esta topologia reduz serviços paralelos e define um único owner do schema.
- **Trade-off**: A aplicação depende do plano de controle Railway e o Bucket exige export/backup externo.
- **Scope**: Deploy, banco, storage, CI operacional e futuras sessões de infraestrutura.
- **Date**: 2026-09-06
- **Status**: active

### AD-006

- **Decision**: O repositório usa pnpm 12.3.4 e preserva o lockfile oficial em dois documentos; o arquivo gerado fica fora do Prettier e somente as versões travadas do esbuild têm postinstall autorizado.
- **Reason**: O pnpm 12 separa metadados de ambiente e grafo do projeto; reformatar ou interpretar apenas o primeiro documento produz falsos diagnósticos e instalações não reproduzíveis.
- **Trade-off**: Ferramentas YAML antigas podem não interpretar o grafo; scanners e agentes devem usar pnpm ou ler explicitamente o último documento.
- **Scope**: desenvolvimento local, CI e builds Docker.
- **Date**: 2026-09-06
- **Status**: active

## Launch remodel decisions (2026-09-07)

### AD-007

- **Decision**: custom_song é aditivo; tema e briefing são inspiração criativa, sem cópia literal obrigatória. Fatos opcionais expressamente fornecidos continuam verificáveis; produtos anteriores preservam seu contrato.
- **Reason**: Criação livre não deve inventar relações nem converter texto do cliente em versos obrigatórios.
- **Scope**: contratos, domínio, API e estúdio do cliente.
- **Status**: active

### AD-008

- **Decision**: Gateway pode ficar disabled; checkout real exige preço positivo e condições comerciais publicadas. Catálogo não reprecifica snapshots históricos de pedidos.
- **Reason**: O dono ainda escolherá preço e fornecedor; configuração técnica não equivale a autorização comercial.
- **Scope**: catálogo, pagamento, checkout e ativação.
- **Status**: active

### AD-009

- **Decision**: Intenção de email é persistida antes de enviar e mantém token/mensagem em retry. Cookies vinculam tipo, pedido e versão atual; revogação invalida acessos anteriores.
- **Reason**: Evitar link morto depois de envio aceito e garantir revogação efetiva.
- **Scope**: API, worker, providers e entrega privada.
- **Status**: active

## Handoff

- **Feature**: launch-remodel; studio-flow-uat-fixes; lyrics-production-polish; admin-recovery.
- **Phase / Task**: recuperação administrativa concluída localmente; validação independente PASS, último gate integrado289 testes, 48E2E e sensor7/7 detectados. React Doctor100/100; cópias finais verificadas por29 testes administrativos.
- **Completed**: criação livre em quatro passos; landing e continuidade visual; configuração comercial/provider; pagamento retomável; email com intenção estável; revogação e downloads privados; ajuste cliente/admin; limpeza de logs com backup; pnpm check Node 22 PASS com 185 testes; E2E 43 PASS; React Doctor full 100/100; migration fresh/upgrade/seed replay/restore isolado/Nginx PASS.
- **Admin recovery completed**: contador e filtro de falhas atuais; diagnóstico, tentativas e horários; retomada de letra/áudio/capa/aviso de entrega; recuperação de áudio faltante e regeneração de uma ou duas variantes; gates transacionais e histórico sanitizado. Foto removida exige reenvio consentido. API/worker do preview atualizados, sem reprocessar o pedido recusado. Spec/tasks/validation em .specs/features/admin-recovery/ e operação em docs/admin-recovery.md; evidências em output/admin-recovery/. Nenhuma chamada paga nesta entrega; bancos QA descartáveis separados do preview.
- **In-progress**: aceite humano do painel e avaliação artística das letras; qualidade editorial continua parcial. Google Lyria 3.5 T1–T7 implementados, gates locais PASS e comparação P2 live concluída com quatro chamadas nominais de US$0,32, todas `ok`. A escuta humana, homologação externa e publicação não foram executadas.
- **Lyrics quality review**: EDIT-03 revisou prompt de composição, preservando modelo/configuração/histórico. Quatro chamadas reais de texto fictício custaramUS$0,015545; rodada acumulada observadaUS$0,6648398. Provider5/domain10 e build/typecheck/lint pertinentes PASS. Resultado editorial parcial: melhora em recomeço, regressão na amostra de viagem; não declarar qualidade artística resolvida. Relatório docs/lyrics-prompt-review.md e comparações output/lyrics-prompt-review/. Próxima avaliação: comparar alternativas de modelo de texto e ouvir os resultados com aceite humano.
- **Previous UAT follow-up**: pedido sem sinal conferido no banco e browser; falha terminal do filtro, capa concluída, sem reenvio pago. Corrigida atualização automática do detalhe admin e linguagem da falha pública. PROGRESS-02 validado anteriormente por35 testes focais, lint/typecheck/build, React Doctor100 e sensor2/2; agora incluído no gate integrado289. CI/Railway reconfirmados em leitura, sem mudança remota.
- **Next step**: ouvir os quatro arquivos da rodada live com aceite humano, registrar a avaliação artística, testar o painel de falhas no preview e seguir o runbook externo antes de publicação.
- **Preview**: http://localhost:5180 (web), API3010 e banco music_launch_preview. API e worker ativos em PREVIEW_AI=all (letra/áudio/capa reais autorizados), pagamento/email locais. Worker sem watch para evitar interrupção de I/O pago; .env preservado. Dois pedidos fictícios validaram letra/edição/refino/histórico, quatro áudios, capa e entrega privada; consumo observado da conta na rodada US$0,6492948 em2026-09-07T22:29Z, teto autorizadoUS$3. Usuário removeu limite da chave que causava402; seu pedido de áudio foi retomado e recusado duas vezes pelo filtro do modelo, sem alteração de sua letra. Não presumir que esse pedido está entregue.
- **Blockers**: preço e textos finais não definidos; providers reais não homologados nesta entrega; CI remoto segue no último HEAD publicado com failure; Railway web/api/worker sem deployment e sem Postgres/Bucket. Nenhum commit/push/deploy realizado.
- **Uncommitted files**: WIP anterior preservado; backups e evidências em output/launch-remodel, output/studio-flow-uat-fixes e output/lyrics-production-polish (ignorados). Relatórios atuais docs/studio-flow-uat-fixes.md e docs/lyrics-production-polish.md complementam docs/launch-remodel-report.md. Sem commit/push/deploy.
- **Branch**: main em c9f3d045e9cba1ef9965e4005882ade0dcc496bb.
