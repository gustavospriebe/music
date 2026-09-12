import { and, desc, eq, sql } from 'drizzle-orm';
import { generateLyricsSchema, lyricsContentSchema, type ReadStory } from '@resenha/contracts';
import { generationJobs, lyricVersions, orders } from '@resenha/database';
import { assertTransition, evaluateContent } from '@resenha/domain';
import { PublicHttpError } from '../http.js';
import { recoveryFor, type RecoveryContext } from '../recovery.js';
import type { HttpDb } from '../routes/context.js';
type Transaction = Parameters<Parameters<HttpDb['transaction']>[0]>[0];
type LyricsGenerationDeps = {
  db: HttpDb;
  lyricsAvailable: boolean;
  storyWithContact: (id: string) => Promise<ReadStory | undefined>;
  recoveryContext: (order: typeof orders.$inferSelect, tx: Transaction) => Promise<RecoveryContext>;
};

export const requestLyricsGeneration = async (
  deps: LyricsGenerationDeps,
  order: typeof orders.$inferSelect,
  body: unknown,
  administrative = false,
) => {
  const { db, storyWithContact, recoveryContext, lyricsAvailable } = deps;
  const fail = (message: string, statusCode = 400) => new PublicHttpError(message, statusCode);
  const input = generateLyricsSchema.parse(body ?? {});
  const isRefinement = 'instructions' in input;
  if (isRefinement) {
    if (order.status !== 'lyrics_ready')
      throw fail('O refinamento exige uma letra pronta e salva.', 409);
    const assessment = evaluateContent(input.instructions);
    if (!assessment.allowed) throw fail(assessment.reason);
  }
  if (order.status === 'draft') throw fail('Preencha o formulário antes de gerar a letra.');
  if (!['story_completed', 'lyrics_ready', 'failed', 'lyrics_generating'].includes(order.status))
    throw fail('Este pedido não aceita mais geração de letra.');
  if (!(await storyWithContact(order.id))) throw fail('Formulário ausente');
  if (!lyricsAvailable)
    throw fail('Criação da letra temporariamente indisponível. Sua história está salva.', 503);
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(orders).where(eq(orders.id, order.id)).for('update');
    if (!current) throw fail('Pedido não encontrado', 404);
    const context = await recoveryContext(current, tx);
    if (context.unresolvedAiKinds?.includes('lyrics'))
      throw fail('Confira a chamada de IA sem resultado antes de iniciar outra tentativa.', 409);
    const otherBusy = context.jobs.some(
      (job) => job.type !== 'generate_lyrics' && ['pending', 'processing'].includes(job.status),
    );
    if (context.paid || otherBusy)
      throw fail('Este pedido já está em produção ou aguardando processamento.', 409);
    if (administrative) {
      const recovery = recoveryFor(context);
      const inFlight = context.jobs.some(
        (job) => job.type === 'generate_lyrics' && ['pending', 'processing'].includes(job.status),
      );
      if (!recovery.lyrics.canGenerate && !inFlight)
        throw fail(
          recovery.lyrics.generateBlockedReason ?? 'A letra não pode ser gerada nesta etapa.',
          409,
        );
    }
    if (isRefinement) {
      if (current.status !== 'lyrics_ready')
        throw fail('O refinamento exige uma letra pronta e salva.', 409);
      const [base] = await tx
        .select()
        .from(lyricVersions)
        .where(
          and(eq(lyricVersions.orderId, order.id), eq(lyricVersions.number, input.baseVersion)),
        );
      if (!base) throw fail('Versão não encontrada.', 404);
      const [latest] = await tx
        .select({ number: lyricVersions.number })
        .from(lyricVersions)
        .where(eq(lyricVersions.orderId, order.id))
        .orderBy(desc(lyricVersions.number))
        .limit(1);
      if (latest?.number !== input.baseVersion)
        throw fail('A letra foi atualizada. Use a versão salva mais recente.', 409);
      const saved = lyricsContentSchema.parse(base.content);
      const canonical = {
        title: saved.title,
        fullLyrics: saved.fullLyrics,
        musicalDirection: saved.musicalDirection,
      };
      const assessment = evaluateContent(JSON.stringify(canonical));
      if (!assessment.allowed) throw fail(assessment.reason);
    }
    const [generated] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(lyricVersions)
      .where(and(eq(lyricVersions.orderId, order.id), eq(lyricVersions.kind, 'generated')));
    if (generated && generated.count >= 4)
      throw fail('O limite de três novas gerações foi atingido.');
    if (
      !['story_completed', 'lyrics_ready', 'failed', 'lyrics_generating'].includes(current.status)
    )
      throw fail('Este pedido não aceita mais geração de letra.');
    const [countRow = { count: 0 }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(lyricVersions)
      .where(eq(lyricVersions.orderId, order.id));
    const nextVersion = countRow.count + 1;
    const payload = isRefinement
      ? {
          targetVersion: nextVersion,
          refinement: { instructions: input.instructions, baseVersion: input.baseVersion },
        }
      : { targetVersion: nextVersion };
    const idempotencyKey = `lyrics:${order.id}:${nextVersion}`;
    const samePayload = (left: unknown) => JSON.stringify(left) === JSON.stringify(payload);
    const inFlight = context.jobs.find(
      (job) => job.type === 'generate_lyrics' && ['pending', 'processing'].includes(job.status),
    );
    if (inFlight && !samePayload(inFlight.payload))
      throw fail('A letra já está sendo criada. Aguarde a conclusão desta tentativa.', 409);
    if (!inFlight) {
      const [existing] = await tx
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.idempotencyKey, idempotencyKey));
      if (existing && ['pending', 'processing'].includes(existing.status)) {
        if (!samePayload(existing.payload))
          throw fail('A letra já está sendo criada. Aguarde a conclusão desta tentativa.', 409);
      } else if (existing && (existing.status === 'failed' || existing.status === 'cancelled')) {
        await tx
          .update(generationJobs)
          .set({
            status: 'pending',
            maxAttempts: sql`greatest(${generationJobs.maxAttempts}, ${generationJobs.attempts} + 1)`,
            leaseToken: null,
            leaseExpiresAt: null,
            payload,
            runAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(generationJobs.id, existing.id));
      } else if (!existing) {
        await tx.insert(generationJobs).values({
          type: 'generate_lyrics',
          orderId: order.id,
          payload,
          idempotencyKey,
        });
      }
    }
    if (current.status !== 'lyrics_generating') {
      assertTransition(current.status, 'lyrics_generating');
      const [claim] = await tx
        .update(orders)
        .set({ status: 'lyrics_generating', updatedAt: new Date() })
        .where(and(eq(orders.id, order.id), eq(orders.status, current.status)))
        .returning({ id: orders.id });
      if (!claim)
        throw fail('A letra já está sendo criada. Aguarde a conclusão desta tentativa.', 409);
    }
  });
  return { accepted: true as const, status: 'lyrics_generating' as const };
};
