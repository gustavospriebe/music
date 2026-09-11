# Correções do estúdio após teste humano

## Experiência corrigida

O teste humano identificou falhas que os gates anteriores não representavam: intenção sobrescrevia ocasião; estilo e clima tinham dois controles simultâneos; a preparação em quatro partes desembocava em um contador de cinco fases; a falta de configuração só aparecia depois de salvar.

Intenção agora chega separadamente ao contexto criativo. Ocasião é opcional em `custom_song`, sem alterar contratos legados. Estilo e clima têm seleção única acessível e opção “Outro”; o texto personalizado é preservado ao alternar, voltar e restaurar o rascunho. O estúdio mantém o mesmo visual até a entrega, com um único trilho por nomes e sem contador conflitante. A disponibilidade da letra aparece antes de preencher. Rótulos de homenagem foram retirados do checkout genérico e ocasião vazia não cria conteúdo vazio no resumo.

## Geração real e limite encontrado

O usuário autorizou até **US$ 3** para esta rodada. O launcher foi ampliado com opt-in seletivo, mantendo pagamento e email locais, capas desligadas e resposta de letra limitada a 8192 tokens. O `.env` permaneceu intacto. Foram usados os modelos existentes, sem trocar fornecedor.

Um pedido fictício do principal percorreu no browser do Codex: preparação, gravação real na API/PostgreSQL, geração de letra, aprovação, pagamento simulado, produção de duas versões, revisão administrativa funcional e entrega privada. Não houve aceite artístico/comercial nem envio real de email.

| Evidência                     | Resultado                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| Letra via OpenRouter          | Uma chamada bem-sucedida, US$ 0,003668                                                                  |
| Áudio via OpenRouter          | Duas chamadas bem-sucedidas, US$ 0,16                                                                   |
| Custo do pedido de teste      | **US$ 0,163668**                                                                                        |
| Arquivos                      | Dois MP3 estéreo, 44,1 kHz, 120,61 s e 126,75 s; `ffprobe` PASS                                         |
| Entrega                       | Estado `delivered`, dois links privados visíveis no browser; email em arquivo local                     |
| Diferença de consumo da conta | US$ 0,3804513 entre 21:47:43 e 21:58:38 UTC; inclui uso concorrente, não é custo exclusivo deste pedido |

Uma tentativa posterior de áudio recebeu **HTTP 402**. A consulta autenticada, em leitura, confirmou **US$ 0,495132911 disponíveis sob o limite da chave**, menor que os US$ 0,50 exigidos na resposta do provider para iniciar áudio. O saldo da conta e o limite da chave são distintos. Não foi alterado o limite de US$ 25 da chave. Para continuar áudio, o responsável precisa disponibilizar pelo menos a reserva mínima nessa chave em [OpenRouter Keys](https://openrouter.ai/settings/keys), preservando o teto autorizado da rodada. Referência da consulta: [Get current API key](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key).

Esse erro também revelou retry inútil de job para falha permanente. A correção UAT-05 encerra erros HTTP permanentes sem repetir automaticamente; retomada administrativa continua possível depois de corrigir a causa. O launcher não é um controlador monetário global.

## Validação e rastreabilidade

- Regressões reproduziram as falhas antes da correção.
- Gate independente `pnpm check`: 201 testes PASS no primeiro snapshot; três mutações comportamentais foram detectadas.
- Estado final da interface: **76 testes unitários, 44 E2E e React Doctor 100/100**. Lint, typecheck e build passaram, incluindo remoção do trilho redundante.
- API: 64 testes; contratos: 16; domínio: 10. Launcher: nove combinações e dois casos negativos, sem rede ou exposição de segredos.
- Verificação independente e cobertura adicional do erro 402: `.specs/features/studio-flow-uat-fixes/validation.md`.
- Logs, capturas, metadados de áudio e consultas sanitizadas de consumo: `output/studio-flow-uat-fixes/` (ignorado no Git).

O rascunho do usuário em `localhost` foi preservado; o principal usou `127.0.0.1` para isolar o armazenamento do browser. A aprovação administrativa foi um ensaio funcional local. CI remoto e Railway continuam sem mudança; não houve commit, push ou deploy. Esta rodada não homologa cobrança, email externo, storage de produção, capas ou qualidade artística.
