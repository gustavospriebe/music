> HISTÓRICO — documento anterior à remediação de 12/09/2026. Comandos, modelos, orçamento e alegações de prontidão abaixo podem estar superados e não autorizam nova execução. Use o [mapa vigente](documentation-map.md) para implementação e operação.

# Estúdio de letra e acompanhamento

## Comportamento entregue

A história salva leva a uma preparação contextual da letra, com resumo e uma ação explícita de geração. Nenhuma chamada paga ocorre no carregamento da tela.

A letra pronta abre em leitura por estrofes. “Editar letra” permite mudar título e versos, com indicação de alterações pendentes, salvar e descartar. Aprovar ou pedir refinamento exige primeiro salvar ou descartar. Refetch não apaga o trabalho em andamento. O histórico permite consultar versões anteriores sem editar uma versão histórica nem substituir silenciosamente o rascunho atual.

“Quer outra direção para a letra?” oferece sugestões que apenas preenchem a orientação e um campo livre. “Criar nova versão” chama a IA explicitamente com a última versão salva. O limite existente de quatro gerações no total permanece: primeira letra e até três novas gerações. Edições manuais não consomem esse limite. Em caso de falha do refinamento, a versão anterior permanece disponível no editor.

O checkout mostra apenas condições comerciais preenchidas. Sem políticas, o card de placeholders desaparece; avisos de cobrança local ou indisponibilidade permanecem junto à ação. Os gates de preço, provider e prontidão comercial continuam no servidor.

O acompanhamento distingue fila, geração e revisão humana. Mostra atividade, última consulta e quantidade real de versões concluídas. A variante persiste `processing` antes da chamada, `completed` após armazenar e `failed` em caso de erro. A contagem avança com dados reais, sem porcentagem ou prazo fictício. A letra começa recolhida e o indicador respeita redução de movimento.

O detalhe administrativo também consulta a cada cinco segundos enquanto há job pendente/em processamento ou etapa automática. Ao concluir ou falhar, a consulta periódica termina. Uma falha transitória de rede mantém o último resultado com aviso explícito; expiração da sessão oculta os dados. O acompanhamento público já substituía a atividade pela falha, agora coberto por regressão temporal.

## Contratos e retomada

`POST /api/v1/orders/:publicId/lyrics/generate` mantém geração sem body e aceita refinamento com `{ instructions, baseVersion }`: instruções de 3–1000 caracteres e número positivo da versão atual salva. A API valida acesso, segurança, versão, status e limite sob lock da ordem. Salvar/aprovar compartilham esse lock. Nenhuma chamada usa base ultrapassada por edição concorrente.

O provider recebe instruções criativas separadas do feedback de validação. A base usa título, letra completa e direção musical; estrofes antigas não contradizem uma edição manual. Dados de contato e consentimento continuam fora do prompt. A resposta passa pela validação de conteúdo e gera nova versão histórica.

Retry administrativo de job exaurido agora garante pelo menos uma tentativa adicional, preservando `attempts` histórico. Repetir o clique sem nova execução não aumenta continuamente o orçamento de tentativas. Erros HTTP permanentes de áudio encerram o job; 408, 429 e 5xx mantêm retry limitado.

## Configuração e ensaios reais

`PREVIEW_AI=all` habilita seletivamente letra, áudio e modelos de capa, mantendo web sem credenciais e cobrança/email locais. O worker com IA roda sem watch; mudanças de código exigem reinício deliberado, evitando interrupções de chamadas pagas por HMR. O `.env` não foi alterado.

Com orçamento de até US$3 autorizado pelo usuário, o browser do Codex validou:

- Um pedido fictício com letra, dois MP3 e entrega privada; depois uma capa real exibida e disponível para download. Custo reportado desse pedido: US$0,197398, incluindo capa US$0,03373.
- Outro pedido fictício com geração inicial, alteração manual de título/verso, descarte, consulta de histórico e refinamento real. A versão1 foi preservada, a edição tornou-se versão2 e a IA criou versão3 com o título editado; o contador de novas gerações passou de3 para2.
- Checkout sem card de condições vazias e geração de áudio com atividade e estados reais por versão.

O segundo pedido terminou com duas versões reais concluídas e estado de revisão humana; o browser mostrou0/2 com a primeira variante “Em criação” e depois2/2 prontas. Letra inicial e refino desse pedido custaramUS$0,00711; os dois áudios,US$0,16. Somando os dois pedidos fictícios do principal, os custos identificados sãoUS$0,364508. O aumento observado no consumo da conta durante a rodada foiUS$0,6492948 até22:29UTC, incluindo uso concorrente do usuário, abaixo do teto autorizado. Custos desconhecidos nas recusas não foram tratados como zero; a diferença da conta foi conferida separadamente.

A conta OpenRouter tinha saldo, mas sua chave estava sob um limite separado. O usuário removeu esse limite. A retomada de seu pedido deixou de receber402, mas duas chamadas de áudio foram recusadas pelo filtro do modelo; não foi atribuído um motivo específico ao texto nem alterada sua letra. Recusa de provider e sucesso dos pedidos fictícios são evidências diferentes. Não houve aceite artístico, cobrança real, email externo, deploy ou alteração de limite financeiro pelo agente.

## Validação

- Verificação independente `pnpm check`: **247 testes PASS** (web84, API85, worker42, contracts17, domain10, providers9), formato, lint, typecheck e build.
- **46 E2E PASS**, React Doctor completo **100/100**, sem supressões.
- **Sete mutações comportamentais detectadas**: versão obsoleta, teto de geração, segurança da base salva, recuperação de falha, aprovação com edição pendente, contagem fictícia e falha de variante.
- Launcher: 12 combinações de modos/serviços e seis casos negativos, sem rede ou secrets em saída.
- Último ajuste de linguagem evita afirmar que alguém já está ouvindo: `review_required` mostra “Versões prontas para revisão”, e `revision_requested`, “Ajuste aguardando avaliação”. Validado por7 testes unitários e2E2E focais; React Doctor permanece100/100.
- Especificação e verificação independente: `.specs/features/lyrics-production-polish/`.
- Evidências locais: `output/lyrics-production-polish/`. Custos finais e progresso observado ficam nos artefatos sanitizados, sem chaves.

WIP anterior preservado. Sem commit/push/deploy. Gates locais, chamadas reais específicas, aceite humano e produção permanecem separados.

## Retorno de UAT: pedido sem atualização

Conferência de banco e browser confirmou que o pedido do usuário estava em falha terminal desde22:18:20UTC, por `PROHIBITED_CONTENT`, sem áudio em processamento. A capa havia concluído. A sessão original do cliente mostrou a falha e a capa; a captura enviada não correspondia ao estado atual. Não se atribuiu um trecho específico como causa da recusa e não houve reenvio pago nesta verificação.

O detalhe administrativo tinha uma lacuna reproduzida: após consultar um job ativo, não buscava seu resultado sozinho. PROGRESS-02 corrige esse acompanhamento. Validação independente focal:35 testes PASS (admin15, público2, jornada18), lint/typecheck/build PASS, React Doctor100/100 e duas mutações de polling detectadas em cópia descartável. O total247 acima permanece o último gate integrado, não uma repetição nesta rodada. Logs focais em `output/lyrics-production-polish/status-followup/`; captura atual em `customer-failure-current.png` na pasta de evidências da feature.
