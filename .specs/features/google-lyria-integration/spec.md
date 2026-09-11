# Google Lyria 3.5 Integration Specification

## Problem Statement

O worker só consegue gerar áudio por OpenRouter, embora o projeto precise comparar o Lyria 3.5 direto da API Google com o Lyria 3 Pro atualmente usado. A seleção atual é implícita no processo e os registros de áudio/uso gravam `openrouter` fixo, o que impede comparação confiável, troca segura de fornecedor e diagnóstico de recusas.

## Goals

- [x] Adicionar um adapter server-side para o Lyria 3.5 via Interactions API, sem alterar o prompt/ letra comum do domínio.
- [x] Permitir seleção explícita entre OpenRouter e Google e registrar provider, modelo, custo e erro por tentativa.
- [x] Executar uma comparação pequena, controlada e reproduzível somente depois de verificar o orçamento compartilhado da rodada.

## Out of Scope

| Feature                                                     | Reason                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Mureka V9/V9.5                                              | Alternativa posterior; nenhuma credencial foi confirmada.                                   |
| Alteração de prompt, letra ou regras editoriais             | A comparação deve atribuir diferenças ao modelo musical, não à escrita.                     |
| Multi-turn editing, extensão ou streaming Lyria             | Não é necessário para a fatia inicial e não está disponível no contrato atual do Lyria 3.5. |
| Nova fila, tabela ou migration específica de provider       | As colunas e a fila PostgreSQL existentes comportam a fatia.                                |
| Mudança de frontend, preço comercial, deploy ou homologação | São gates separados e permanecem fora desta entrega.                                        |

## Assumptions & Open Questions

| Assumption / decision         | Chosen default                                                                                            | Rationale                                                                                       | Confirmed? |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------- |
| Canal Google                  | `POST /v1beta/interactions` com `x-goog-api-key` e modelo `lyria-3.5`                                     | É o contrato oficial atual confirmado na documentação Google.                                   | y          |
| Retenção do prompt no Google  | Enviar `store: false`                                                                                     | O prompt contém letra e contexto pessoal; a integração não precisa de estado multi-turn.        | y          |
| Formato de áudio              | Aceitar MP3 padrão e WAV se o provedor declarar/retornar esse contêiner                                   | A documentação atual declara MP3 padrão e documenta WAV como opção; o storage já detecta ambos. | y          |
| Cobrança Google               | Sucesso registra `0.08` USD por chamada; falha registra `null` quando a cobrança não é demonstrável       | O preço publicado é por música e a resposta não fornece custo; não tratar `null` como zero.     | y          |
| Tentativas automáticas Google | Uma chamada por variante; 408/429/5xx podem voltar ao job durável, sem retry interno do adapter           | Evita duplicar custo durante o ensaio e preserva a recuperação administrativa existente.        | y          |
| Jobs antigos                  | Payload sem seleção continua em OpenRouter; jobs novos carregam provider/modelo                           | Impede que trocar configuração redirecione silenciosamente pedidos existentes.                  | y          |
| Amostra comparativa           | Duas letras fictícias idênticas entre os dois modelos, uma chamada por modelo/letra, sem retry automático | Amostra mínima nominal de US$0,32; qualidade artística continua sujeita a aceite humano.        | y          |

**Open questions:** none - all resolved or logged above.

## User Stories

### P1: Gerar áudio com fornecedor selecionável ⭐ MVP

**User Story**: As an operator, I want to choose the music provider through server-side configuration so that a new audio job can use Google Lyria 3.5 without changing existing OpenRouter jobs.

**Why P1**: A provider switch is the prerequisite for any valid comparison or future fallback.

**Acceptance Criteria**:

1. WHERE `MUSIC_PROVIDER=google`, the system SHALL require a non-empty Google API key for production startup and select the configured Google music model, defaulting to `lyria-3.5`.
2. WHERE `MUSIC_PROVIDER=openrouter` or the setting is absent, the system SHALL preserve OpenRouter as the default and require the existing OpenRouter music model in production.
3. WHEN a new paid or development-approved audio job is enqueued, the system SHALL persist its selected provider and model in the job payload without persisting a credential.
4. WHEN an audio job has no provider/model selection in its payload, the system SHALL interpret it as the legacy OpenRouter selection.
5. IF a provider is selected without the required credential or model, THEN the system SHALL fail startup in production or fail the audio operation before network I/O in development.

**Independent Test**: Parse configurations for both providers, inspect the payload of a newly enqueued job, and process a legacy `{}` job with a mocked provider.

### P1: Adaptar e registrar a chamada Google ⭐ MVP

**User Story**: As an operator, I want the worker to call the official Lyria 3.5 contract and persist sanitized outcomes so that refusals, latency and cost are auditable.

**Why P1**: Without a real provider boundary and usage ledger, the comparison cannot be trusted or recovered.

**Acceptance Criteria**:

