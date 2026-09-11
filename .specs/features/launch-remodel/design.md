# Design

A web preserva React/Vite e tokens creme/coral/preto; a criação vira um estúdio guiado em quatro passos dentro da jornada existente. custom_song adiciona uma história livre sem reinterpretar os três produtos antigos. O catálogo persiste preço e o pedido mantém snapshot. Configuração comercial pública usa DTO explícito. Pagamento e email possuem contratos pequenos com adapters existentes; disabled e local-log são estados operacionais explícitos. Checkout e webhook serializam a confirmação com PostgreSQL. Entrega persiste intenção imutável antes do envio e deriva token estável sem armazenar capability em texto aberto. Revogação verifica versão atual de acesso; ajuste tem caminho cliente/admin.

Ownership: backend_readiness possui API/contracts/domain/database; delivery_readiness possui worker/providers e solicita alterações de schema ao backend; customer_redesign possui web; principal possui docs/config raiz/nginx e integração. Banco para QA é descartável e separado por suíte. Nenhuma chave real será usada.

Referências de produto consultadas em 2026-09-07: [Songfinch](https://www.songfinch.com/) trabalha a história e a ocasião; [Suno Custom mode](https://help.suno.com/en/articles/2415873) separa ideia e detalhamento. Inspiração de fluxo, não cópia de interface nem equivalência de serviço.

Integração: brief e assunto de custom_song são inspiração, não versos obrigatórios. facts aceita lista vazia nesse produto e só representa expressões fornecidas explicitamente. O frontend não extrai fatos nem corta parágrafos do brief para preencher outro campo. Produtos legados preservam as validações anteriores.
