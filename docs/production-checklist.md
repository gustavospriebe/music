# Checklist de produção

Referência: 2026-09-12. Nenhum item é marcado por existir código, spec ou comando. Registrar data, revisão, ambiente e resultado verificável; não anexar PII/secrets. A entrega local `audit-remediation` não aplicou seu schema no Railway nem realizou PIX de produção.

## Código e schema da revisão a promover

- [ ] Identificar branch, HEAD, WIP e `origin/main`; integrar/revisar mudanças sem perder trabalho existente.
- [x] Executar gates locais da revisão final em Node 22/PostgreSQL 18: format, lint, typecheck, testes de banco, build e E2E. Ler skips e confirmar URLs dos bancos isolados.
- [ ] Conferir CI remoto e imagens da revisão exata; um CI antigo não valida o WIP.
- [x] Provar migrations em banco vazio e upgrade até `0011`, incluindo `0012`–`0014`, sem modificar migrations já aplicadas. Comparar journal, constraints e schema real, não só snapshot TypeScript.
- [ ] Revisar dados legados: produções `legacy_unverified`, jobs sem versão alvo e tentativas de pagamento incompatíveis com unicidade devem ter decisão explícita antes de retomar execução.
- [ ] Executar pre-deploy de migration uma única vez pela API e confirmar journal/schema live. Seed inicial de `custom_song` é operação separada; não reprecificar pedidos existentes.
- [ ] Planejar retorno operacional: schema novo com código velho não é rollback automaticamente seguro. Registrar backup e compatibilidade antes de promover.

Provas locais desses dois itens: [validação de 12/09/2026](../.specs/features/audit-remediation/validation.md). Os demais itens abaixo continuam sem prova externa.

## Aceite comercial e pagamento

- [ ] Dono definiu preço positivo no catálogo; snapshot do pedido e valor do produto/cobrança remota coincidem.
- [ ] Prazo, suporte, ajustes, reembolso, licença, termos e privacidade foram aprovados e publicados; links e `POLICY_VERSION` não provisória conferidos no navegador.
- [ ] Submissão registra finalidade, versão e instante dos aceites, inclusive marketing negativo e direitos de imagem quando usados.
- [ ] Escolha do gateway explícita; adapter completo, sem tratar configuração de outro fornecedor como suporte implementado.
- [ ] Homologação confirma webhook autenticado, consulta inequívoca, duplicação, ordem invertida, expiração, criação incerta e reconciliação pelo provider histórico.
- [ ] PIX de produção autorizado e concluído: valor real, ambiente real, confirmação, produção única e visibilidade financeira. Homologação/devMode não marca este item.
- [ ] Procedimento de reembolso confirmado no gateway e no sistema: histórico, revogação da entrega e bloqueio de novos efeitos. Não confundir consulta de refund com capacidade de solicitá-lo via app.
- [ ] `COMMERCIAL_READY` ligado somente depois dos aceites; textos/demonstrações não alegam depoimentos, números ou resultados reais inexistentes.

## Runtime, segurança e entrega

- [ ] Projeto Railway `musica`, serviços e revisão implantada conferidos. Não assumir que catálogo HTTP ou health 200 comprovam migrations recentes.
- [ ] HTTPS, domínio, `WEB_URL`, CORS, proxy confiável e cookies Secure/HttpOnly conferidos; capability de visualização não permite mutar ou ler contato/briefing.
- [ ] Admin único autenticado pelo env; credenciais e rotação operadas no gestor de secrets. Erros/logs não contêm SQL, parâmetros, tokens, PII ou corpo bruto do upstream.
- [ ] API/worker com mesmas referências de banco/storage e configuração financeira para reconciliação. Imagens finais construídas e executando sem root.
- [ ] Worker com credenciais/modelos das capacidades usadas, remetente `EMAIL_FROM` correto e `AUDIO_REVIEW_MODE=manual`. Qualquer `automatic_release` tem aceite explícito, sem promessa de revisão artística automática.
- [ ] Rodada de IA autorizada e limitada prova duas faixas decodificáveis, letra correspondente e escuta humana; entrega parcial/produção errada/arquivo inacessível não é liberada.
- [ ] E-mail realmente recebido a partir do worker no Railway, com remetente correto, link privado e retry estável. Falha de e-mail é recuperável e visível.
- [ ] Download privado e Range funcionam com autorização; acesso revogado/reembolsado é negado. URLs de bucket não são públicas.
- [ ] Reinício/lease vencido durante chamada não deixa worker antigo concluir nem repete automaticamente chamadas `unknown`. Procedimento de investigação e recuperação explícita ensaiado.

## Continuidade e capacidade

- [ ] Backup PostgreSQL, retenção e restore isolado comprovados; script de restore executado apenas em banco descartável identificado.
- [ ] Export/backup de objetos configurado fora do bucket de origem, manifest e checksums verificados; restore banco + objetos comprovou os downloads restaurados.
- [ ] Região e custo de tráfego app/bucket conhecidos; bucket privado não equivale a backup, versionamento ou rede privada.
- [ ] Monitorar idade/tamanho da fila, leases expirados, falhas, chamadas desconhecidas, custo estimado/desconhecido, reconciliação pendente e tempo de revisão humana.
- [ ] Definir suporte, resposta a incidentes e retenção/exclusão de contato, briefing, letras, imagens de referência, arquivos e e-mails. Limpeza pontual de referência não é política LGPD completa.
- [ ] Medir capacidade com fluxo representativo antes de anunciar prazo ou aumentar concorrência. Dois áudios sequenciais não oferecem, por si, capacidade comercial comprovada.

Infraestrutura online, teste local, homologação e operação comercial são estados diferentes. Até os aceites aplicáveis estarem demonstrados, manter a cobrança comercial indisponível. Procedimentos e evidências externas: [external-activation-runbook.md](external-activation-runbook.md).
