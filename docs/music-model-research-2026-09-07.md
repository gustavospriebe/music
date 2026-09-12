> HISTÓRICO — documento anterior à remediação de 12/09/2026. Comandos, modelos, orçamento e alegações de prontidão abaixo podem estar superados e não autorizam nova execução. Use o [mapa vigente](documentation-map.md) para implementação e operação.

# Modelos de música: limites, alternativas e custos

Pesquisa de 07/09/2026, com três frentes independentes e consolidação contra o código atual. Fontes primárias, preços públicos e confirmação visual da tabela Mureka. Nenhuma geração paga, compra, instalação ou mudança de configuração. Disponibilidade documentada não equivale a teste de qualidade ou homologação da nossa conta.

## Decisão recomendada

Comparar **Lyria 3 Pro atual, Lyria 3.5, Mureka V9 e Mureka V9.5** com as mesmas letras. Mureka é o primeiro fornecedor alternativo que eu integraria para avaliação: tem contrato API voltado a aplicativos com usuários finais, entrada de letra separada e recursos de edição. Lyria 3.5 merece comparação dentro da família Google; ser mais novo não comprova melhor qualidade ou menos recusas.

Manter **ACE-Step 1.5** como opção posterior de infraestrutura própria. ElevenLabs depende de esclarecer licença e preço para nosso negócio. MiniMax direta está fechada a novos usuários de música; a oferta do parceiro fal precisa confirmação própria. Suno/Udio são referências de experiência artística, mas não integrações públicas oficiais confirmadas para este aplicativo.

## O que os bloqueios do Lyria significam

O Google documenta filtros na entrada e verificações de recitação e semelhança vocal na saída. Assim, a letra enviada pode parecer perfeitamente comum e a composição produzida ainda ser retida. O retorno do nosso pedido não permite identificar qual verso, nome ou característica causou a recusa. [Filtros Pro/Clip](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/lyria/lyria-3).

