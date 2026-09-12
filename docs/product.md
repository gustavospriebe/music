# Produto e regras

Produto único: `custom_song`, uma criação musical a partir de história, homenagem, presente ou ideia livre. Tema e briefing são inspiração; fatos só são obrigatórios quando o cliente os lista. Produto não exige conta e não oferece cópia de obra, voz ou artista.

Jornada: landing → preparação da história → letra (gerar, editar, refinar, histórico) → aprovação → checkout PIX → produção de duas versões → revisão humana → entrega privada por link/e-mail. Capa é opcional, paralela e não bloqueia a música. `/minhas-musicas` depende deste navegador; o link de entrega concede apenas visualização.

## Preço, consentimento e aprovação

Preço vigente está no catálogo, em centavos inteiros; cada pedido conserva seu snapshot. `SONG_PRICE_CENTS=0` significa preço indefinido para cobrança real. Seed inicial pode preencher um preço que permanece zero, mas não reprecifica pedidos ou catálogo já precificado.

Checkout real exige preço positivo, gateway configurado e condições comerciais publicadas: suporte, prazo, ajuste, reembolso, licença, termos e privacidade com `POLICY_VERSION` não provisória. Configuração preenchida não prova aprovação jurídica nem publicação efetiva; isso é aceite de lançamento.

A submissão guarda a versão/instante de termos, privacidade, declaração de direitos/conteúdo e escolha de marketing. Referência de imagem tem aceite próprio. Ausência de registro histórico não significa aceitação. Desenvolvimento usa `draft-v1` explicitamente; não é política comercial final.

`fullLyrics` é o texto aprovado para produção. Edição livre pode dispensar seções estruturadas; o sistema não conserva seções antigas divergentes. A geração por IA tem contrato mais restrito. Edição e aprovação continuam sujeitas às regras de conteúdo, inclusive quando feitas por operador.

## Produção, revisão e recuperação

Cada produção aponta para uma versão imutável da letra. As duas variantes entregues precisam pertencer à mesma produção. Regeneração preserva áudios/arquivos anteriores e registra nova tentativa; mudar a letra exige outra produção. Depois de uma liberação, qualquer revisão abre nova produção e mantém a entrega anterior acessível até liberar a nova. Na revisão de uma única faixa com a mesma letra, a parceira validada pode ser reaproveitada por referência, com origem auditada e sem nova chamada de IA. Se a letra mudou ou a parceira não está válida, a operação individual é recusada e a produção das duas deve ser solicitada explicitamente.

`AUDIO_REVIEW_MODE=manual` é o padrão. O gate técnico verifica áudio decodificável e duração mínima; o operador precisa ouvir as faixas, conferir canto/letra e decidir qualidade. `automatic_release` é opção explícita de liberação sem audição e não deve ser anunciada como revisão artística automática.

Falha de áudio não apaga pagamento. Resultado externo desconhecido não dispara repetição cobrada automaticamente; recuperação administrativa registra a decisão e possível custo. Reembolso integral confirmado fica no histórico financeiro, impede nova produção e revoga a entrega.

Estado do pedido descreve a jornada (`draft` até `delivered`, com caminhos de revisão, falha, cancelamento e reembolso). Pagamento, produção, capa, job e e-mail mantêm estados próprios. A interface pode resumi-los, mas não deve inferir receita ou quitação pelo estado da música.

## Limites honestos

Regras locais recusam conteúdo proibido conhecido; filtros do provider são outra camada e podem variar entre tentativas. Não há garantia automática de detectar todo conteúdo inadequado. Texto criativo pode conter dados pessoais mesmo com contato separado: orientar minimização, limitar acesso e definir retenção faz parte da operação.

Prazo, preço, política de ajuste/reembolso e licença são decisões do dono. Homologação sintética e chamadas antigas específicas não comprovam operação comercial. Os aceites estão no [checklist de produção](production-checklist.md).
