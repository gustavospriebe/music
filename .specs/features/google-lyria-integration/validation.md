# Google Lyria 3.5 Integration — Validation

**Data**: 2026-09-08  
**Status**: PARTIAL  
**Escopo**: verificação independente pós-execução, somente leitura do código, das evidências existentes e do manifesto live indicado pelo usuário.  
**Diff range**: worktree atual; não foi criado commit.  
**Providers/rede/banco**: não usados nesta verificação; nenhuma chamada adicional, alteração de banco ou geração paga foi feita.

## Status

T1–T6 têm implementação e evidência de testes focados. A rodada live de T7 também está comprovada tecnicamente: quatro chamadas bem-sucedidas, dois prompts fictícios com hash idêntico dentro de cada par, quatro áudios gravados e custo observado de US$0,32. O status geral permanece `PARTIAL` porque a escuta humana, o sensor de discriminação e gates não executados nesta verificação continuam pendentes. Nenhum vencedor artístico ou novo default é declarado.

## Revisão independente P1 / T1–T6

| Task                            | Evidência independente                                                                                                                                                                                                                                                | Resultado                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| T1 — ambiente API               | `apps/api/src/env.ts:23-25,47-52,68-77` valida seleção, defaults, modelo Google e credenciais de produção; `apps/api/src/env.test.ts:13-18,30-48,51-75` cobre defaults, Google e falhas.                                                                              | PASS na evidência existente             |
| T2 — adapter Google             | `apps/worker/src/worker.ts:549-645` implementa uma chamada sem retry, header server-side, `store:false`, parsing de áudio, custo e erros; `apps/worker/src/worker.test.ts:319-453` verifica MP3/WAV, sanitização, classificação e ausência de fetch sem configuração. | PASS na evidência existente             |
| T3 — preview seguro             | O contrato de preview e CLI sem efeito de rede está descrito em `tasks.md:105-127`; a evidência executada do CLI está abaixo.                                                                                                                                         | Evidência documental; sem gate dedicado |
| T4 — persistência worker        | `apps/worker/src/worker.ts:879-952,1003-1063` resolve seleção por payload, mantém fallback OpenRouter e registra provider/model/custo; `apps/worker/src/flow.test.ts:654-749` verifica sucesso Google, falha sanitizada e transições.                                 | PASS na evidência existente             |
| T5 — snapshot no enqueue        | `apps/api/src/app.ts:126-132,931-996` e `apps/api/src/flow.test.ts:294-303,314-357` cobrem payload OpenRouter/Google e ausência de chave/letra.                                                                                                                       | PASS na evidência existente             |
| T6 — recuperação administrativa | `apps/api/src/admin-recovery.test.ts:343-431` verifica retry preservado, regeneração de variante com seleção Google e rebuild com configuração atual; `apps/api/src/app.ts:2128-2203` implementa essa separação.                                                      | PASS na evidência existente             |

### Critérios P1 observados

- Seleção/defaults e bloqueio antes de I/O: `apps/api/src/env.test.ts:13-18,30-75`; `apps/worker/src/worker.test.ts:88-123,443-453`.
- Contrato Google, bytes, MIME, id externo, custo e latência: `apps/worker/src/worker.test.ts:319-361`; implementação em `apps/worker/src/worker.ts:570-630`.
- Retry HTTP 408/429/5xx sem retry interno e terminalidade de outros 4xx: `apps/worker/src/worker.test.ts:364-408`; classificação em `apps/worker/src/worker.ts:497-504`.
- Falhas sem áudio, recusa e container não suportado sem custo afirmado: `apps/worker/src/worker.test.ts:410-440`.
- Persistência e transições normais: `apps/worker/src/flow.test.ts:654-748`.
- Compatibilidade legacy e recuperação sem mistura silenciosa: `apps/worker/src/worker.ts:879-901`; `apps/api/src/admin-recovery.test.ts:343-431`.

## T7 — evidência live e contrato dry-run

Manifesto live verificado: `output/google-lyria-comparison/2026-09-08T12-14-53-374Z/manifest.json:1-59`.

| Prompt fictício         | Hash comum do par                                                  | OpenRouter               | Google                   |
| ----------------------- | ------------------------------------------------------------------ | ------------------------ | ------------------------ |
| `fictional-bakery`      | `2e3166f95e0730651ab1cca455b6cfd99974d19ea02c435d597f267187080248` | `ok`, US$0,08, 36.518 ms | `ok`, US$0,08, 42.096 ms |
| `fictional-night-train` | `c5790a1759c124dc41c9366cabf5acff6287f0a18074db8b38cadd2c6d03c9ef` | `ok`, US$0,08, 34.396 ms | `ok`, US$0,08, 45.646 ms |

Evidência agregada: `mode: live`, `callCount: 4`, `budgetProvidedUsd: 0.32` e teto nominal de US$0,32 (`manifest.json:2-5`). Os quatro resultados têm `status: ok` (`manifest.json:7-59`), o custo soma US$0,32 (`manifest.json:14,27,40,53`) e as latências aparecem em `manifest.json:12,15,25,28,38,41,51,54`. Os quatro arquivos referenciados existem e são não vazios: `fictional-bakery-openrouter.mp3` (4.097.477 bytes), `fictional-bakery-google.mp3` (4.326.937 bytes), `fictional-night-train-openrouter.mp3` (4.284.305 bytes) e `fictional-night-train-google.mp3` (4.380.853 bytes).

