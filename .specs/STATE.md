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

### AD-010

- **Decision**: Gateway AbacatePay integrado como provedor oficial de pagamento PIX (`PAYMENT_PROVIDER=abacatepay`). O checkout restringe métodos a PIX (`methods: ['PIX']`), consulta status de billing via `/v2/checkouts/list?id=` e aceita assinatura de webhook tanto por query param quanto por headers (`x-webhook-secret`/`x-secret`).
- **Reason**: O AbacatePay v2 unificou a consulta e requer suporte a headers nos webhooks nativos.
- **Scope**: API, provedores de pagamento, contratos e checkout.
- **Date**: 2026-09-11
- **Status**: active

## Handoff

- **Feature**: MVP Launch & AbacatePay integration.
- **Phase / Task**: Homologação completa end-to-end no browser e sincronização de produção no Railway.
- **Completed**:
  - Deploy em produção no Railway para `main` (web, api, worker, PostgreSQL e Bucket S3).
  - Configuração do provider `PAYMENT_PROVIDER=abacatepay`, chaves da API, secret de webhook e catálogo de produtos no PostgreSQL.
  - Correção dos endpoints do AbacatePay no monorepo (`/v2/checkouts/list` e header `x-webhook-secret`).
  - Teste end-to-end executado com sucesso no Browser: criação de história em 4 etapas, geração de letra via IA (OpenRouter), aprovação de letra, geração de checkout AbacatePay Sandbox PIX de R$ 49,90, simulação de pagamento, processamento de webhook `checkout.completed`, geração de duas versões de áudio pelo worker e entrega concluída no player com download.
- **Next step**:
  - Revisar com o dono do produto se o modo de revisão de áudio deve permanecer `manual` ou `automatic` em produção.
  - Realizar teste final de compra com PIX real quando as credenciais de produção do AbacatePay forem ativadas.
