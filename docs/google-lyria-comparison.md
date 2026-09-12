> HISTÓRICO — documento anterior à remediação de 12/09/2026. Comandos, modelos, orçamento e alegações de prontidão abaixo podem estar superados e não autorizam nova execução. Use o [mapa vigente](documentation-map.md) para implementação e operação.

# Comparação controlada: OpenRouter Lyria 3 Pro × Google Lyria 3.5

## Estado

O adapter e o comparador foram executados em rodada live autorizada em 2026-09-08. As quatro chamadas técnicas terminaram com sucesso; a escuta humana ainda está pendente. Nenhum modelo é promovido a default por este documento.

## Desenho do ensaio

- duas letras fictícias, sem dados pessoais;
- cada prompt é enviado uma vez a cada modelo, com o mesmo hash de prompt;
- quatro chamadas no total, sem retry interno;
- teto nominal: `4 × US$0,08 = US$0,32`;
- OpenRouter: `google/lyria-3-pro-preview`;
- Google direto: `lyria-3.5` pela Interactions API;
- áudio e metadados sanitizados ficam em `output/google-lyria-comparison/`, que não é versionado.

## Evidência técnica

Rodada: `output/google-lyria-comparison/2026-09-08T12-14-53-374Z/manifest.json`.

- `callCount`: `4`; `budgetProvidedUsd`: `0.32`; teto nominal: `US$0.32`.
- Os quatro resultados tiveram status normalizado `ok`, sem retry interno.
- Cada par usou o mesmo hash de prompt: padaria `2e3166f95e0730651ab1cca455b6cfd99974d19ea02c435d597f267187080248`; trem noturno `c5790a1759c124dc41c9366cabf5acff6287f0a18074db8b38cadd2c6d03c9ef`.
- Cada chamada registrou custo conhecido de `US$0.08`; total observado: `US$0.32`.

| Prompt fictício         | OpenRouter `google/lyria-3-pro-preview` |       Google `lyria-3.5` |
| ----------------------- | --------------------------------------: | -----------------------: |
| `fictional-bakery`      |                `ok`, 36.518 ms, US$0.08 | `ok`, 42.096 ms, US$0.08 |
| `fictional-night-train` |                `ok`, 34.396 ms, US$0.08 | `ok`, 45.646 ms, US$0.08 |

Os quatro arquivos foram gravados como MP3; a inspeção local identificou 192 kbps, 44,1 kHz e estéreo conjunto. Os request ids fornecidos pelo OpenRouter estão no manifesto; a API Google não retornou `externalId` nesta rodada. Não copiar prompts, chaves, payloads privados ou respostas integrais de provider para este relatório.

## Avaliação humana

Pendente. Arquivos para escuta:

- `output/google-lyria-comparison/2026-09-08T12-14-53-374Z/fictional-bakery-openrouter.mp3`
- `output/google-lyria-comparison/2026-09-08T12-14-53-374Z/fictional-bakery-google.mp3`
- `output/google-lyria-comparison/2026-09-08T12-14-53-374Z/fictional-night-train-openrouter.mp3`
- `output/google-lyria-comparison/2026-09-08T12-14-53-374Z/fictional-night-train-google.mp3`

A comparação técnica não decide qualidade artística. Depois de ouvir os quatro arquivos, registrar separadamente inteligibilidade, aderência ao briefing, arranjo, voz/mix e artefatos percebidos, identificando quais arquivos foram escutados.

## Limitações

O ensaio é pequeno, não é homologação, não prova disponibilidade contínua, não valida pagamento/produção em Railway e não substitui CI remoto ou produção. O resultado técnico não escolhe um novo default. Custo desconhecido de uma falha permanece desconhecido; não deve ser tratado como zero.