O comparador que produziu o manifesto fixa os dois prompts e seus hashes em `scripts/compare-music-models.ts:17-42`, executa cada caso uma vez em `scripts/compare-music-models.ts:135-149` e grava apenas metadados sanitizados/áudio em `scripts/compare-music-models.ts:150-187`.

### Segredos e prompts no manifesto

Verificações somente leitura executadas sobre o manifesto:

```text
jq -e '.. | objects | has("prompt") or has("lyrics") or has("apiKey") or has("secret") or has("authorization") or has("headers")' .../manifest.json
=> PASS — nenhum campo sensível ou prompt

rg -n -i 'api[_-]?key|secret|authorization|bearer|password|access[_-]?token|private[_-]?key' .../manifest.json
=> PASS — nenhum segredo textual
```

O campo `promptHash` aparece somente como hash SHA-256 (`manifest.json:11,24,37,50`); o texto dos prompts não está no manifesto. Os demais campos foram inspecionados por `jq` e contêm somente provider/model, hash, custo, latência, IDs, status e caminhos de áudio.

### Dry-run pré-existente

Comando executado:

```text
pnpm --filter @resenha/worker exec tsx ../../scripts/compare-music-models.ts --dry-run
```

Resultado observado: exit 0; `mode: "dry-run"`, `callCount: 4`, quatro pares com hashes iguais entre providers, `nominalCeilingUsd: 0.32`, `networkCalls: 0` e saída `output/google-lyria-comparison`. O contrato está implementado em `scripts/compare-music-models.ts:93-108`; os modelos e prompts fixos estão em `scripts/compare-music-models.ts:11-42`.

O dry-run continua sendo evidência de proteção contra execução acidental: a guarda de flags/orçamento/chaves está em `scripts/compare-music-models.ts:80-90,116-128`. A evidência live acima cobre a parte técnica de GLY-12–GLY-14; GLY-15 continua parcial até a escuta humana.

## Comandos e resultados

| Comando                                                                                                                         | Resultado                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`                                                                                                                    | PASS registrado anteriormente — 311 testes, lint, typecheck e build; não reexecutado nesta verificação                                     |
| Testes focados existentes                                                                                                       | PASS registrado anteriormente — API env 10/10, worker unit 38/38, worker flow 24/24 e API full 105/105; não reexecutados nesta verificação |
| `pnpm --filter @resenha/worker exec tsx ../../scripts/compare-music-models.ts --dry-run`                                        | PASS registrado anteriormente — exit 0, 0 chamadas de rede                                                                                 |
| `python3 /Users/gustavopriebe/.codex/skills/tlc-spec-driven/scripts/validate_spec.py .specs/features/google-lyria-integration`  | PASS estrutural, 0 erros                                                                                                                   |
| `python3 /Users/gustavopriebe/.codex/skills/tlc-spec-driven/scripts/validate_tasks.py .specs/features/google-lyria-integration` | PASS estrutural, 0 erros; 1 aviso documentado para T3 sem teste dedicado                                                                   |
| `git diff --check`                                                                                                              | PASS                                                                                                                                       |
| Gate de banco, providers pagos e rede                                                                                           | Não executado por escopo explícito                                                                                                         |

## Sensor de discriminação

Pendente. Houve uma tentativa em cópia temporária `/tmp/music-lyria-sensor.mIKzaW`, com três mutações preparadas (`store:true`, classificação HTTP `>500` e URL singular). O primeiro teste falhou antes da coleta por dependência ausente (`@aws-sdk/client-s3`); a dependência foi copiada, mas a tentativa foi interrompida antes de repetir os testes. Portanto não há contagem de mutantes mortos/sobreviventes e isso não constitui PASS implícito. O worktree real não foi mutado; a cópia temporária foi removida depois.

## Escuta humana / UAT

Pendente. A existência dos quatro arquivos e o sucesso técnico não determinam qualidade artística. Ainda é necessário ouvir os quatro áudios e registrar separadamente inteligibilidade, aderência ao briefing, arranjo, voz/mix e artefatos percebidos. Nenhum modelo foi promovido a default.

## Gates não executados

Não foram executados nesta verificação, por escopo explícito do usuário: testes que exigiriam banco; qualquer chamada de rede/provider ou nova geração paga; sensor concluído em scratch; CI remoto, Railway, homologação ou produção; e `validate_state.py`, pois o veredicto permanece `PARTIAL`.

## Arquivos alterados

- `.specs/features/google-lyria-integration/validation.md` — único arquivo escrito por esta verificação.

## Riscos e dúvidas

- A amostra tem somente dois prompts e quatro chamadas; ela não sustenta uma decisão artística ou mudança de default.
- A latência e o custo são evidências desta rodada, não garantia de disponibilidade ou preço futuro.
- O worktree já continha muitas alterações não relacionadas; nenhuma foi limpa, revertida ou modificada por esta verificação.

## Requirement Traceability

| Requirement   | Resultado desta verificação                                                               |
| ------------- | ----------------------------------------------------------------------------------------- |
| GLY-01–GLY-11 | Evidência de implementação/testes existente revisada; sem novo gate de banco nesta rodada |
| GLY-12–GLY-14 | Evidência live PASS: quatro chamadas, pares com hashes iguais, custo e áudio              |
| GLY-15        | Evidência técnica documentada; escuta humana permanece pendente                           |
| GLY-16        | Contrato de saída/sanitização revisado; sensor permanece pendente                         |
