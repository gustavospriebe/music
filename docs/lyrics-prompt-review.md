> HISTÓRICO — documento anterior à remediação de 12/09/2026. Comandos, modelos, orçamento e alegações de prontidão abaixo podem estar superados e não autorizam nova execução. Use o [mapa vigente](documentation-map.md) para implementação e operação.

# Revisão editorial do prompt de letra

## Diagnóstico

O prompt anterior de `apps/api/src/providers.ts` priorizava JSON, fatos literais e segurança, sem orientar cadência, refrão memorável, desenvolvimento dos versos ou naturalidade. A validação estrutural aceita uma letra que contém refrão e fatos; ela não comprova musicalidade.

Nas letras fictícias anteriores aparecem expressões como “O segredo da vida é o bem-estar vital” e “Pequenas memórias viram monumentos”. A primeira soa escolhida pela rima; a segunda troca uma cena particular por uma conclusão genérica. Esse é um julgamento editorial fundamentado nas amostras, não uma medida objetiva de gosto.

O áudio recebe `fullLyrics` com instrução de interpretar as palavras aprovadas. Portanto, preservar uma letra fraca nessa etapa é coerente com a aprovação; o ponto de ajuste está na composição. Nenhuma letra histórica foi alterada nesta revisão.

## Ajuste aplicado

O prompt agora orienta escrita cantável, respiração e acentos naturais; um gancho e retorno explícito do refrão; cenas e progressão; remoção de rimas artificiais, frases genéricas e imagens contraditórias. Extensão e forma continuam adaptáveis ao gênero. Uma revisão editorial antes do JSON procura linhas que existem apenas para completar rimas.

`sections` e `fullLyrics` devem conter as mesmas palavras cantadas na mesma ordem, incluindo repetições completas. Passagens somente instrumentais ficam fora das seções cantadas; instrumentos pertencem a `musicalDirection.instrumentation`. Refinar deve preservar trechos fora do pedido de alteração. Fatos obrigatórios permanecem literais, mas podem atravessar quebras de linha. Segurança, privacidade, limites e validator não mudaram; não foram acrescentadas heurísticas de sílabas/rimas nem retries de qualidade.

## Evidência e limites

Foram feitas quatro chamadas reais de texto com `google/gemini-3-flash-preview`, em duas iterações e dois briefings fictícios já usados anteriormente. Não houve geração de áudio nem escrita de pedidos no banco. Custos reportados: **US$0,015545** nesta revisão; consumo acumulado observado da rodada **US$0,6648398**, dentro dos US$3 autorizados.

A primeira iteração trouxe retornos explícitos do refrão, mas manteve clichês e inseriu uma indicação instrumental no texto cantado. Ela está preservada em `output/lyrics-prompt-review/iteration-1/`. O segundo ajuste eliminou essa indicação nas duas amostras e manteve correspondência entre seções e letra completa.

O resultado artístico final foi **parcial**:

- **Viagem entre amigos:** piorou na amostra. O gancho anterior “Perdidos na estrada, achamos o mar” era mais claro que “O destino é só a nossa confiança / Nesse azul que não é engano”. A nova letra ficou mais longa e repetitiva.
- **Recomeçar devagar:** melhorou na amostra. O refrão “Vou deixar o dia entrar devagar / Sem correr contra o ponteiro / Sentir o gosto do café primeiro” é mais concreto. Ainda há mudança de ponto de vista e metáforas forçadas.

Não há evidência de melhora artística consistente do modelo com o novo prompt. Ele corrige omissões de orientação e apresentou ganhos estruturais, mas não constitui receita validada de qualidade. As comparações usam respostas anteriores salvas, não um experimento aleatório controlado; prosódia definitiva depende também da melodia. A revisão independente usa cinco eixos: gancho, prosódia, repetição, especificidade e naturalidade. O próximo experimento deve comparar modelos de texto com os mesmos briefings e avaliação humana, antes de trocar a configuração.

Provider5/domain10 testes PASS; typecheck/lint/build/formato pertinentes PASS. Testes verificam contratos, não gosto. Evidências e comparação integral: `output/lyrics-prompt-review/`; revisão independente em `editorial-review.md`. `.env`, modelo configurado, worker e histórico preservados. Sem commit/push/deploy.
