import { describe, expect, it, vi } from 'vitest';
import { creativeBriefSchema, generatedLyricsSchema } from '@resenha/contracts';
import { createOpenRouterLyricsProvider, musicalStory } from './lyrics.js';

describe('musicalStory', () => {
  it('omits buyer contact and consent from musical context', () => {
    const context = musicalStory(
      creativeBriefSchema.parse({
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
      }),
    );
    expect(context).toMatchObject({ subjectName: 'O mar', brief: 'Uma música calma sobre o mar' });
    for (const key of ['buyerEmail', 'buyerName', 'termsAccepted', 'marketingAccepted'])
      expect(context).not.toHaveProperty(key);
  });
});

describe('createOpenRouterLyricsProvider', () => {
  it('sends the selected intention and free context without inventing an occasion', async () => {
    const story = creativeBriefSchema.parse({
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
      const provider = createOpenRouterLyricsProvider({
        apiKey: 'synthetic-key',
        model: 'test-model',
        maxTokens: 4096,
        webUrl: 'http://localhost:5175',
      });
      await provider.generate(story);
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
      await provider.generate(story, 'Inclua um refrão', {
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
      expect(JSON.stringify(refined.messages)).not.toContain('private@example.test');
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('preserves reported usage when a paid response fails the lyrics schema without exposing its body', async () => {
    const brief = creativeBriefSchema.parse({
      productType: 'custom_song',
      subjectName: 'Mar',
      genre: 'MPB',
      mood: 'Calmo',
      voice: 'either',
      brief: 'Uma música sobre o mar',
    });
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'charged-invalid',
          usage: { cost: 0.015, prompt_tokens: 20, completion_tokens: 100 },
          choices: [
            { message: { content: JSON.stringify({ private: 'sensitive provider output' }) } },
          ],
        }),
      ),
    );
    try {
      const failure = await createOpenRouterLyricsProvider({
        apiKey: 'synthetic',
        model: 'model',
        maxTokens: 100,
        webUrl: 'http://localhost',
      })
        .generate(brief)
        .catch((error: unknown) => error);
      expect(failure).toMatchObject({
        code: 'AI_INVALID_RESPONSE',
        outcome: 'rejected',
        usage: {
          requestId: 'charged-invalid',
          costUsd: '0.015',
          costSource: 'reported',
          inputTokens: 20,
          outputTokens: 100,
        },
      });
      expect(String(failure)).not.toContain('sensitive');
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      fetch.mockRestore();
    }
  });
});
