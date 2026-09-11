import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { customSongStorySchema, generatedLyricsSchema } from '@resenha/contracts';
import { parseEnv } from './env.js';
import {
  createLocalStorage,
  verifyAbacatePaySecret,
  musicalStory,
  createOpenRouterLyricsProvider,
} from './providers.js';

describe('storage provider', () => {
  it('stores files below its configured root and rejects traversal-like keys', async () => {
    const root = await mkdtemp(join(tmpdir(), 'resenha-storage-'));
    const storage = createLocalStorage(root);
    try {
      await expect(
        storage.put('../outside.txt', Buffer.from('safe'), 'text/plain'),
      ).rejects.toThrow('Invalid storage key');
      const saved = await storage.put('orders/demo/audio.wav', Buffer.from('demo'), 'audio/wav');
      expect(saved).toMatchObject({ key: 'orders/demo/audio.wav', size: 4, mime: 'audio/wav' });
      await expect(storage.get(saved.key)).resolves.toEqual(Buffer.from('demo'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('AbacatePay webhook secret', () => {
  it('accepts a matching secret and rejects missing or different values', () => {
    expect(verifyAbacatePaySecret({ received: 'abc', expected: 'abc' })).toBe(true);
    expect(verifyAbacatePaySecret({ received: 'abc', expected: 'abd' })).toBe(false);
    expect(verifyAbacatePaySecret({ received: undefined, expected: 'abc' })).toBe(false);
    expect(verifyAbacatePaySecret({ received: 'abc', expected: undefined })).toBe(false);
    expect(verifyAbacatePaySecret({ received: 'ab', expected: 'abc' })).toBe(false);
  });
});

it('omits buyer contact and consent from musical context', () => {
  const context = musicalStory({
    productType: 'custom_song',
    intention: 'livre',
    buyerName: 'Comprador',
    buyerEmail: 'private@example.test',
    termsAccepted: true,
    marketingAccepted: false,
    subjectName: 'O mar',
    occasion: 'Inspiração',
    genre: 'MPB',
    mood: 'Calmo',
    voice: 'either',
    facts: ['Ondas na areia'],
    brief: 'Uma música calma sobre o mar',
    safetyConfirmed: true,
    catchphrases: [],
    prohibitedTopics: [],
  });
  expect(context).toMatchObject({ subjectName: 'O mar', brief: 'Uma música calma sobre o mar' });
  for (const key of ['buyerEmail', 'buyerName', 'termsAccepted', 'marketingAccepted'])
    expect(context).not.toHaveProperty(key);
});

it('sends the selected intention and free context to lyrics generation without inventing an occasion', async () => {
  const story = customSongStorySchema.parse({
    productType: 'custom_song',
    intention: 'amizade',
    subjectName: 'Amigos pela estrada',
    buyerEmail: 'private@example.test',
    genre: 'MPB',
    mood: 'Contemplativo',
    voice: 'either',
    brief: 'Uma música sobre os amigos que encontramos pelo caminho',
    safetyConfirmed: true,
    termsAccepted: true,
  });
  const env = parseEnv({
    DATABASE_URL: 'postgresql://test:test@localhost/test',
    COOKIE_SECRET: 'test-cookie-secret-more-than-32-characters',
    CUSTOMER_ACCESS_TOKEN_PEPPER: 'test-access-pepper-more-than-32-characters',
    ADMIN_EMAIL: 'test@example.test',
    ADMIN_PASSWORD: 'test-password',
    OPENROUTER_API_KEY: 'synthetic-key',
    OPENROUTER_TEXT_MODEL: 'test-model',
    OPENROUTER_TEXT_MAX_TOKENS: '4096',
  });
  const lyrics = {
    title: 'Amigos da estrada',
    summary: 'Uma amizade',
    language: 'pt-BR',
    musicalDirection: {
      genre: 'MPB',
      mood: 'Contemplativo',
      tempo: 'medium',
      voice: 'either',
      instrumentation: ['violão'],
    },
    pronunciationNotes: [],
    sections: [
      { type: 'verse', label: 'Verso', lyrics: 'Cada encontro tem seu lugar' },
      { type: 'chorus', label: 'Refrão', lyrics: 'Amigos pela estrada' },
      { type: 'outro', label: 'Final', lyrics: 'Seguimos juntos' },
    ],
    fullLyrics: 'Cada encontro tem seu lugar\nAmigos pela estrada\nSeguimos juntos',
    safetyNotes: [],
  };
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify(lyrics) } }] }),
          { status: 200 },
        ),
    );
  try {
    await createOpenRouterLyricsProvider(env).generate(story);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const context = JSON.parse(
      request.messages.find((message: { role: string }) => message.role === 'user').content,
    );
    expect(context).toMatchObject({
      intention: 'amizade',
      occasion: '',
      brief: story.brief,
      subjectName: story.subjectName,
      genre: story.genre,
      mood: story.mood,
    });
    expect(context).not.toHaveProperty('buyerEmail');
    expect(request.max_tokens).toBe(4096);
    expect(request.messages[0].content).toContain('intention');
    expect(request.messages[0].content).toContain('occasion');
    expect(request.messages[0].content).toContain('não invente fatos');
    const saved = {
      title: 'Minha edição',
      fullLyrics: 'Minha versão salva pelo cliente',
      musicalDirection: generatedLyricsSchema.parse(lyrics).musicalDirection,
    };
    await createOpenRouterLyricsProvider(env).generate(story, 'Inclua um refrão', {
      instructions: 'Deixe mais alegre',
      lyrics: saved,
    });
    const refined = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(JSON.parse(refined.messages[2].content)).toEqual({
      task: 'Refine a saved lyrics version',
      instructions: 'Deixe mais alegre',
      savedLyrics: saved,
    });
    expect(refined.messages[3].content).toContain('Inclua um refrão');
    expect(refined.messages[0]).toEqual(request.messages[0]);
    expect(refined.messages[2].content).not.toContain('sections');
    expect(refined.messages[0].content).toContain('regras de segurança');
    expect(JSON.stringify(refined.messages)).not.toContain(story.buyerEmail);
  } finally {
    fetchMock.mockRestore();
  }
});
