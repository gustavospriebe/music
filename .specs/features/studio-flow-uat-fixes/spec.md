# Correções da UAT do estúdio

> Registro histórico de um recorte anterior. O modelo vigente e a evidência atual estão em [docs/documentation-map.md](../../../docs/documentation-map.md) e [audit-remediation](../audit-remediation/spec.md). Este registro não autoriza publicação nem gasto com providers.

## Contexto

O teste humano de 2026-09-07 encontrou redundância nos controles, sobrescrita de ocasião e quebra de continuidade depois de salvar. Os gates técnicos anteriores não representavam aceite desta experiência.

## Requisitos e critérios de aceite

- **UAT-01**: WHEN o cliente selecionar uma intenção, inclusive por URL ou rascunho, THEN o sistema SHALL mantê-la separada da ocasião; ocasião é opcional em custom_song, e ambas chegam corretamente ao contexto criativo. Produtos legados mantêm suas regras.
- **UAT-02**: WHEN o cliente escolher estilo ou clima, THEN o sistema SHALL oferecer uma seleção acessível por grupo, com entrada personalizada apenas na opção Outro e preservação ao voltar/restaurar rascunho.
- **UAT-03**: WHEN o cliente salvar a história e avançar para letra, pagamento e acompanhamento, THEN o sistema SHALL manter a linguagem visual e uma jornada por nomes, sem reiniciar um contador que conflite com as quatro partes da preparação.
- **UAT-04**: WHEN a geração de letra estiver indisponível, THEN o sistema SHALL informar antes de preencher e preservar o trabalho após salvar; o preview SHALL permitir ativação explícita das credenciais existentes sem expô-las, com chamadas pagas condicionadas à autorização e teto de custo.
- **UAT-05**: WHEN o provider de áudio rejeitar uma chamada com erro HTTP permanente (incluindo 402), THEN o sistema SHALL encerrar o job sem retentativas automáticas inúteis, preservando a retomada administrativa depois de corrigida a causa. Erros transitórios mantêm sua política de retry.

## Execução e ownership

1. Backend: contratos, regressões HTTP/prompt e launcher com opt-in; sem migrations nem mudança de .env.
2. Frontend: formulário, controles, continuidade, testes de regressão, React Doctor.
3. Principal: reprodução no browser, integração, documentação; verificador independente: confrontar os quatro critérios com código e testes.

## Validação

Reproduções antes da correção; testes unitários/integração e E2E pertinentes, lint/typecheck/build; browser real em origem separada para preservar o rascunho do usuário. API e banco locais não equivalem a provider real. O usuário autorizou geração real nesta rodada com teto de US$ 3. O launcher mantém credenciais neutralizadas por padrão e permite opt-in seletivo. O ensaio do principal usa um pedido, um job com max_attempts=1 e conferência de consumo no banco/provider; o launcher não impõe teto monetário global.

## Limites

WIP preservado. Sem commit, push, deploy, envio real de email ou cobrança. Railway reconfirmado sem deployments em web/api/worker; CI remoto continua no HEAD publicado anterior com falha.

O ensaio real gerou uma letra e duas versões de áudio, mas uma tentativa posterior encontrou HTTP 402: limite disponível da chave OpenRouter de US$ 0,495132911, menor que a reserva mínima de US$ 0,50 exigida pelo provider para áudio. UAT-05 foi acrescentado a partir desse defeito observado. O limite financeiro da chave não foi alterado.
