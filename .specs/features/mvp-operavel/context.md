# MVP Operável Context

**Gathered:** 2026-09-04  
**Spec:** `.specs/features/mvp-operavel/spec.md`  
**Status:** Ready for design

## Feature Boundary

Entregar o caminho público já existente da história até duas músicas, com idempotência, proteção de dados, estados acessíveis, retomada, operação local e provas reais. O trabalho melhora a identidade atual e corrige P0/P1; não cria outra proposta de produto nem integra serviços remotos nesta execução.

## Implementation Decisions

### Jornada e estados

- A jornada principal continua: landing → história → geração/revisão → checkout → acompanhamento → players.
- Cada rota inicia no topo e recebe foco no conteúdo principal.
- A geração de letra vira estado persistente acompanhado por polling; reload nunca inicia outra chamada.
- Retry de letra é do cliente antes do pagamento. Retry de áudio pago continua no admin.
- Estado desconhecido é erro de consistência, não fallback para “em produção”.

### Segurança e duplicação

- A API pública trabalha apenas com `publicId`, número de versão e variante.
- Cookies de pedido e visualização são assinados e rejeitam o marcador literal legado forjado.
- Pagamento dev é confirmado pelo `publicId` sob cookie; UUID de pagamento não sai da API.
- Criação recebe chave idempotente por tentativa e geração usa claim condicional com recuperação após cinco minutos.
- Eventos e conteúdo de versões de letra continuam históricos; correções não reescrevem conteúdo antigo.

### Direção visual e conteúdo

- Preservar pêssego quente, laranja e tinta escura; retirar compressão tipográfica e decoração sem função.
- Usar uma “faixa de produção” contínua como assinatura visual do fluxo, inspirada em trilha/mesa de estúdio, sem transformar a tela em dashboard.
- Priorizar título da etapa, ação atual e estado; detalhes de operação ficam secundários.
- Mensagens usam verbos concretos: “Criando sua letra”, “Confirmando pagamento”, “Tentar gerar novamente”, “Ouvir versões”.
- Falhas não prometem ação automática que o sistema não prova.

### Testes e validação

- Providers externos são substituídos apenas em testes; PostgreSQL real persiste os resultados.
- Fixtures públicas precisam incluir status válido e chaves exatas.
- Playwright cobre desktop e 390 × 844, incluindo scroll, teclado, loading, erro, vazio e sucesso.
- A comparação final usa os mesmos estados e viewports das capturas iniciais.

### Agent's Discretion

- Escala exata de espaçamento, tokens de borda/sombra e microcopy secundária.
- Organização interna de componentes pequenos, desde que as fronteiras existentes sejam mantidas.
- Divisão dos testes entre domínio, API, RTL e Playwright conforme o risco.

### Declined / Undiscussed Gray Areas → Assumptions

- Nenhuma área foi recusada. O pedido definiu autonomia, direção visual, providers, arquitetura, critérios e limites; os defaults restantes estão registrados na spec.

## Specific References

- Produto atual e capturas em `docs/audits/mvp-operavel/before/`.
- Auditoria e diagnóstico em `docs/audits/mvp-operavel/baseline.md`.
- Convenções em `AGENTS.md`, `README.md`, `docs/product.md` e `docs/evolucao-mvp.md`.

## Deferred Ideas

- Capa de álbum opcional após pagamento: um render quadrado e uma regeneração limitada, com Nano Banana 2 Lite sem foto ou Nano Banana 2 para referência. Pesquisa de custo, privacidade e fatia em `docs/album-cover-backlog.md`.
- Cadastro e sincronização entre dispositivos.
- Revisão jurídica/comercial e publicação.
- Otimização P2 do bundle caso os gates funcionais não indiquem impacto bloqueador.
