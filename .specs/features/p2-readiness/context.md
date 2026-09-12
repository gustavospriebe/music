# P2 Readiness Context

> Registro histórico de um recorte anterior. O modelo vigente e a evidência atual estão em [docs/documentation-map.md](../../../docs/documentation-map.md) e [audit-remediation](../audit-remediation/spec.md). Este registro não autoriza publicação nem gasto com providers.

**Gathered:** 2026-09-04  
**Status:** Approved

## Decisions

- A capa é um extra independente disponível após pagamento. Ela nunca altera `orders.status`.
- O produto inclui uma geração e uma regeneração. Reload e retry técnico reutilizam o mesmo job.
- A referência é opcional, privada e transitória. A interface pede consentimento específico.
- Sem referência usa Nano Banana 2 Lite; com referência usa Nano Banana 2. Ambos via OpenRouter Images API e variáveis de ambiente.
- O output é 1:1, 1K e raster. Texto legível dentro da imagem não faz parte do contrato.
- Sem credencial fora de produção, a ação informa indisponibilidade. Não existe imagem fake.
- Itens dependentes de credenciais, infraestrutura ou jurídico ficam prontos para ativação e explicitamente não homologados.
- `apps/web/src/admin/routes.tsx` já tinha alterações do dono. Esta feature não modifica nem inclui esse arquivo.

## Official API Evidence

- OpenRouter Images API: `POST /api/v1/images`, `input_references`, `resolution`, `aspect_ratio`, resposta base64 e `usage.cost`.
- OpenRouter model discovery em 2026-09-04 confirma `google/gemini-3.1-flash-lite-image` e `google/gemini-3.1-flash-image`, ambos com 1:1 e referências.
- Google publica custo de saída 1K de US$ 0,0336 para Lite e US$ 0,067 para Flash, antes de entrada, impostos e câmbio.
- Fastify recomenda `new LogController({ disableRequestLogging: true })`; a opção de topo sai no Fastify 6.

## Cost Envelope

Sem foto, duas gerações custam aproximadamente US$ 0,0672 de saída. Com foto, o teto de duas saídas é aproximadamente US$ 0,134. O ledger mede o custo real retornado pelo provider. Nenhum valor estimado é gravado como custo real.

## Privacy Boundary

Não registrar prompt, referência, história, letra, storage key, token ou URL concreta. A referência aceita somente raster verificado, fica no mesmo storage privado do pedido e é removida pelo worker ao encerrar. Um cleanup operacional cobre referências órfãs com mais de sete dias.

## External Blocks

- Jurídico precisa aprovar o texto e a política para imagens de menores.
- Mercado Pago sandbox exige credenciais e webhook público.
- Resend exige chave, domínio remetente verificado e destinatário autorizado.
- Storage gerenciado exige bucket privado, credenciais e restore testado.
- Piloto de capa exige orçamento/autorização para chamadas pagas.
