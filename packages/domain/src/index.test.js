import { describe, expect, it } from 'vitest';
import { assertTransition, calculatePriceCents, createAccessToken, evaluateContent, hashToken, makeMusicPrompt, retryDelayMs, validateLyrics, verifyToken, } from './index.js';
const story = {
    buyerEmail: 'cliente@example.com',
    subjectName: 'Bia',
    occasion: 'Aniversário',
    genre: 'Pagode',
    voice: 'female',
    mood: 'Animado',
    facts: ['Sempre chega cantando', 'Junta toda a turma'],
    catchphrases: [],
    prohibitedTopics: ['política'],
    termsAccepted: true,
    marketingAccepted: false,
    productType: 'friend_roast',
    relationship: 'Amiga',
    traits: ['Engraçada'],
    biggestStory: 'A viagem para a praia',
    insideJokes: [],
    mentions: [],
    roastLevel: 'light',
    safetyConfirmed: true,
};
const lyrics = {
    title: 'Bia na roda',
    summary: 'Uma celebração',
    language: 'pt-BR',
    musicalDirection: {
        genre: 'Pagode',
        mood: 'Animado',
        tempo: 'medium',
        voice: 'female',
        instrumentation: ['Violão'],
    },
    pronunciationNotes: [],
    sections: [
        { type: 'intro', label: 'Intro', lyrics: 'Bia chegou' },
        { type: 'verse', label: 'Verso', lyrics: 'Sempre chega cantando e junta toda a turma' },
        { type: 'chorus', label: 'Refrão', lyrics: 'Bia, Bia, vem cantar' },
    ],
    fullLyrics: 'Bia chegou\nSempre chega cantando e junta toda a turma\nBia, Bia, vem cantar',
    safetyNotes: [],
};
describe('order state machine', () => {
    it('allows only explicit transitions', () => {
        expect(() => assertTransition('draft', 'story_completed')).not.toThrow();
        expect(() => assertTransition('draft', 'paid')).toThrow('Invalid order transition');
    });
});
describe('security helpers', () => {
    it('creates strong tokens and compares their hashes', () => {
        const token = createAccessToken();
        const hash = hashToken(token, 'pepper');
        expect(token.length).toBeGreaterThanOrEqual(43);
        expect(verifyToken(token, hash, 'pepper')).toBe(true);
        expect(verifyToken('wrong-token', hash, 'pepper')).toBe(false);
    });
    it('flags unsafe content categories', () => {
        expect(evaluateContent('Vamos matar o rival').allowed).toBe(false);
        expect(evaluateContent('Clone a voz do cantor').allowed).toBe(false);
        expect(evaluateContent('Uma canção alegre de aniversário').allowed).toBe(true);
    });
});
describe('lyrics and generation rules', () => {
    it('accepts a structured, safe lyric that covers mandatory facts', () => expect(validateLyrics(lyrics, story)).toEqual([]));
    it('rejects missing mandatory facts and prohibited topics', () => {
        expect(validateLyrics({ ...lyrics, fullLyrics: 'Bia e política no refrão' }, story)).toContain('A letra não representa todos os fatos obrigatórios.');
        expect(validateLyrics({ ...lyrics, fullLyrics: `${lyrics.fullLyrics}\npolítica` }, story)).toContain('A letra contém um assunto proibido.');
    });
    it('makes a bounded retry delay and a safe music prompt', () => {
        expect(retryDelayMs(3, 1_000, 60_000, () => 0)).toBe(3_000);
        expect(calculatePriceCents(4_990, [500, 250])).toBe(5_740);
        expect(makeMusicPrompt(lyrics)).toContain('Não imite artistas.');
    });
});
