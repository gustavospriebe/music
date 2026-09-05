# Capa de álbum gerada por IA — pesquisa e backlog

**Estado em 04/09/2026:** P2 implementado e validado localmente; ativação permanece **EXTERNAL BLOCKED**. Nenhuma chamada paga de capa foi feita.

## Por que vale testar

A capa aumenta o caráter presenteável e compartilhável do pedido. O melhor ponto de entrada é depois do pagamento confirmado: isso evita abuso de geração gratuita, permite incluir um render no pacote e usa letra, ocasião, gênero e clima já aprovados como contexto. Uma foto opcional pode orientar personagem e composição, sem prometer reprodução biométrica exata.

## Modelo e custo de referência

Valores públicos consultados em 04/09/2026, em dólar, antes de impostos, câmbio, armazenamento e margem:

| Opção                                              | Uso recomendado                                   | Custo de saída 1K |
| -------------------------------------------------- | ------------------------------------------------- | ----------------: |
| Gemini 3.1 Flash Lite Image (“Nano Banana 2 Lite”) | Capa somente por texto, rápida e econômica        |       ~US$ 0,0336 |
| Gemini 3.1 Flash Image (“Nano Banana 2”)           | Capa com foto de referência e melhor consistência |        ~US$ 0,067 |
| Gemini 2.5 Flash Image                             | Modelo anterior; não iniciar integração nova nele |        ~US$ 0,039 |

O desenho comercial recomendado inclui **uma capa 1:1 de 1024 px e uma regeneração limitada**. No pior caso de duas tentativas com referência, a saída fica em torno de US$ 0,134, além do pequeno custo de entrada. O modelo Lite pode reduzir pela metade a saída de pedidos sem foto. Batch é mais barato, mas não combina com expectativa interativa imediata.

Fontes oficiais:

- [Guia de geração de imagens do Gemini](https://ai.google.dev/gemini-api/docs/image-generation)
- [Tabela de preços da Gemini API](https://ai.google.dev/gemini-api/docs/pricing)
- [Geração e edição de imagens no OpenRouter](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)

Todas as imagens geradas pelos modelos Gemini recebem SynthID. Antes de implementar via OpenRouter, validar em documentação oficial o identificador vigente do modelo, suporte a `input_references`, formato de resposta e contabilização real de custo; não reutilizar por suposição o endpoint de texto/áudio atual.

## Fatia implementada

1. Disponibilizar a ação apenas após pagamento confirmado.
2. Gerar uma capa quadrada 1024 × 1024 com título, gênero, clima e resumo da letra; texto legível na imagem não é requisito.
3. Aceitar zero ou uma foto de referência; sem foto usa Lite, com foto usa o modelo equilibrado para referências.
4. Entregar uma capa incluída e no máximo uma regeneração explícita.
5. Persistir job retomável e ledger de custo com `kind = album_cover`; nunca gerar novamente em reload.
6. Mostrar preview, download e indicação de imagem criada com IA junto às duas faixas.

## Guardrails obrigatórios

- Consentimento afirmativo de que a pessoa pode usar os rostos enviados; política específica para menores antes do lançamento.
- Upload privado direto, limite de tamanho, validação por assinatura/MIME, remoção de EXIF e rejeição de arquivos ativos.
- URL nunca pública ou enumerável; acesso usa a mesma capability assinada do pedido.
- Retenção curta e documentada da foto original; permitir exclusão sem apagar o histórico financeiro do pedido.
- Moderação de prompt e imagem, sem artista vivo, celebridade, nudez ou imitação enganosa.
- Erro sanitizado, claim idempotente, limite por pedido e nenhuma chamada real em teste/preview.
- Termos e privacidade revisados antes de produção, incluindo subprocessador e região de processamento.

## Critério para promover a P1

Rodar um piloto autorizado com pelo menos 20 pedidos sintéticos, medir latência, aderência visual, taxa de regeneração, custo p95 e falhas de referência. Promover somente se custo p95 ficar dentro da margem definida pelo produto, nenhuma foto original vazar em logs/URLs e a capa não atrasar a entrega das faixas.
