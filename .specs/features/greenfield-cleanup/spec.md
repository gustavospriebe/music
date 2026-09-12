# Greenfield cleanup

> Registro histórico de um recorte anterior. O modelo vigente e a evidência atual estão em [docs/documentation-map.md](../../../docs/documentation-map.md) e [audit-remediation](../audit-remediation/spec.md). Este registro não autoriza publicação nem gasto com providers.

O produto vivo é `custom_song`. Não manter alias, tabela sem fluxo nem catálogo paralelo só porque o MVP passou por isso.

## Goals

- [x] Contato fora do JSONB da história (`order_contacts`).
- [x] Sem `leads` / `order_items` / aliases Drizzle.
- [x] Catálogo, enum e contrato só `custom_song`.
- [x] Status fechados como enum.
- [x] Pacote `@resenha/config` e stubs de letra na API removidos.
- [x] CI Postgres 18.
- [x] Job `deliver_notify`; FKs de arquivo em `file_id` / `reference_file_id` / `cover_file_id`.

## Out of Scope

| Item                            | Reason                                     |
| ------------------------------- | ------------------------------------------ |
| Hash da senha admin             | Decisão do dono: senha no ambiente.        |
| Cadastro de cliente             | Produto sem conta.                         |
| Redis / framework de IA         | Fora da carcaça.                           |
| Squash das migrations 0000–0009 | Banco Railway existente precisa da cadeia. |

## Requirements

1. **GF-01** WHEN o cliente salva a história THEN o sistema SHALL persistir e-mail/nome/marketing em `order_contacts` e o JSONB SHALL NÃO conter `buyerEmail`, `buyerName`, `termsAccepted` nem `marketingAccepted`.
2. **GF-02** WHEN o worker envia e-mail ou gera letra THEN o destinatário SHALL vir de `order_contacts` e o briefing criativo de `story_sessions.data`.
3. **GF-03** WHEN `POST /orders` THEN o sistema SHALL aceitar somente `custom_song`.
4. **GF-04** WHEN o seed roda THEN somente `custom_song` existe no catálogo.
5. **GF-05** WHEN o código importa o schema THEN SHALL usar `storySessions` / `lyricVersions` / `storedFiles`. Sem aliases.
6. **GF-06** WHEN a migration 0010 aplica THEN `leads` e `order_items` SHALL deixar de existir; colunas órfãs de `story_sessions` SHALL cair.
7. **GF-07** WHEN a migration 0011 aplica THEN `product_type` SHALL ter só `custom_song`; jobs de aviso SHALL ser `deliver_notify`; ponteiros de arquivo SHALL ser `file_id`.
