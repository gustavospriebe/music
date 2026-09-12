# Arquitetura — Música da Resenha

O mapa canônico está em [docs/architecture.md](docs/architecture.md). Comece por [docs/project-context.md](docs/project-context.md) e reconcilie [.specs/STATE.md](.specs/STATE.md) com o código, Git, CI e ambiente antes de operar.

O sistema é um monólito modular TypeScript com web, API e worker, PostgreSQL como dado/fila e storage privado. O produto único é `custom_song`. Contratos, domínio, migrations e adapters têm responsabilidades explícitas; pagamento e produção possuem histórico próprio ligado ao pedido.

A correção `audit-remediation` é trabalho local até que uma evidência de publicação diga o contrário. Schema em TypeScript, migrations presentes e testes locais não comprovam o schema Railway nem autorizam venda. Detalhes de invariantes, limites, validação e migração ficam no mapa canônico, evitando dois documentos ensinarem modelos diferentes.
