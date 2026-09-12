> HISTÓRICO — leitura anterior à remediação de 12/09/2026. Alegações de schema, providers, status e prontidão abaixo podem estar superadas. Este documento não autoriza implementação, gastos ou publicação. Use o [modelo vigente](project-context.md) e sua validação.

# Revisão e remodelagem da aplicação

**Entrega local validada em 2026-09-07. Lançamento comercial ainda depende de decisões e gates externos.** A aplicação está disponível no preview isolado [http://localhost:5180](http://localhost:5180), com API 3010 e worker ativos. Implementação dividida entre três subagentes, integração pelo principal e verificador independente.

## O que mudou para o cliente

A criação passou a admitir amizade, amor, presente, homenagem e ideia livre. O novo produto `custom_song` preserva os produtos e pedidos anteriores. O tema e o briefing inspiram a composição, sem exigir que a IA copie o parágrafo literalmente. Gênero e clima aceitam texto livre; não há relação ou fatos inventados para preencher o contrato.

O estúdio prepara a história em quatro partes: ideia, história, som e revisão/contato. A jornada posterior continua letra, pagamento, produção e entrega. Há validação por etapa, volta sem perder conteúdo, resumo editável, rascunho local e exclusão efetiva do rascunho. A biblioteca mostra assunto, data, progresso e próxima ação.

A landing ganhou composição editorial, cinco entradas por intenção e uma imagem ilustrativa identificada. O asset foi reduzido de 2,2 MB para 114 KB. Preparação da letra, produção e entrega mantêm o resumo reconhecível da música. Ausência de configuração de IA deixa a criação da letra indisponível antes de consumir tentativa.

## Preparação de providers e operação

- Pagamento selecionável por adapter: Mercado Pago existente ou disabled enquanto o fornecedor é decidido. A UI usa identidade e disponibilidade devolvidas pela API.
- Preço inicial de custom_song pode ficar indefinido; zero não é oferecido como gratuito. Seed preserva preços existentes e snapshot de pedidos.
- Checkout real exige preço positivo, gateway configurado e condições comerciais publicadas. Prazo, suporte, ajustes, reembolso, licença, termos e privacidade são parametrizados.
- E-mail seleciona Resend ou registro local fora de produção. Intenção é persistida antes de envio; retry mantém destinatário, mensagem, provider e link.
- Checkout concorrente e webhook repetido não duplicam crédito/produção. Webhook falho pode ser retomado.
- Cookies são vinculados a tipo, pedido e versão atual. Revogação invalida cookies e links antigos; downloads exigem autorização, entrega e arquivo concluídos.
- Pedido de ajuste tem ação do proprietário e aparece no admin. Visualização por link não concede controles de mutação.
- Hashes foram retirados do DTO administrativo e contato/consentimentos não são enviados ao prompt de IA.
- Nginx não registra URLs privadas. Logs de runtime anteriormente versionados foram removidos do worktree, com backup local e ignore; não houve reescrita do histórico remoto.

O guia de preenchimento e extensão dos adapters está em [provider-setup.md](provider-setup.md). Um gateway ou serviço de email diferente exige implementação e homologação do adapter correspondente; não há promessa de compatibilidade só pela troca da chave.

## Validação atual

| Gate                      | Resultado                                                                                                      | Evidência                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Node/pnpm                 | 22.22.2 /12.3.4                                                                                                | Execução real desta sessão                     |
| `pnpm check`              | PASS                                                                                                           | `output/launch-remodel/integrated-check.txt`   |
| Testes                    | 185 PASS: API 61, web 68, worker 28, contracts 9, domain 10, providers 9                                       | Mesmo log                                      |
| E2E                       | 43/43 PASS, com respostas controladas                                                                          | `output/launch-remodel/web-e2e.txt`            |
| React Doctor completo     | 100/100, sem supressões                                                                                        | `output/launch-remodel/react-doctor.txt`       |
| Verificador independente  | Gate completo 185 PASS, 7/7 mutações detectadas                                                                | `.specs/features/launch-remodel/validation.md` |
| Migration fresh e upgrade | 0000…0006→0008 PASS, 9 migrations                                                                              | `output/launch-remodel/backend-upgrade.txt`    |
| Seed repetido             | Preço legado 8750, custom 12500 e snapshot 7650 preservados                                                    | Mesmo log                                      |
| Restore PostgreSQL local  | PASS, 1 pedido sintético e 9 migrations                                                                        | `output/launch-remodel/restore-validation.txt` |
| Nginx                     | Sintaxe e HTTP 200; capability sintética ausente dos logs                                                      | `output/launch-remodel/nginx-validation.txt`   |
| Browser Codex             | Landing, menu mobile, quatro passos, salvamento na API local, erro sem chave e exclusão do rascunho observados | `output/launch-remodel/*after*.png`            |

O primeiro check integrado expôs uma corrida entre suítes API/worker no banco compartilhado. O comando root agora serializa pacotes; o pacote API também serializa seus arquivos de integração. O check normal foi reexecutado e passou. No restore, ferramentas locais PostgreSQL 18 não serviram ao servidor 16; o ensaio passou com client 16 do próprio container.

O sensor independente desativou, em cópia temporária, gates comerciais, validação de valor/moeda/assinatura, revogação, estado de download e estabilidade de token. Os sete defeitos foram detectados por assertions comportamentais. A árvore real permaneceu idêntica durante o ensaio.

## Percurso visual observado

1. Entrada: nova hierarquia e intenções; versão mobile 390 px sem overflow.
2. Preparação: quatro passos, escolhas livres e resumo; dados preservados entre etapas.
3. Letra: história sintética persistida na API e indisponibilidade sem chave. Nenhuma geração real foi realizada.
4. Menu mobile: defeito de compressão encontrado no browser e corrigido; teste protege largura do painel e altura do cabeçalho.
5. Rascunho: exclusão verificada na tela, mantendo pedidos salvos.

![Página inicial desktop](../output/launch-remodel/06-after-landing-desktop.png)

![Estúdio mobile](../output/launch-remodel/05-after-studio-mobile.png)

Capturas são evidência local e ficam em output ignorado. Não constituem certificação WCAG, teste em aparelho físico ou aceitação humana. O percurso posterior com geração/checkout/entrega foi exercitado por testes controlados; não se confunde com homologação externa.

## Destino dos achados da revisão anterior

| Achados                                                     | Situação nesta entrega                                                                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| M1/M2/M3: pagamento, e-mail e downloads/admin sem cobertura | Corrigidos e cobertos por integração real PostgreSQL com transportes controlados.                                             |
| M4/M5: ajuste e revogação sem fluxo                         | Conectados ao cliente/admin e verificados.                                                                                    |
| M6 e G-01…G-05                                              | Requisitos residuais cobertos na entrega atual; o FAIL histórico da revisão anterior não foi falsificado ou apagado.          |
| M7/M8: logs e dados expostos                                | Nginx corrigido, logs removidos localmente com backup e exemplos sanitizados. Histórico público remoto permanece como estava. |
| B1: WIP e CI remoto                                         | WIP preservado e gates locais passam. Commit/push não realizados; CI remoto segue no último HEAD publicado com failure.       |
| B2: jurídico/comercial                                      | Configuração e gate prontos; conteúdo e preço dependem do dono.                                                               |
| m1/m2/m3/m7/m10/m11/m13                                     | Docs atuais, Node22, revisão manual, DTO reduzido, ramo morto removido, build web exige URL, criação livre implementada.      |

Tabelas históricas sem consumidor, runtime TypeScript com devDependencies e políticas externas de observabilidade são tradeoffs anteriores preservados; não foram usados para declarar produção pronta. Não houve remoção destrutiva de schema nem mudança remota de visibilidade.

## Antes de lançar

1. Escolher preço, gateway e provider de e-mail; preencher e publicar as condições comerciais.
2. Configurar chaves no ambiente privado e homologar geração, pagamento, e-mail e storage com orçamento autorizado.
3. Publicar o código e observar CI remoto verde; provisionar/configurar Railway, PostgreSQL e bucket, executar deploy e validar backup/restore de produção.
4. Realizar aceite humano da jornada e uma compra/entrega controlada no ambiente publicado.

Railway foi consultado ao vivo: web/api/worker continuam sem deployment, sem Postgres/Bucket nesse projeto. Nenhuma chave real foi usada nesta validação e não houve commit, push ou deploy.

Referências de fluxo consultadas: [Songfinch](https://www.songfinch.com/) para ocasião/história e [Suno Custom mode](https://help.suno.com/en/articles/2415873) para separar ideia e detalhamento. A interface foi construída no projeto existente.
