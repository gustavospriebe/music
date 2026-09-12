# Checklist de produção

Referência: 2026-09-12. Nenhum item é marcado por existir código, spec ou comando. Registrar data, revisão, ambiente e resultado verificável; não anexar PII/secrets. A ativação externa aplicou e conferiu `0000`–`0016` no Railway, com pagamento sandbox, IA, e-mail e restore reais. PIX de produção continua pendente.

## Código e schema da revisão a promover

- [x] Identificar branch, HEAD, WIP e `origin/main`; integrar/revisar mudanças sem perder trabalho existente.
- [x] Executar gates locais da revisão final em Node 22/PostgreSQL 18: format, lint, typecheck, testes de banco, build e E2E. Ler skips e confirmar URLs dos bancos isolados.
- [x] Conferir CI remoto e imagens da revisão exata; um CI antigo não valida o WIP.
- [x] Provar migrations em banco vazio e upgrade até `0011`, incluindo `0012`–`0016`, sem modificar migrations já aplicadas. Comparar journal, constraints e schema real, não só snapshot TypeScript.
- [ ] Revisar dados legados: produções `legacy_unverified`, jobs sem versão alvo e tentativas de pagamento incompatíveis com unicidade devem ter decisão explícita antes de retomar execução.
- [x] Executar pre-deploy de migration uma única vez pela API e confirmar journal/schema live. Seed inicial de `custom_song` é operação separada; não reprecificar pedidos existentes.
- [x] Planejar retorno operacional: schema novo com código velho não é rollback automaticamente seguro. Registrar backup e compatibilidade antes de promover.

Provas: [remediação local](../.specs/features/audit-remediation/validation.md) e [ativação externa](../.specs/features/external-activation/validation.md). Cada item composto só é marcado quando todas as partes estão demonstradas; não presumir que uma prova técnica inclui aceite comercial.

## Aceite comercial e pagamento

- [ ] Dono definiu preço positivo no catálogo; snapshot do pedido e valor do produto/cobrança remota coincidem.
- [ ] Prazo, suporte, ajustes, reembolso, licença, termos e privacidade foram aprovados e publicados; links e `POLICY_VERSION` não provisória conferidos no navegador.
- [ ] Submissão registra finalidade, versão e instante dos aceites, inclusive marketing negativo e direitos de imagem quando usados.
- [ ] Escolha do gateway explícita; adapter completo, sem tratar configuração de outro fornecedor como suporte implementado.
- [x] Homologação sandbox confirmou checkout/simulação, webhook autenticado, consulta inequívoca, reenvios sem produção extra e reconciliação.
- [x] Testes PostgreSQL cobrem duplicação do mesmo ID, ordem invertida, expiração, criação incerta e provider histórico; não são eventos reais no gateway.
- [ ] PIX de produção autorizado e concluído: valor real, ambiente real, confirmação, produção única e visibilidade financeira. Homologação/devMode não marca este item.
- [ ] Procedimento de reembolso confirmado no gateway e no sistema: histórico, revogação da entrega e bloqueio de novos efeitos. Não confundir consulta de refund com capacidade de solicitá-lo via app.
- [ ] `COMMERCIAL_READY` ligado somente depois dos aceites; textos/demonstrações não alegam depoimentos, números ou resultados reais inexistentes.

## Runtime, segurança e entrega

- [x] Projeto Railway `musica`, serviços e revisão implantada conferidos. Não assumir que catálogo HTTP ou health 200 comprovam migrations recentes.
- [ ] HTTPS, domínio, `WEB_URL`, CORS, proxy confiável e cookies Secure/HttpOnly conferidos; capability de visualização não permite mutar ou ler contato/briefing.
- [ ] Admin único autenticado pelo env; credenciais e rotação operadas no gestor de secrets. Erros/logs não contêm SQL, parâmetros, tokens, PII ou corpo bruto do upstream.
- [ ] API/worker com mesmas referências de banco/storage e configuração financeira para reconciliação. Imagens finais construídas e executando sem root.
- [x] Worker com credenciais/modelos das capacidades usadas, remetente `EMAIL_FROM` correto e `AUDIO_REVIEW_MODE=manual`. Qualquer `automatic_release` tem aceite explícito, sem promessa de revisão artística automática.
- [ ] Rodada de IA autorizada e limitada prova duas faixas decodificáveis, letra correspondente e escuta humana; entrega parcial/produção errada/arquivo inacessível não é liberada.
- [x] Resend confirmou `delivered` para mensagem enviada do container worker ao destinatário de teste autorizado, com link privado. A tentativa anterior devolvida permanece no histórico.
- [ ] Operação acompanha bounce/reclamações no Resend e possui procedimento de correção de destinatário. O admin informa aceite pelo provedor; ainda não ingere bounce automaticamente.
- [ ] Download privado e Range funcionam com autorização; acesso revogado/reembolsado é negado. URLs de bucket não são públicas.
- [ ] Reinício/lease vencido durante chamada não deixa worker antigo concluir nem repete automaticamente chamadas `unknown`. Procedimento de investigação e recuperação explícita ensaiado.

## Continuidade e capacidade

- [x] Backup PostgreSQL e restore isolado executados em banco descartável identificado.
- [ ] Retenção e backup PostgreSQL recorrente definidos/configurados; backup nativo Railway requer Pro e não foi contratado.
- [x] Export pontual dos três objetos reais para destino local privado e restore banco + objetos comprovaram hashes/downloads/revogação.
- [ ] Backup recorrente de objetos em destino independente com retenção configurada; o export pontual não marca esta condição.
- [ ] Região e custo de tráfego app/bucket conhecidos; bucket privado não equivale a backup, versionamento ou rede privada.
- [ ] Monitorar idade/tamanho da fila, leases expirados, falhas, chamadas desconhecidas, custo estimado/desconhecido, reconciliação pendente e tempo de revisão humana.
- [ ] Definir suporte, resposta a incidentes e retenção/exclusão de contato, briefing, letras, imagens de referência, arquivos e e-mails. Limpeza pontual de referência não é política LGPD completa.
- [ ] Medir capacidade com fluxo representativo antes de anunciar prazo ou aumentar concorrência. Dois áudios sequenciais não oferecem, por si, capacidade comercial comprovada.

Infraestrutura online, teste local, homologação e operação comercial são estados diferentes. Até os aceites aplicáveis estarem demonstrados, manter a cobrança comercial indisponível. Procedimentos e evidências externas: [external-activation-runbook.md](external-activation-runbook.md).
