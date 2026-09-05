# Checklist de produção

## Antes de publicar

- [ ] Rotacionar qualquer segredo que tenha sido exposto e inserir segredos somente no gestor de ambiente.
- [ ] Usar PostgreSQL gerenciado ou isolado, backups testados e retenção definida.
- [ ] Aplicar migrations em ambiente controlado e testar restauração.
- [ ] Configurar domínio, HTTPS, CORS restrito, `WEB_URL`, cookies `Secure` e proxy confiável.
- [ ] Configurar bucket S3 privado, bloqueio público, versionamento e provar download apenas pela capability da API.
- [ ] Homologar Mercado Pago sandbox: assinatura, consulta, duplicação e estados não aprovados.
- [ ] Validar OpenRouter/Resend apenas com autorização, limites de custo e alertas configurados.
- [ ] Criar admin com `pnpm admin:create <email> <senha-de-12-ou-mais-caracteres>`, sem senha padrão; registrar o acesso em local seguro.
- [ ] Revisar termos, privacidade, consentimento de marketing, prazo comercial e política de ajustes com jurídico/comercial.
- [ ] Confirmar que textos/demo não alegam depoimentos, números ou áudio reais.

## Operação

- [ ] Executar `pnpm check` e `pnpm test:e2e` em CI com banco real antes da promoção.
- [ ] Construir `docker/api/Dockerfile`, `docker/worker/Dockerfile` e `docker/web/Dockerfile`; imagens não rodam como root.
- [ ] Monitorar saúde da API, backlog/dead-letter, jobs travados, falhas de provider e receita sem registrar PII em logs.
- [ ] Definir rotação de logs, resposta a incidente, suporte e procedimento de anonimização/exclusão de sessão.
- [ ] Fazer teste de entrega, download, cancelamento e recuperação de worker após deploy.
- [ ] Executar `RESTORE_DRILL_CONFIRM=ERASE_RESTORE_DRILL_DATABASE ./scripts/restore-drill.sh` contra banco isolado e anexar evidência sem PII.
- [ ] Confirmar limpeza de referências de capa encerradas e órfãs com mais de sete dias.

Alternativas documentadas: (A) web em Vercel/Netlify, API+worker em Railway e PostgreSQL/S3 gerenciados; (B) VPS com Docker Compose, reverse proxy HTTPS, PostgreSQL isolado, volumes e backups. Este repositório não executa deploy.

Use [external-activation-runbook.md](external-activation-runbook.md) para comandos, evidências, rollback e aceite. Até preencher todos os aceites, o estado é **EXTERNAL BLOCKED**.
