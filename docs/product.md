# Produto e regras

Tipos: `friend_roast` (Música da Resenha), `team_anthem` (Hino da Pelada) e `emotional_tribute` (Sua História em Música). Preço inicial: R$49,90, vindo do banco.

Jornada: landing → formulário adaptativo com autosave → geração/revisão de letra → até três regenerações → aprovação → checkout → pagamento confirmado → duas gerações de áudio → revisão automática/manual → entrega privada e e-mail. O cliente não precisa criar conta.

Estados: `draft`, `story_completed`, `lyrics_generating`, `lyrics_ready`, `lyrics_approved`, `payment_pending`, `paid`, `audio_queued`, `audio_generating`, `review_required`, `delivered`, `revision_requested`, `failed`, `refunded`, `cancelled`. Toda transição é centralmente validada.

Conteúdo é bloqueado ou encaminhado para revisão em casos de ameaça, humilhação grave, ódio, acusação, intimidade, sexualização sem consentimento, menores, imitação de voz/artista ou cópia de obra. Zoação leve é permitida, assédio não.
