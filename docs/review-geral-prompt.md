# Prompt — revisão geral da aplicação (nova sessão)

Copie e cole na nova sessão:

---

Quero uma revisão geral da aplicação Música da Resenha, de ponta a ponta, sem implementar nada nesta rodada.

Repositório: `/Users/gustavopriebe/dev/music`

Antes de opinar sobre qualquer arquivo, leia integralmente e nesta ordem:

1. `AGENTS.md`
2. `docs/project-context.md` (contexto canônico e fronteiras)
3. `.specs/STATE.md` (decisões AD-001…AD-006 e handoff atual)
4. `docs/ui-ux-audit.md` (baseline) + `docs/ui-remodel-report.md` (o que foi entregue depois)
5. `.specs/features/ui-remodel/spec.md`, `design.md`, `tasks.md`, `validation.md` (último veredito: FAIL 25/31, 6 residuais parciais G-01…G-05 + sensor 3/3)
6. `README.md`, `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`
7. `docs/evolucao-mvp.md`, `docs/next-chat-prompt.md`, `docs/railway-setup.md`, `docs/provider-setup.md`, `docs/production-checklist.md`, `docs/external-activation-runbook.md` (se existirem)

Regras da revisão (sem exceção):

- Não altere nenhum arquivo, não rode migrations/seed, não faça commit/push/PR/deploy.
- Não leia nem exponha secrets (`.env`, Railway, chaves). Fale só de nomes de variáveis.
- Não chame OpenRouter, Mercado Pago, Resend ou S3 reais. Testes locais existentes usam banco `resenha`/`resenha_test` em `localhost:5433` — só releia resultados, não re-execute nada pago.
- Não clique em geração paga, pagamento, rebuild, entrega ou envio real.
- Preserve o WIP preexistente em `apps/worker/src/worker.ts`; não o atribua a nenhuma feature.
- Separe explicitamente em seções distintas: (a) código e arquitetura, (b) testes locais, (c) CI remoto, (d) providers reais, (e) Railway/infra, (f) produção. Nunca derive um gate do outro.

Escopo da revisão:

1. **Arquitetura e invariantes** — monólito modular, `assertTransition`, capabilities/cookies, fila PostgreSQL `SKIP LOCKED`, storage privado, UTC/centavos, imutabilidade de letra/eventos. Aponte violações reais com `arquivo:linha`.
2. **Cobertura e qualidade dos testes** — suítes unit/integration/E2E, o que está bem coberto, onde há teste raso ou ausente (inclua os 6 residuais G-01…G-05 do `validation.md`), risco de cada lacuna.
3. **Segurança e privacidade** — PII, IDs internos, tokens, payloads pessoais, logs, XSS/CSRF/cors/cookies/rate-limit. Liste exposição real vs. risco teórico.
4. **Dívida técnica e fragilidades** — acoplamento, funções complexas (ex.: react-doctor 84/100, 4 warnings), código morto, inconsistências entre docs e código.
5. **Docs e estado** — contradições entre `project-context.md`, `STATE.md`, `README.md`, `evolucao-mvp.md` e o código atual.
6. **Riscos de produção** — o que hoje impede o lançamento (jurídico/comercial, providers, Railway Postgres/Bucket, backup/restore, observabilidade) e o que é só ruído.

Entrega esperada:

- Veredito por área (OK / atenção / bloqueador) com evidência `arquivo:linha`.
- Achados ordenados por severidade (bloqueador > maior > menor), cada um com impacto e sugestão concreta de próximo passo — sem implementar.
- Lista explícita do que foi verificado vs. o que não foi (e por quê).
- Máximo 6 próximos passos recomendados, em ordem.

Se alguma informação necessária estiver ausente ou ambígua, diga "não verificado" em vez de inferir.
