# Handoff de lançamento — arquivado

**Documento histórico de 2026-09-11, substituído em 2026-09-12. Não executar suas antigas instruções.** Contexto atual: [project-context.md](project-context.md), [.specs/STATE.md](../.specs/STATE.md), [provider-setup.md](provider-setup.md) e [production-checklist.md](production-checklist.md).

A versão anterior misturava um snapshot de Git/Railway com instruções de publicar, semear catálogo, trocar secrets e executar providers. Ela continha contradições que a tornavam inadequada como runbook:

- Nome de projeto `musica-da-resenha` apesar do projeto conhecido ser `musica`.
- Catálogo com três produtos e enum antigo Mercado Pago; o código-alvo tem somente `custom_song` e pagamento por adapter.
- IDs, refs, disponibilidade de credenciais e estado de deploy datados, apresentados como situação corrente.
- Recomendação de habilitar checkout por homologação e serviço online; isso não comprova PIX de produção nem prontidão comercial.
- `automatic` como modo de revisão; o código novo distingue `manual` de `automatic_release` sem audição.
- Comandos de seed/publicação e autorizações antigas de crédito/secrets que não autorizam operações em outra sessão.

O conteúdo integral anterior pode ser consultado no histórico Git para investigação. Não transporta autorização, configuração vigente ou prova de lançamento. Na próxima sessão, identificar a revisão local/remota, o journal real e os gates restantes antes de qualquer ação externa.