1. WHEN the Google adapter generates audio, THEN the system SHALL send the common music prompt to `POST https://generativelanguage.googleapis.com/v1beta/interactions` with the selected model, `store:false`, and the API key only in a server-side header.
2. WHEN the Google response contains an audio block, THEN the system SHALL decode its base64 data, detect the returned audio container, and return a generation with the interaction id when present.
3. WHEN a Google generation succeeds, THEN the system SHALL record provider `google`, the exact selected model, latency, and cost `0.08` USD for that provider call in both the audio generation and AI usage records.
4. IF the Google response is rejected, blocked, times out, or has no audio, THEN the system SHALL record a sanitized status/error and SHALL NOT persist the request prompt, API key, or raw provider payload.
5. IF a Google response has HTTP 408, 429, or 5xx, THEN the system SHALL leave the job eligible for the existing durable retry path; for other HTTP 4xx failures, the system SHALL mark the operation terminal.
6. WHEN the worker completes a Google audio variant, THEN the system SHALL preserve the existing storage, review, delivery, and recovery transitions.

**Independent Test**: Mock the Interactions HTTP response and assert request headers/body, decoded bytes, metadata, sanitized failures, retry classification, and unchanged order/storage transitions.

### P2: Comparar modelos com evidência controlada

**User Story**: As a product owner, I want identical fictional lyrics sent to Lyria 3 Pro and Lyria 3.5 so that I can compare technical outcomes and listen to the resulting tracks without conflating lyric quality with model quality.

**Why P2**: The comparison informs supplier choice but is not required to keep the existing product operational.

**Acceptance Criteria**:

1. WHEN the comparison harness runs, THEN the system SHALL use the same two fictional lyric prompts, one call per model/lyric pair, and record a content hash without exposing private text in the report.
2. WHEN a comparison call is about to run, THEN the harness SHALL require an explicit paid-run flag and a caller-supplied shared budget that covers the nominal maximum of US$0.32.
3. IF the supplied budget is absent or below the nominal maximum, THEN the harness SHALL stop before provider network I/O.
4. WHEN a comparison call finishes, THEN the harness SHALL save only generated audio and sanitized metadata containing provider, model, status, external id, latency, cost, and error category.
5. The system SHALL report technical fidelity/recusal observations separately from human artistic acceptance and SHALL NOT select a new default from this sample alone.

**Independent Test**: Run the harness in dry-run/mock mode, verify its cost guard, identical-input hash, output contract, and no-secret/no-prompt logging.

## Edge Cases

- IF the Google key is present but the API returns a safety/content refusal, THEN the system SHALL preserve the refusal category and stop that call without editing or resubmitting the lyrics.
- IF the provider returns text/structure but no audio block, THEN the system SHALL treat the call as an error and not create a downloadable asset.
- IF a process crashes after a provider call, THEN the existing job/variant state SHALL remain recoverable and SHALL not silently mix providers on the next retry.
- IF the selected model returns an unsupported or unrecognized audio container, THEN the system SHALL fail before storage and record the provider/model context without raw bytes.
- IF the current preview web/API/worker ports are not the documented isolated stack, THEN browser evidence SHALL be labeled as a different stack and no paid generation SHALL be triggered.

## Requirement Traceability

| Requirement ID | Story                                         | Phase   | Status                                                     |
| -------------- | --------------------------------------------- | ------- | ---------------------------------------------------------- |
| GLY-01         | P1: Gerar áudio com fornecedor selecionável   | Execute | Implemented; local gates PASS; independent review recorded |
| GLY-02         | P1: Gerar áudio com fornecedor selecionável   | Execute | Implemented; local gates PASS; independent review recorded |
| GLY-03         | P1: Gerar áudio com fornecedor selecionável   | Execute | Implemented; local gates PASS; independent review recorded |
| GLY-04         | P1: Gerar áudio com fornecedor selecionável   | Execute | Implemented; local gates PASS; independent review recorded |
| GLY-05         | P1: Gerar áudio com fornecedor selecionável   | Execute | Implemented; local gates PASS; independent review recorded |
| GLY-06         | P1: Adaptar e registrar a chamada Google      | Execute | Implemented; local gates PASS; independent review recorded |
| GLY-07         | P1: Adaptar e registrar a chamada Google      | Execute | Implemented; local gates PASS; independent review recorded |
| GLY-08         | P1: Adaptar e registrar a chamada Google      | Execute | Implemented; local gates PASS; independent review recorded |
| GLY-09         | P1: Adaptar e registrar a chamada Google      | Execute | Implemented; local gates PASS; independent review recorded |
| GLY-10         | P1: Adaptar e registrar a chamada Google      | Execute | Implemented; local gates PASS; independent review recorded |
| GLY-11         | P1: Adaptar e registrar a chamada Google      | Execute | Implemented; local gates PASS; independent review recorded |
| GLY-12         | P2: Comparar modelos com evidência controlada | Execute | Live evidence captured; human listening pending            |
| GLY-13         | P2: Comparar modelos com evidência controlada | Execute | Live evidence captured; human listening pending            |
| GLY-14         | P2: Comparar modelos com evidência controlada | Execute | Live evidence captured; human listening pending            |
| GLY-15         | P2: Comparar modelos com evidência controlada | Execute | Technical evidence documented; human listening pending     |
| GLY-16         | P2: Comparar modelos com evidência controlada | Execute | Implemented; independent review PARTIAL; sensor pending    |

**Coverage**: 16 total, 16 mapped to tasks, 0 unmapped.

## Success Criteria

- [x] Unit and integration tests prove both provider selections and Google response/error parsing without network calls.
- [x] Existing OpenRouter tests and recovery behavior remain green, with no migration or secret leakage.
- [ ] A dry-run comparison proves the budget guard before any paid call; a real comparison is reported only if the shared budget is verified.
- [x] Technical results and limitations are documented without declaring artistic superiority or production readiness.
