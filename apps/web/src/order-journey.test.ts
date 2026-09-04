import { describe, expect, it } from 'vitest';
import { completedAudioCount, deriveOrderJourney, latestLyrics } from './order-journey';

describe('jornada fechada do pedido', () => {
  it.each([
    ['draft', 1, 'story'],
    ['story_completed', 2, 'lyrics'],
    ['lyrics_generating', 2, 'lyrics'],
    ['lyrics_ready', 2, 'lyrics'],
    ['lyrics_approved', 3, 'payment'],
    ['payment_pending', 3, 'payment'],
    ['paid', 4, 'production'],
    ['audio_queued', 4, 'production'],
    ['audio_generating', 4, 'production'],
    ['review_required', 4, 'production'],
    ['revision_requested', 4, 'production'],
    ['refunded', 3, 'closed'],
    ['cancelled', 3, 'closed'],
  ] as const)('mapeia %s para a etapa %i e o estado %s', (status, step, kind) => {
    expect(
      deriveOrderJourney(status, { hasApprovedLyrics: false, completedAudio: 0 }),
    ).toMatchObject({ valid: true, status, step, kind, complete: false });
  });

  it('separa falha de letra recuperável de falha de áudio pago', () => {
    expect(
      deriveOrderJourney('failed', { hasApprovedLyrics: false, completedAudio: 0 }),
    ).toMatchObject({ valid: true, kind: 'lyrics_failed', step: 2, action: 'retry_lyrics' });
    const paidFailure = deriveOrderJourney('failed', {
      hasApprovedLyrics: true,
      completedAudio: 0,
    });
    expect(paidFailure).toMatchObject({ valid: true, kind: 'production_failed', step: 4 });
    expect(paidFailure.message).not.toMatch(/automatic|sem custo|vamos regerar/i);
  });

  it('só conclui entrega com as duas variantes e rejeita status ausente ou desconhecido', () => {
    expect(
      deriveOrderJourney('delivered', { hasApprovedLyrics: true, completedAudio: 2 }),
    ).toMatchObject({ valid: true, kind: 'delivered', step: 5, complete: true });
    expect(deriveOrderJourney('delivered', { hasApprovedLyrics: true, completedAudio: 1 })).toEqual(
      { valid: false, reason: 'inconsistent_delivery' },
    );
    expect(
      deriveOrderJourney('future_status', { hasApprovedLyrics: false, completedAudio: 0 }),
    ).toEqual({ valid: false, reason: 'unknown_status' });
    expect(deriveOrderJourney(undefined, { hasApprovedLyrics: false, completedAudio: 0 })).toEqual({
      valid: false,
      reason: 'unknown_status',
    });
  });

  it('escolhe a versão de maior número sem alterar a lista recebida', () => {
    const versions = [
      { number: 2, content: { title: 'Dois' } },
      { number: 7, content: { title: 'Sete' } },
      { number: 4, content: { title: 'Quatro' } },
    ];
    expect(latestLyrics(versions)?.content.title).toBe('Sete');
    expect(versions.map(({ number }) => number)).toEqual([2, 7, 4]);
  });

  it('conta somente variantes concluídas e não duplica a mesma variante', () => {
    expect(
      completedAudioCount([
        { variant: 1, status: 'completed' },
        { variant: 1, status: 'completed' },
        { variant: 2, status: 'processing' },
        { variant: 3, status: 'completed' },
      ]),
    ).toBe(2);
  });
});
