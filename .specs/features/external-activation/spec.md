# Ativação externa e homologação

Status: em execução. Autorização: pedido do dono em 12/09/2026 para avançar com Railway, Resend e AbacatePay configurados. Esta etapa sucede a remediação local; não transforma seus testes sintéticos em prova externa.

## Resultado esperado

Publicar uma revisão coerente do produto único e comprovar o que os ambientes conectados permitem. A venda pública permanece fechada enquanto preço, condições comerciais e pagamento de produção não forem aprovados. Chamadas pagas de IA e envio ao endereço de teste dependem do limite solicitado ao dono nesta etapa.

## Critérios de aceite

- **EXT-01**: Ao promover, o sistema deve executar API, web e worker no mesmo SHA aprovado pelo CI. API antiga e worker antigo devem estar drenados antes de alterar o schema incompatível. O journal remoto deve corresponder aos hashes versionados.
- **EXT-02**: Antes de migrar dados remotos, deve existir dump privado restaurável. A atualização de uma cópia isolada desses dados deve passar. Falta de backup nativo ou destino independente deve ser registrada, não omitida.
- **EXT-03**: Ao consultar cobrança ou autenticar webhook, o adapter deve exigir correspondência exata entre sandbox/live configurado e devMode recebido, sem depender de NODE_ENV. Produção conserva assinatura e cookies seguros.
- **EXT-04**: Ao criar checkout sandbox no servidor de produção, a API deve exigir sessão administrativa e capability do pedido, letra aprovada, preço positivo e provider configurado. Flags do cliente não concedem exceção; o checkout público permanece bloqueado.
- **EXT-05**: Cada tentativa nova deve persistir ambiente live/sandbox/local. Matching e deduplicação devem considerar ambiente. Histórico sem prova permanece NULL e não autoriza reconciliação externa automática nem reclassificação de dinheiro.
- **EXT-06**: Totais de receita, pagamentos e reembolsos comerciais devem contar somente live. Testes e histórico não classificado devem permanecer identificáveis. Custo de IA inclui consumo real em testes e não representa lucro.
- **EXT-07**: Homologação deve distinguir consulta de credenciais, checkout de teste criado, simulação no gateway, webhook autenticado, reconciliação e produção. Nenhuma etapa é PASS sem execução correspondente. PIX sandbox não é venda ou PIX real.
- **EXT-08**: Entrega externa exige envio efetivo, observação do resultado, arquivos privados e restauração de objeto. Uma listagem vazia do bucket ou domínio verificado não satisfaz essa prova.
- **EXT-09**: O navegador deve acessar a API na mesma origem da web; URLs internas do Railway não podem entrar no bundle. O proxy de produção deve preservar caminho/query, cookies, uploads e Range, sem converter erros HTTP da API em HTML da SPA.

## Limites

Sem trocar de gateway, reintroduzir aliases de rotas, falsificar confirmação do gateway, alterar assinatura de plano ou publicar condições comerciais não aprovadas. Não registrar chaves, conteúdo pessoal, IDs de cobrança ou URLs privadas em evidências públicas. Uma chave SSH temporária criada para a operação deve ser revogada ao terminar.

## Evidência

[Validação da execução](validation.md). Código local, CI, deploy e provider são resultados separados.
