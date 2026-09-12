# Evolução — prioridades após a auditoria independente

Referência: 2026-09-12. Este documento substitui o diagnóstico otimista de 03–11/09. O histórico completo permanece no Git; números de custo de um pedido e afirmações antigas de “entregue” não são gates atuais. Fonte de implementação: [audit-remediation](../.specs/features/audit-remediation/spec.md). Fonte de publicação/validação: [.specs/STATE.md](../.specs/STATE.md).

## O que manter

Produto único `custom_song`, monólito modular, PostgreSQL como dado/fila, contratos Zod, domínio compartilhado, letra versionada, snapshot de preço, capa paralela, capacidades de acesso e storage privado. Três adapters pontuais de IA são compatíveis com a jornada atual. Não há necessidade demonstrada de framework de agentes, Redis, microserviços ou cadastro.

Admin único via `ADMIN_EMAIL`/`ADMIN_PASSWORD` do ambiente continua decisão do dono. A remoção de `admin_users.password_hash` elimina uma coluna que não autenticava; não cria outro mecanismo de autenticação.

## Correções estruturais da entrega local

| Problema auditado                                          | Forma adotada                                                                                             | Evidência a exigir                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Cobrança sem referência completa e criação incerta         | Tentativa persistida antes da rede, identidade/centavos/BRL, `unknown`, reconciliação e refund monotônico | Testes de concorrência, timeout, divergência e refund, mais homologação externa |
| Áudio substituído sem origem demonstrável                  | Produção fixa letra; histórico de gerações/objetos e seleção por variante                                 | Falha parcial, nova letra, replay e download da produção liberada               |
| Retry depois de lease perdido ou resultado externo incerto | Token/heartbeat/fencing e `ai_calls` antes do I/O                                                         | Takeover de lease sem overwrite nem chamada cobrada automática                  |
| Contato e aceite confundidos com briefing                  | `CreativeBrief`, contato separado e consentimentos com finalidade/versão/instante                         | Entrada e leitura histórica sem inventar aceite                                 |
| Letra editada divergente das seções                        | `fullLyrics` canônico e validação de edição/aprovação                                                     | O áudio recebe o texto aceito; seções divergentes não permanecem                |
| Custo conhecido confundido com custo total                 | `reported`/`estimated`/`unknown`, receita financeira e atenção operacional                                | Falhas cobradas/desconhecidas visíveis no cockpit                               |
| Docs e schema ensinando modelos diferentes                 | Migrations imutáveis, snapshots reconciliados, docs históricas arquivadas                                 | Upgrade e clean equivalentes, verificação independente e refs explícitas        |

O [gate local consolidado](../.specs/features/audit-remediation/validation.md) passou, incluindo revisão independente. A implementação continua no WIP e não está publicada. `0012`–`0014` foram preparados para upgrade sem inventar fatos: produção antiga sem origem recebe `legacy_unverified`; aceite ausente permanece ausente; job de letra sem alvo demonstrável não chama IA automaticamente.

## Ordem para adquirir confiança

1. Integração e verificação independente local concluídas: 430 testes de código/banco, um operacional, 48 E2E, três imagens Docker e sensor financeiro. Use o relatório da revisão, preservando a distinção entre provas sintéticas e externas.
2. Revisar publicação e promoção como ação separada: Git/CI/imagens/migrations/env, sem assumir que Railway acompanha WIP.
3. Definir preço e condições, homologar o gateway escolhido e comprovar PIX de produção, reconciliação e refund. AbacatePay é adapter atual, não uma escolha comercial irreversível.
4. Provar e-mail do worker no Railway, download privado, revisão humana e restauração conjunta de banco/objetos. O restore pontual de banco e três objetos reais foi ensaiado em 12/09/2026; retenção e backup recorrente independente continuam como risco de lançamento.
5. Medir fila e capacidade. Aumentar concorrência somente com demanda, limites de provider e tempo de revisão observados. Separar variantes em jobs ou priorizar filas apenas se a medição justificar.

## Dívida que continua sendo dívida

- O status de jornada ainda resume etapas financeiras e de produção; dinheiro e linhagem já têm fontes próprias. Evitar novas regras financeiras baseadas nesse resumo.
- Código SQL transacional exige testes de invariantes reais. Trocar tudo por abstração de repositório não reduz automaticamente esse risco.
- `context.ts` agrega helpers de rotas; extrair novas partes quando houver responsabilidade comprovável, preservando fluxo transacional.
- Texto livre pode conter PII. Separação do e-mail não substitui minimização, controle de acesso, retenção e atendimento de exclusão.
- Legado `legacy_unverified` exige decisão operacional explícita. Não fazer backfill de letra/consentimento só para eliminar alertas.
- Não há exatamente uma execução externa garantida por uma fila local. Unknown de IA/pagamento e resposta perdida de e-mail precisam de operação consciente.

Os antigos planos para colocar letra na fila, adicionar índices básicos e conectar web aos contratos deixaram de ser backlog: confira seus consumidores atuais antes de propor outra implementação. Specs de Mercado Pago/três produtos e o handoff antigo são memória técnica, não arquitetura desejada.
