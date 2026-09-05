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

## Handoff
