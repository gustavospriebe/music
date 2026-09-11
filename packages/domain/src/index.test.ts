import { describe, expect, it } from 'vitest';
import type { GeneratedLyrics, Story } from '@resenha/contracts';
import {
  assertTransition,
  calculatePriceCents,
  createAccessToken,
  evaluateContent,
  hashToken,
  makeMusicPrompt,
  retryDelayMs,
  sanitizeAiError,
  stableDeliveryToken,
  validateLyrics,
  verifyToken,
} from './index.js';

const story: Story = {
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
const lyrics: GeneratedLyrics = {
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
  it('accepts a structured, safe lyric that covers mandatory facts', () =>
    expect(validateLyrics(lyrics, story)).toEqual([]));
  it('rejects missing mandatory facts and prohibited topics', () => {
    expect(validateLyrics({ ...lyrics, fullLyrics: 'Bia e política no refrão' }, story)).toContain(
      'A letra não representa todos os fatos obrigatórios.',
    );
    expect(
      validateLyrics({ ...lyrics, fullLyrics: `${lyrics.fullLyrics}\npolítica` }, story),
    ).toContain('A letra contém um assunto proibido.');
  });
  it('makes a bounded retry delay and a safe music prompt', () => {
    expect(retryDelayMs(3, 1_000, 60_000, () => 0)).toBe(3_000);
    expect(calculatePriceCents(4_990, [500, 250])).toBe(5_740);
    expect(makeMusicPrompt(lyrics)).toContain('100% original');
  });
  it('sanitizes provider errors to a single capped line', () => {
    expect(sanitizeAiError(new Error('a\nb'))).toBe('a b');
    expect(sanitizeAiError('x'.repeat(600)).length).toBeLessThanOrEqual(500);
    expect(sanitizeAiError(null)).toBe('unknown provider error');
  });
});

it('keeps delivery tokens stable for one delivery and isolated across delivery ids and peppers', () => {
  const token = stableDeliveryToken('delivery-a', 'pepper');
  expect(token).toBe(stableDeliveryToken('delivery-a', 'pepper'));
  expect(token).not.toBe(stableDeliveryToken('delivery-b', 'pepper'));
  expect(token).not.toBe(stableDeliveryToken('delivery-a', 'other-pepper'));
  expect(token.length).toBeGreaterThanOrEqual(43);
});

it('lets a custom song interpret the brief without copying it into lyrics', () => {
  const creative: Story = {
    productType: 'custom_song',
    intention: 'livre',
    buyerEmail: 'author@example.test',
    subjectName: 'Uma viagem que transforma a vida',
    occasion: 'Uma ideia',
    genre: 'MPB',
    mood: 'Calmo',
    voice: 'either',
    facts: [],
    catchphrases: [],
    prohibitedTopics: [],
    termsAccepted: true,
    marketingAccepted: false,
    safetyConfirmed: true,
    brief: 'Uma reflexão sobre a vida na estrada e as diferentes estações do ano. '.repeat(8),
  };
  expect(validateLyrics(lyrics, creative)).toEqual([]);
  expect(makeMusicPrompt(lyrics)).not.toContain('original e alegre');
});

it('requires even a two-character explicit custom fact while keeping brief interpretation free', () => {
  const creative: Story = {
    productType: 'custom_song',
    intention: 'livre',
    buyerEmail: 'author@example.test',
    subjectName: 'Livre',
    occasion: 'Uma ideia',
    genre: 'MPB',
    mood: 'Calmo',
    voice: 'either',
    facts: ['Oi'],
    catchphrases: [],
    prohibitedTopics: [],
    termsAccepted: true,
    marketingAccepted: false,
    safetyConfirmed: true,
    brief: 'Uma canção para começar o dia',
  };
  expect(validateLyrics(lyrics, creative)).toContain(
    'A letra não representa todos os fatos obrigatórios.',
  );
  expect(validateLyrics({ ...lyrics, fullLyrics: `${lyrics.fullLyrics}\nOi` }, creative)).toEqual(
    [],
  );
});

it('allows administrative restoration to customer lyrics review without bypassing checkout', () => {
  for (const status of ['story_completed', 'lyrics_approved', 'failed'] as const)
    expect(() => assertTransition(status, 'lyrics_ready')).not.toThrow();
  expect(() => assertTransition('payment_pending', 'lyrics_ready')).toThrow();
  expect(() => assertTransition('lyrics_ready', 'audio_queued')).toThrow();
});