`PROHIBITED_CONTENT` é uma categoria de possível conteúdo proibido, diferente de `RECITATION`, `SAFETY` e outros motivos da API. Não prova que houve infração autoral nem que o cliente escreveu algo inadequado. Falsos positivos são uma possibilidade reconhecida para classificadores; não demonstramos que esse foi o caso do nosso pedido. [Motivos da API](https://ai.google.dev/api/generate-content#FinishReason), [orientação sobre classificadores](https://ai.google.dev/responsible/docs/safeguards?hl=en).

A API restringe pedidos de vozes específicas e reprodução de letras protegidas. O aplicativo Gemini descreve tratamento próprio para menções a artistas; não devemos extrapolar o comportamento do aplicativo para OpenRouter ou API. [Guia API](https://ai.google.dev/gemini-api/docs/music-generation), [anúncio do Gemini](https://blog.google/innovation-and-ai/products/gemini-app/lyria-3/).

No código há comentários atribuindo falsos positivos a instruções adicionais de pronúncia/variante. Isso é uma hipótese operacional anterior, não uma fronteira demonstrada por experimento controlado. A pesquisa não justifica banir palavras comuns ou referências ficcionais, nem prometer que uma reformulação resolverá a recusa. Convém guardar códigos seguros, etapa da falha e identificador da solicitação, preservando a privacidade do texto, para diagnóstico e eventual suporte do provedor.

### Família Lyria e documentação em transição

| Modelo               | Encaixe e limites documentados                                                  | Preço de áudio                       |
| -------------------- | ------------------------------------------------------------------------------- | ------------------------------------ |
| Lyria 3 Pro Preview  | Canção com voz, letra própria e instrumentos; Cloud informa até184s e português | US$0,08/faixa                        |
| Lyria 3 Clip Preview | Canção curta de30s                                                              | US$0,04/clip                         |
| Lyria 3.5            | Modelo atual em preview; canção completa, texto/imagem, MP3 e texto de letra    | US$0,08/faixa                        |
| Lyria 2              | Instrumental,30s, prompt en-US                                                  | US$0,06/clip                         |
| Lyria RealTime       | Fluxo instrumental conduzido em tempo real                                      | Tarifa não confirmada nesta pesquisa |

Fontes: [preços Google](https://ai.google.dev/gemini-api/docs/pricing), [Pro/Clip no Cloud](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/lyria/lyria-3), [modelo3.5](https://ai.google.dev/gemini-api/docs/models/lyria-3.5), [Lyria2](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/lyria-music-generation), [RealTime](https://ai.google.dev/gemini-api/docs/realtime-music-generation).

O Google já classifica Pro/Clip como legados. O catálogo público OpenRouter consultado nesta data ainda lista somente `google/lyria-3-pro-preview` e `google/lyria-3-clip-preview` na família. O3.5 está documentado na API Google via Interactions; sua utilização exige esse adapter ou futura oferta compatível no gateway, não um slug inventado. [Catálogo OpenRouter](https://openrouter.ai/api/v1/models), [API Google](https://ai.google.dev/gemini-api/docs/music-generation).

Há divergências de contexto e taxa de amostragem entre páginas Google/OpenRouter para Pro/Clip. Não encontramos um limite específico confiável de caracteres da letra. Contexto de tokens não mede quantas palavras cabem cantadas na duração solicitada. Português documentado também não garante sotaque brasileiro ou pronúncia perfeita. [Pro Google](https://ai.google.dev/gemini-api/docs/models/lyria-3-pro-preview), [Pro OpenRouter](https://openrouter.ai/google/lyria-3-pro-preview/pricing).

O guia atual recomenda marcações de seções e instruções musicais concretas; não oferece edição iterativa do áudio3.5 e avisa que chamadas iguais podem variar. Clip serve para experimentar direção criativa, não garante que Pro/3.5 produzirá a mesma composição. [Guia de geração](https://ai.google.dev/gemini-api/docs/music-generation).

## Alternativas com letra personalizada

| Opção                     | Contrato técnico relevante                                                  | Custo publicado                                                     | Avaliação para o produto                                          |
| ------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Mureka V9                 | Letra separada, até5.000 caracteres; tarefa assíncrona; português declarado | US$0,045/faixa; duas = US$0,09                                      | Candidato econômico para comparação                               |
| Mureka V9.5               | Mesma família de API; tabela indica até5min30s                              | US$0,15/faixa; duas = US$0,30                                       | Candidato recente; qualidade adicional ainda não medida           |
| ElevenLabs Music v2       | Plano por seções, letra, streaming e edição de trechos                      | Referência anunciada de US$0,15/min; contrato comercial a confirmar | Candidato condicionado ao enquadramento de licença                |
| MiniMax Music2.6 via fal  | Letra até3.500 caracteres, estilo separado, fila e consulta/webhook         | US$0,15/faixa; duas = US$0,30                                       | Oferta pública de parceiro; confirmar acesso atual da conta       |
| ACE-Step hospedado no fal | Letra, estilo e duração; versão da oferta não identificada como1.5          | US$0,0002/s:120s = US$0,024                                         | Alternativa experimental; não confundir com preço do1.5 self-host |
| ACE-Step1.5 próprio       | Pesos MIT, REST e controles de letra/idioma/edição                          | GPU e operação; sem preço fixo por faixa                            | Mais independência, com responsabilidade operacional              |

Fontes: [Mureka preços](https://platform.mureka.ai/pricing), [Mureka API](https://platform.mureka.ai/docs/api/operations/post-v1-song-generate.html), [Mureka idiomas](https://platform.mureka.ai/docs/en/faq.html), [ElevenLabs preços](https://elevenlabs.io/pricing/api), [ElevenLabs API](https://elevenlabs.io/docs/api-reference/music/compose), [MiniMax no fal](https://fal.ai/models/fal-ai/minimax-music/v2.6), [schema fal](https://fal.ai/models/fal-ai/minimax-music/v2.6/api), [ACE no fal](https://fal.ai/models/fal-ai/ace-step), [ACE1.5 oficial](https://github.com/ace-step/ACE-Step-1.5).

**Mureka:** recarga exibida de US$10 dá concorrência1; é saldo API, separado da assinatura do aplicativo. `n` tem padrão2 e máximo3, com cobrança por faixa: deve ser explícito para não duplicarmos as duas versões do pedido. Para nossa letra aprovada, usar lyrics-to-song; prompt-to-song9.5 custa US$0,50/faixa. A tabela foi conferida no browser; a promoção anterior não foi usada. [Preços](https://platform.mureka.ai/pricing), [API](https://platform.mureka.ai/docs/api/operations/post-v1-song-generate.html).

O contrato Mureka permite integrar o serviço em aplicativos para usuários finais e atribui ao cliente os direitos sobre outputs que pertençam ao fornecedor, sem eliminar direitos de terceiros. Não encontramos exigência geral de Enterprise para nosso fluxo. [Contrato API, §§1.2 e3.2](https://platform.mureka.ai/service_terms.pdf).

Mureka também documenta extensão, remix e edição regional. Extensão consultada usa modelos7.6/8: não presumir que9.5 oferece o mesmo recurso. Isso merece um ensaio próprio de continuidade, voz e conservação dos trechos existentes. [Extensão](https://platform.mureka.ai/docs/api/operations/post-v1-song-extend.html), [changelog](https://platform.mureka.ai/docs/en/changelog.html).

**ElevenLabs:** a referência aceita até10min, mas páginas comerciais ainda mencionam5min; também há divergência entre cobrança por minuto e descrição por geração. A tabela contratual proíbe Reseller Rights nos planos self-service e prevê negociação Enterprise. Nosso aplicativo precisa de enquadramento específico; o selo de uso comercial de um plano pessoal não resolve a revenda. [API](https://elevenlabs.io/docs/api-reference/music/compose), [produto](https://elevenlabs.io/eleven-music-api), [termos atuais](https://elevenlabs.io/eleven-music-model-specific-terms).

**MiniMax direta:** o aviso oficial de20/08/2026 fecha APIs pagas de música/letra a novos usuários, mantendo pagantes existentes; modalidades gratuitas foram descontinuadas. A tabela retém US$0,15 para3.0/2.6/2.5, mas preço publicado não comprova acesso novo. A página do parceiro fal continua anunciando2.6; não fizemos chamada para validar disponibilidade. [Aviso](https://platform.minimax.io/docs/guides/music-generation), [preços](https://platform.minimax.io/docs/guides/pricing-paygo), [parceria oficial](https://www.minimax.io/news/minimax-partners-with-falai).

**Pesos abertos:** ACE-Step1.5 usa MIT; MiniMax Music3 tem licença comunitária própria, incluindo identificação do modelo na interface comercial, requisitos de salvaguardas e autorização acima do limite de receita previsto. O Music3 exige mais memória e operação; offload altera desempenho. Nenhum dos dois teve pronúncia PT-BR ou custo operacional medido aqui. [ACE licença](https://github.com/ace-step/ACE-Step-1.5/blob/main/LICENSE), [Music3 licença](https://huggingface.co/MiniMaxAI/MiniMax-Music3/blob/main/LICENSE), [Music3 hardware](https://huggingface.co/MiniMaxAI/MiniMax-Music3).

### Outras ofertas de mercado

- **Suno:** Custom Mode aceita letra própria, mas não encontramos documentação primária de API pública. Pro/Premier são assinaturas do aplicativo, anunciadas por US$8/24 ao mês no pagamento anual; não são tarifa de API. Os termos atualizados em03/09/2026 restringem canais e cotas de download. Wrappers não herdam autorização comercial só porque funcionam. [Custom Mode](https://help.suno.com/en/articles/2415873), [preços](https://suno.com/pricing), [termos](https://suno.com/terms).
- **Udio:** declara não oferecer API pública; o anúncio oficial de transição informa downloads indisponíveis. Não encontramos confirmação posterior de restabelecimento. Preços históricos do aplicativo não servem para dimensionar nossa integração. [API](https://help.udio.com/en/articles/10756277-udio-public-api), [transição](https://www.udio.com/blog/a-new-era).
- **Stable Audio3:** US$0,26/resultado, mas a própria Stability informa ausência de vocais/letras; serve a outra categoria de produto. [Preço API](https://platform.stability.ai/pricing), [capacidade](https://stability.ai/explainers/stable-audio-vs-competitors-licensing-export-rights-and-self-hosting-compared).
- **Loudly:** API comercial e módulo Manta para músicas/letras, condicionado a `manta_access`. O preço geral de US$0,15/faixa no pacote de1.000 não comprova preço ou elegibilidade Manta. Deixar como opção comercial a esclarecer, sem misturar geração instrumental com canção personalizada. [Documentação](https://www.loudly.com/developers), [preços](https://www.loudly.com/developers/pricing).

## Economia por pedido e demo

Para1.000 pedidos entregando duas versões, sem refazer nenhuma: Lyria Pro/3.5 = **US$160**; Mureka V9 = **US$90**; Mureka V9.5 = **US$300**. São cálculos das tarifas acima, somente áudio; não incluem letras, capa, notificações, infraestrutura, taxas, câmbio ou tentativas extras.

A métrica de decisão deve ser **gasto total dividido pelas versões artisticamente aprovadas**. Um modelo barato com muitas falhas, palavras erradas ou regravações pode custar mais. Registrar latência mediana/p95, recusas, falhas técnicas e custo desconhecido separadamente; ausência de custo informado não significa custo zero.

Para garantir que a demo e a compra tenham exatamente a mesma música, gerar o arquivo completo privado e reproduzir um recorte real dele. O custo de composição ocorre antes da conversão. Usar Clip e depois Pro são duas composições; extensão em outro fornecedor pode preservar a base, mas exige teste próprio e não equivale a identidade garantida entre modelos.

## O quanto é plug and play hoje

O worker já tem a interface `MusicProvider`, mas recebe somente uma string e a configuração, o transporte e os registros ainda pressupõem OpenRouter. Trocar Pro por Clip usa o transporte atual, porém altera a duração do produto. Mureka ou Google3.5 precisam de adapter; não exigem reescrever checkout, histórico, armazenamento privado ou painel.

Pontos encontrados em `apps/worker/src/worker.ts` e `packages/domain/src/index.ts`:

- Modelo vem de `OPENROUTER_MUSIC_MODEL`; o runtime usa chat completions com áudio em streaming.
- Os registros de geração/custo usam `openrouter` fixo; precisam refletir fornecedor real.
- O prompt pede aproximadamente dois minutos e recebe `fullLyrics`, sem transportar as seções separadamente.
- Nosso limite interno de7.000 caracteres excede as entradas documentadas de Mureka5.000 e MiniMax3.500. Nunca truncar uma letra aprovada silenciosamente.
- O modelo de texto compõe a letra; Lyria recebe instrução de cantá-la sem mudar palavras. Trocar apenas o áudio não corrige automaticamente versos fracos.

Próximo incremento proposto: entrada comum com letra, estrutura, direção e duração; adapter por fornecedor; capacidades explícitas; tarefa externa persistida quando assíncrona; custos e erros normalizados. Manter a fila PostgreSQL e os controles administrativos existentes. Não foi implementado nesta pesquisa.

## Experimento recomendado, ainda não executado

Usar seis letras fictícias revisadas, com diferentes gêneros, nomes com acentos, frases coloquiais e narrativas comuns. Gerar duas versões por letra e modelo, preservando o mesmo conteúdo cantado. Comparar às cegas fidelidade das palavras, pronúncia, naturalidade, refrão, arranjo, conclusão, duração, recusas, latência e custo.

Doze faixas de cada um dos quatro candidatos custariam nominalmente **US$4,26**: Pro0,96 +3.5 0,96 +V9 0,54 +V9.5 1,80. É uma proposta de experimento, não autorização para exceder o teto anterior deUS$3; não houve gasto nesta pesquisa. Um ensaio menor deve definir orçamento próprio e contabilizar eventuais tentativas cobradas.

Avaliar a escrita da letra em rodada separada, com briefing fixo e comparação de modelos de texto. Caso contrário, mudanças simultâneas de letra e áudio impedem saber de onde veio a melhora.

Evidência visual da tarifa9.5: `output/music-model-research/mureka-9-5-pricing.png`. Permanecem não comprovados: qualidade artística comparada, elegibilidade das nossas contas, custo de erros/bloqueios e condições comerciais negociadas. Nenhum fornecedor foi contratado ou trocado.
