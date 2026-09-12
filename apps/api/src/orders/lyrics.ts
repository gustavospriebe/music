import { lyricsContentSchema } from '@resenha/contracts';
import { canonicalizeLyrics, evaluateContent, validateLyrics } from '@resenha/domain';
import type { CreativeBrief } from '@resenha/contracts';
import { PublicHttpError } from '../http.js';

/** The exact approved text is validated before any version can be persisted. */
export const validateCustomerLyrics = (input: unknown, story: CreativeBrief) => {
  const content = canonicalizeLyrics(lyricsContentSchema.parse(input));
  const assessment = evaluateContent(
    JSON.stringify({
      title: content.title,
      fullLyrics: content.fullLyrics,
      musicalDirection: content.musicalDirection,
    }),
  );
  if (!assessment.allowed) throw new PublicHttpError(assessment.reason);
  const errors = validateLyrics(content, story);
  if (errors.length) throw new PublicHttpError(errors.join(' '));
  return content;
};
