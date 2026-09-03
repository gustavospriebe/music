import { describe, expect, it } from 'vitest';
import { storySchema } from './index.js';
const common = {
    buyerEmail: 'cliente@example.com',
    subjectName: 'Bia',
    occasion: 'Aniversário',
    genre: 'Pagode',
    voice: 'female',
    mood: 'Animado',
    facts: ['Sempre chega cantando', 'Junta toda a turma'],
    termsAccepted: true,
};
describe('storySchema', () => {
    it('accepts a complete friend-roast story and applies list defaults', () => {
        const story = storySchema.parse({
            ...common,
            productType: 'friend_roast',
            relationship: 'Amiga',
            traits: ['Engraçada'],
            biggestStory: 'A viagem para a praia',
            roastLevel: 'light',
            safetyConfirmed: true,
        });
        expect(story.catchphrases).toEqual([]);
        expect(story.productType).toBe('friend_roast');
    });
    it('requires the product-specific safety confirmation', () => {
        const result = storySchema.safeParse({
            ...common,
            productType: 'team_anthem',
            location: 'Vila Madalena',
            colors: 'Azul e branco',
            players: ['Nando'],
            greatestWin: 'Final do bairro',
            biggestLoss: 'Chuva no campo',
            anthemStyle: 'samba',
            amateurConfirmed: false,
        });
        expect(result.success).toBe(false);
    });
    it('rejects oversized and blank mandatory answers', () => {
        const result = storySchema.safeParse({
            ...common,
            subjectName: ' ',
            productType: 'emotional_tribute',
            relationship: 'Irmã',
            howMet: 'Na escola',
            mostImportantMemory: 'A formatura',
            gratitudeReason: 'Pelo apoio',
            milestone: 'A mudança',
            desiredFeeling: 'Alegria',
        });
        expect(result.success).toBe(false);
    });
});
