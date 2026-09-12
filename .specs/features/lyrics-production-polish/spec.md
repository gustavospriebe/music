# Refinamento da letra, checkout e produção

> Registro histórico de um recorte anterior. O modelo vigente e a evidência atual estão em [docs/documentation-map.md](../../../docs/documentation-map.md) e [audit-remediation](../audit-remediation/spec.md). Este registro não autoriza publicação nem gasto com providers.

## Problema observado pelo usuário

Depois de preparar a história, o cliente encontra uma tela intermediária e uma letra com duas ações pouco explicativas. A edição não convida a adaptar o resultado. Condições comerciais ausentes viram scaffold visível, e o acompanhamento parece parado. A capa precisa poder ser testada com configuração real.

## Critérios de aceite

- **EDIT-01**: WHEN a letra estiver pronta THEN o estúdio SHALL apresentar leitura legível e entrada clara na edição, incluindo título, estrofes e revisão; alterações pendentes têm salvar/descartar explícitos e não podem ser aprovadas silenciosamente.
- **EDIT-02**: WHEN o cliente pedir nova direção para uma versão salva THEN o sistema SHALL gerar uma nova versão histórica a partir dela e de instruções limitadas, preservando história, limites de geração, autorização e regras de segurança. A chamada paga é explícita; não ocorre no carregamento da tela.
- **PAY-02**: WHEN políticas comerciais não estiverem preenchidas THEN o checkout SHALL informar a indisponibilidade em linguagem curta e apresentar apenas condições realmente configuradas, preservando os gates de cobrança.
- **PROGRESS-01**: WHEN a produção estiver ativa THEN o cliente SHALL ver atividade e estado atual com atualização periódica, distinguindo geração, fila e revisão humana. Quantidades são reais; não há porcentagem ou prazo inventado. A letra fica disponível sem dominar o acompanhamento, e redução de movimento é respeitada.
- **COVER-01**: WHEN o modo de preview de capa for explicitamente ativado THEN API e worker SHALL usar os modelos existentes com credenciais seletivas, mantendo pagamento/email locais; o teste real cabe no orçamento autorizado de US$ 3 e não contorna limites do provider.
- **PROGRESS-02**: WHEN um job ou estado automático estiver ativo no detalhe administrativo THEN a tela SHALL consultar o andamento periodicamente até a conclusão ou falha. Falha transitória de consulta preserva o último resultado com aviso; sessão expirada oculta os dados. O cliente SHALL substituir produção por falha ao receber o estado terminal, sem iniciar outra geração.
- **EDIT-03**: WHEN a aplicação compuser uma letra THEN a orientação SHALL priorizar cadência cantável, gancho e retorno do refrão, desenvolvimento concreto do tema e revisão de rimas artificiais. O texto cantado SHALL conter as repetições completas e corresponder às seções, sem instruções instrumentais. Fatos obrigatórios, segurança, privacidade e escopo do refinamento permanecem preservados. Musicalidade SHALL ser avaliada editorialmente em amostras, sem converter preferência artística em bloqueios automáticos ou retries pagos.

## Frentes e decisões

Frontend: apps/web; backend: API, contratos e testes após fechar UAT-05 do worker; principal: configuração, browser, integração e docs. Verificador independente confronta contrato, preservação histórica, gates e estados. WIP preservado, sem commit/push/deploy.

O refinamento de IA usa body opcional no endpoint de geração existente, com instruções de 3–1000 caracteres e referência à versão atual salva. A edição pendente deve ser salva ou descartada antes dessa ação. Versões antigas não são reescritas e não há alteração da história por sugestão.

## Validação

Testes de regressão para edição, descarte, aprovação, refinamento e concorrência; políticas parciais/ausentes; estados de geração/revisão e movimento reduzido; testes de configuração de capas sem rede. Unit/E2E/lint/typecheck/build/React Doctor pertinentes e browser real. Geração real depende da reserva disponível na chave, distinta do saldo da conta; autorizações anteriores permanecem válidas até US$ 3 nesta rodada, sem ampliação de limite da chave.
