import type { FastifyInstance } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  approveLyricsSchema,
  createAlbumCoverSchema,
  createOrderSchema,
  deliveryAccessSchema,
  lyricsContentSchema,
  storySchema,
  revisionRequestSchema,
} from '@resenha/contracts';
import {
  audioGenerations,
  reconcileOrderPayment,
  deliveries,
  lyricVersions,
  orderContacts,
  orderConsents,
  orderEvents,
  orders,
  products,
  revisionRequests,
  storedFiles,
  storySessions,
} from '@resenha/database';
import {
  assertTransition,
  createAccessToken,
  evaluateContent,
  hashToken,
  splitStoryContact,
  verifyToken,
} from '@resenha/domain';
import { paymentProviderResolver } from '../payment.js';
import { validateCustomerLyrics } from '../orders/lyrics.js';
import { orderPaymentConfiguration, publicConfiguration } from '../configuration.js';
import { MAX_REFERENCE_IMAGE_BYTES, normalizeReferenceImage } from '../providers.js';
import { sendPrivateFile } from '../files/download.js';
import type { CoverRow, HttpContext } from './context.js';

export const registerOrderRoutes = (app: FastifyInstance, ctx: HttpContext) => {
  const {
    env,
    db,
    pool,
    storage,
    paymentProvider,
    fail,
    orderFor,
    recordEvent,
    setAccessCookie,
    hasAccess,
    hasViewAccess,
    coverAvailable,
    publicCover,
    latestCover,
    generateOrderLyrics,
    deliveredOrderFor,
    releasedDeliveryFor,
    currentAudioJobSelection,
    storyWithContact,
  } = ctx;
  app.post('/api/v1/orders', async (request, reply) => {
    const input = createOrderSchema.parse(request.body);
    const creationKeyHash = hashToken(input.creationKey, env.CUSTOMER_ACCESS_TOKEN_PEPPER);
    const [existing] = await db
      .select()
      .from(orders)
      .where(eq(orders.creationKeyHash, creationKeyHash));
    if (existing) {
      await setAccessCookie(reply, 'order', existing.publicId);
      return reply.status(201).send({ publicId: existing.publicId });
    }
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.type, input.productType), eq(products.active, true)));
    if (!product) throw fail('Produto indisponível.', 404);
    const token = createAccessToken();
    const [order] = await db
      .insert(orders)
      .values({
        publicId: nanoid(16),
        productType: input.productType,
        priceCents: product.priceCents,
        accessTokenHash: hashToken(token, env.CUSTOMER_ACCESS_TOKEN_PEPPER),
        creationKeyHash,
      })
      .onConflictDoNothing({ target: orders.creationKeyHash })
      .returning();
    const created = Boolean(order);
    const resolved =
      order ??
      (await db.select().from(orders).where(eq(orders.creationKeyHash, creationKeyHash)))[0];
    if (!resolved) throw fail('Não foi possível criar o pedido.', 503);
    await setAccessCookie(reply, 'order', resolved.publicId);
    if (created) await recordEvent('order_created', resolved, input.visitorId);
    return reply.status(201).send({ publicId: resolved.publicId });
  });
  app.patch('/api/v1/orders/:publicId/story', async (request) => {
    const storyPublicId = (request.params as { publicId: string }).publicId;
    if (!(await hasAccess(storyPublicId, request))) throw fail('Acesso privado necessário', 401);
    const order = await orderFor(storyPublicId);
    if (!['draft', 'story_completed'].includes(order.status))
      throw fail('O formulário não pode mais ser alterado.');
    const story = storySchema.parse(request.body);
    const policyVersion = publicConfiguration(env).commercial.policyVersion;
    if (!policyVersion || story.policyVersion !== policyVersion)
      throw fail(
        'As condições de uso foram atualizadas. Reabra o formulário e confirme o aceite.',
        409,
      );
    if (story.productType !== order.productType) throw fail('Tipo de produto inválido.');
    const { creative, contact } = splitStoryContact(story);
    const content = evaluateContent(JSON.stringify(creative));
    if (!content.allowed) throw fail(content.reason);
    const isFirstSave = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(orders).where(eq(orders.id, order.id)).for('update');
      if (!current || !['draft', 'story_completed'].includes(current.status))
        throw fail('O formulário não pode mais ser alterado.', 409);
      const firstSave = current.status === 'draft';
      await tx
        .insert(storySessions)
        .values({ orderId: order.id, data: creative })
        .onConflictDoUpdate({
          target: storySessions.orderId,
          set: { data: creative, updatedAt: new Date() },
        });
      await tx
        .insert(orderContacts)
        .values({
          orderId: order.id,
          email: contact.email,
          name: contact.name,
          marketingAccepted: contact.marketingAccepted,
        })
        .onConflictDoUpdate({
          target: orderContacts.orderId,
          set: {
            email: contact.email,
            name: contact.name,
            marketingAccepted: contact.marketingAccepted,
            updatedAt: new Date(),
          },
        });
      await tx.insert(orderConsents).values([
        { orderId: order.id, kind: 'terms', policyVersion, accepted: true },
        { orderId: order.id, kind: 'privacy', policyVersion, accepted: true },
        { orderId: order.id, kind: 'content_rights', policyVersion, accepted: true },
        {
          orderId: order.id,
          kind: 'marketing',
          policyVersion,
          accepted: contact.marketingAccepted,
        },
      ]);
      await tx
        .insert(orderEvents)
        .values({ orderId: order.id, type: 'story_saved', data: { policyVersion } });
      if (firstSave) {
        assertTransition('draft', 'story_completed');
        await tx
          .update(orders)
          .set({ status: 'story_completed', updatedAt: new Date() })
          .where(eq(orders.id, order.id));
      }
      return firstSave;
    });
    if (isFirstSave) await recordEvent('story_saved', order);
    return { saved: true };
  });
  app.post(
    '/api/v1/orders/:publicId/lyrics/generate',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const publicId = (request.params as { publicId: string }).publicId;
      if (!(await hasAccess(publicId, request))) throw fail('Acesso privado necessário', 401);
      return reply
        .status(202)
        .send(await generateOrderLyrics(await orderFor(publicId), request.body));
    },
  );
  app.patch('/api/v1/orders/:publicId/lyrics/:versionNumber', async (request) => {
    const editPublicId = (request.params as { publicId: string }).publicId;
    if (!(await hasAccess(editPublicId, request))) throw fail('Acesso privado necessário', 401);
    const versionNumber = Number((request.params as { versionNumber: string }).versionNumber);
    if (!Number.isInteger(versionNumber) || versionNumber < 1) throw fail('Versão inválida.', 404);
    const candidate = lyricsContentSchema.parse(request.body);
    return db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.publicId, editPublicId))
        .for('update');
      if (!order) throw fail('Pedido não encontrado', 404);
      if (order.status !== 'lyrics_ready') throw fail('A letra está bloqueada.');
      const story = await storyWithContact(order.id);
      if (!story) throw fail('Formulário ausente.', 409);
      const content = validateCustomerLyrics(candidate, story);
      const [base] = await tx
        .select({ number: lyricVersions.number })
        .from(lyricVersions)
        .where(and(eq(lyricVersions.orderId, order.id), eq(lyricVersions.number, versionNumber)));
      if (!base) throw fail('Versão não encontrada.', 404);
      const [countRow = { count: 0 }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(lyricVersions)
        .where(eq(lyricVersions.orderId, order.id));
      const [version] = await tx
        .insert(lyricVersions)
        .values({ orderId: order.id, number: countRow.count + 1, kind: 'edited', content })
        .returning({ number: lyricVersions.number, kind: lyricVersions.kind });
      return version;
    });
  });
  app.post('/api/v1/orders/:publicId/lyrics/:versionNumber/approve', async (request) => {
    const approvePublicId = (request.params as { publicId: string }).publicId;
    if (!(await hasAccess(approvePublicId, request))) throw fail('Acesso privado necessário', 401);
    const versionNumber = Number((request.params as { versionNumber: string }).versionNumber);
    if (!Number.isInteger(versionNumber) || versionNumber < 1) throw fail('Versão inválida.', 404);
    const { content } = approveLyricsSchema.parse(request.body ?? {});
    const order = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.publicId, approvePublicId))
        .for('update');
      if (!order) throw fail('Pedido não encontrado', 404);
      if (order.status !== 'lyrics_ready') throw fail('A letra não está disponível.');
      const [version] = await tx
        .select({ content: lyricVersions.content })
        .from(lyricVersions)
        .where(and(eq(lyricVersions.orderId, order.id), eq(lyricVersions.number, versionNumber)));
      if (!version) throw fail('Versão não encontrada.', 404);
      const story = await storyWithContact(order.id);
      if (!story) throw fail('Formulário ausente.', 409);
      const approvedContent = validateCustomerLyrics(content ?? version.content, story);
      const [countRow = { count: 0 }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(lyricVersions)
        .where(eq(lyricVersions.orderId, order.id));
      await tx.insert(lyricVersions).values({
        orderId: order.id,
        number: countRow.count + 1,
        kind: 'approved',
        content: approvedContent,
        approvedAt: new Date(),
      });
      await tx.insert(orderEvents).values({
        orderId: order.id,
        type: 'lyrics_approved',
        data: { versionNumber: countRow.count + 1 },
      });
      assertTransition(order.status, 'lyrics_approved');
      await tx
        .update(orders)
        .set({ status: 'lyrics_approved', updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      return order;
    });
    await recordEvent('lyrics_approved', order);
    return { approved: true };
  });
  app.post('/api/v1/orders/:publicId/access/exchange', async (request, reply) => {
    const { token } = (request.body ?? {}) as { token?: string };
    const order = await orderFor((request.params as { publicId: string }).publicId);
    if (
      !token ||
      order.accessRevokedAt ||
      !verifyToken(token, order.accessTokenHash, env.CUSTOMER_ACCESS_TOKEN_PEPPER)
    )
      throw fail('Link de acesso inválido', 401);
    await setAccessCookie(reply, 'order', order.publicId);
    return { ok: true };
  });
  app.get('/api/v1/orders/:publicId', async (request) => {
    const publicId = (request.params as { publicId: string }).publicId;
    if (!(await hasViewAccess(publicId, request))) throw fail('Acesso privado necessário', 401);
    const full = await hasAccess(publicId, request);
    let order = await orderFor(publicId);

    if (order.status === 'payment_pending') {
      await reconcileOrderPayment(
        pool,
        order.id,
        paymentProviderResolver(env, paymentProvider),
        currentAudioJobSelection(env),
      );
      order = await orderFor(publicId);
    }

    const story = full ? await storyWithContact(order.id) : undefined;
    const versions = await db
      .select()
      .from(lyricVersions)
      .where(eq(lyricVersions.orderId, order.id))
      .orderBy(desc(lyricVersions.number));
    const audio = await db
      .select({ variant: audioGenerations.variant, status: audioGenerations.status })
      .from(audioGenerations)
      .where(
        and(
          eq(audioGenerations.orderId, order.id),
          sql`${audioGenerations.productionId} = ${order.currentProductionId}`,
          eq(audioGenerations.selected, true),
        ),
      );
    const publicOrder = {
      publicId: order.publicId,
      productType: order.productType,
      status: order.status,
      priceCents: order.priceCents,
      createdAt: order.createdAt,
    };
    const publicLyrics = versions.map((version) => ({
      number: version.number,
      kind: version.kind,
      approvedAt: version.approvedAt,
      content: version.content,
    }));
    return {
      order: publicOrder,
      story,
      lyrics: publicLyrics,
      remainingGenerations: Math.max(
        0,
        4 - versions.filter((version) => version.kind === 'generated').length,
      ),
      audio,
      privateAccess: full,
      payment: orderPaymentConfiguration(env, order.priceCents),
    };
  });
  app.get('/api/v1/orders/:publicId/cover', async (request) => {
    const publicId = (request.params as { publicId: string }).publicId;
    if (!(await hasViewAccess(publicId, request))) throw fail('Acesso privado necessário', 401);
    const order = await orderFor(publicId);
    const cover = await latestCover(order.id);
    return {
      available: coverAvailable,
      cover: cover
        ? {
            ...publicCover(cover, await hasAccess(publicId, request)),
            ...(cover.status === 'completed' && cover.coverFileId
              ? { downloadUrl: `/api/v1/orders/${publicId}/cover/download` }
              : {}),
          }
        : null,
    };
  });
  app.post(
    '/api/v1/orders/:publicId/cover',
    {
      bodyLimit: MAX_REFERENCE_IMAGE_BYTES + 64 * 1024,
      config: { rateLimit: { max: 8, timeWindow: '1 hour' } },
    },
    async (request, reply) => {
      const publicId = (request.params as { publicId: string }).publicId;
      if (!(await hasAccess(publicId, request))) throw fail('Acesso privado necessário', 401);
      if (!coverAvailable) throw fail('Geração de capa indisponível neste ambiente.', 503);
      const order = await orderFor(publicId);

      let normalizedReference: Buffer | undefined;
      const policyVersion = publicConfiguration(env).commercial.policyVersion;
      if (request.isMultipart()) {
        const upload = await request.file().catch(() => {
          throw fail('Não foi possível ler a foto enviada.');
        });
        if (!upload || upload.fieldname !== 'reference')
          throw fail('Envie uma foto de referência válida.');
        const bytes = await upload.toBuffer();
        const consent = (upload.fields.consent as { value?: unknown } | undefined)?.value;
        if (!policyVersion)
          throw fail('As condições de uso da imagem ainda não estão disponíveis.', 409);
        if (
          (upload.fields.policyVersion as { value?: unknown } | undefined)?.value !== policyVersion
        )
          throw fail(
            'As condições de uso da imagem mudaram. Recarregue e confirme novamente.',
            409,
          );
        if (consent !== 'true')
          throw fail('Confirme que você pode usar as pessoas presentes na foto.');
        if (upload.file.truncated) throw fail('A foto deve ter no máximo 8 MB.', 413);
        normalizedReference = await normalizeReferenceImage(bytes, upload.mimetype).catch(
          (error) => {
            throw fail(error instanceof Error ? error.message : 'Foto inválida.');
          },
        );
      } else {
        createAlbumCoverSchema.parse(request.body ?? {});
      }

      const referenceKey = normalizedReference
        ? `orders/${publicId}/references/${nanoid(24)}.jpg`
        : undefined;
      if (referenceKey && normalizedReference)
        await storage.put(referenceKey, normalizedReference, 'image/jpeg');

      const client = await pool.connect();
      let committed = false;
      try {
        await client.query('begin');
        await client.query('select id from orders where id=$1 for update', [order.id]);
        const payment = await client.query(
          "select 1 from payments where order_id=$1 and status='approved' limit 1",
          [order.id],
        );
        if (!payment.rowCount)
          throw fail('A capa fica disponível após a confirmação do pagamento.');
        const previous = await client.query<CoverRow>(
          `select status,attempt,reference_file_id as "referenceFileId",had_reference as "hadReference",cover_file_id as "coverFileId",created_at as "createdAt"
           from album_covers where order_id=$1 order by attempt desc limit 1`,
          [order.id],
        );
        const latest = previous.rows[0];
        const attempt = latest ? 2 : 1;
        if (latest && !(latest.attempt === 1 && latest.status === 'completed'))
          throw fail(
            latest.attempt >= 2
              ? 'As duas capas incluídas neste pedido já foram usadas.'
              : 'A primeira capa ainda está sendo criada.',
            409,
          );
        let referenceFileId: string | null = null;
        if (referenceKey && normalizedReference) {
          const asset = await client.query<{ id: string }>(
            `insert into stored_files(order_id,storage_key,mime_type,size_bytes)
             values($1,$2,'image/jpeg',$3) returning id`,
            [order.id, referenceKey, normalizedReference.length],
          );
          referenceFileId = asset.rows[0]?.id ?? null;
        }
        const model = referenceFileId
          ? env.OPENROUTER_COVER_REFERENCE_MODEL!
          : env.OPENROUTER_COVER_TEXT_MODEL!;
        const inserted = await client.query<CoverRow & { id: string }>(
          `insert into album_covers(order_id,attempt,status,reference_file_id,had_reference,model)
           values($1,$2,'pending',$3,$4,$5)
           returning id,status,attempt,reference_file_id as "referenceFileId",had_reference as "hadReference",cover_file_id as "coverFileId",created_at as "createdAt"`,
          [order.id, attempt, referenceFileId, Boolean(referenceFileId), model],
        );
        if (referenceFileId)
          await client.query(
            `insert into order_consents(order_id,kind,policy_version,accepted,cover_id) values($1,'reference_image',$2,true,$3)`,
            [order.id, policyVersion, inserted.rows[0]!.id],
          );
        await client.query(
          `insert into generation_jobs(type,order_id,payload,idempotency_key,max_attempts)
           values('generate_cover',$1,$2,$3,1) on conflict(idempotency_key) do nothing`,
          [order.id, JSON.stringify({ attempt }), `cover:${order.id}:${attempt}`],
        );
        await client.query('commit');
        committed = true;
        return reply.status(202).send(publicCover(inserted.rows[0]!, true));
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
        if (!committed && referenceKey) await storage.delete(referenceKey).catch(() => undefined);
      }
    },
  );
  app.get('/api/v1/orders/:publicId/cover/download', async (request, reply) => {
    const publicId = (request.params as { publicId: string }).publicId;
    if (!(await hasViewAccess(publicId, request))) throw fail('Acesso privado necessário', 401);
    const order = await orderFor(publicId);
    const result = await pool.query<{ storage_key: string; mime_type: string; size_bytes: number }>(
      `select f.storage_key,f.mime_type,f.size_bytes from album_covers c
       join stored_files f on f.id=c.cover_file_id
       where c.order_id=$1 and c.status='completed'
       order by c.attempt desc limit 1`,
      [order.id],
    );
    const asset = result.rows[0];
    if (!asset) throw fail('Capa ainda indisponível.', 404);
    const extension =
      asset.mime_type === 'image/png' ? 'png' : asset.mime_type === 'image/webp' ? 'webp' : 'jpg';
    reply
      .type(asset.mime_type)
      .header('content-disposition', `attachment; filename="capa-${publicId}.${extension}"`);
    return sendPrivateFile(request, reply, storage, {
      storageKey: asset.storage_key,
      mimeType: asset.mime_type,
      sizeBytes: asset.size_bytes,
    });
  });
  app.get('/api/v1/orders/:publicId/assets/:variant/download', async (request, reply) => {
    const { publicId, variant } = request.params as { publicId: string; variant: string };
    if (!(await hasViewAccess(publicId, request))) throw fail('Acesso privado necessário', 401);
    const order = await orderFor(publicId);
    const delivery = await releasedDeliveryFor(order.id);
    const variantNumber = Number(variant);
    if (!Number.isInteger(variantNumber) || variantNumber < 1)
      throw fail('Arquivo não encontrado', 404);
    const [generation] = await db
      .select({ fileId: audioGenerations.fileId })
      .from(audioGenerations)
      .where(
        and(
          eq(audioGenerations.orderId, order.id),
          eq(audioGenerations.variant, variantNumber),
          eq(audioGenerations.status, 'completed'),
          eq(audioGenerations.selected, true),
          sql`${audioGenerations.productionId} = ${delivery.productionId}`,
        ),
      );
    if (!generation?.fileId) throw fail('Arquivo não encontrado', 404);
    const [file] = await db
      .select()
      .from(storedFiles)
      .where(and(eq(storedFiles.id, generation.fileId), eq(storedFiles.orderId, order.id)));
    if (!file) throw fail('Arquivo não encontrado', 404);
    reply
      .type(file.mimeType)
      .header(
        'content-disposition',
        `attachment; filename="musica-${publicId}${file.storageKey.slice(file.storageKey.lastIndexOf('.'))}"`,
      );
    return sendPrivateFile(request, reply, storage, file);
  });
  /** Private delivery links use a random opaque token; internal order IDs never leave this boundary. */
  app.get('/api/v1/deliveries/:token', async (request) => {
    const token = (request.params as { token: string }).token;
    const [delivery] = await db
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.tokenHash, hashToken(token, env.CUSTOMER_ACCESS_TOKEN_PEPPER)),
          sql`${deliveries.revokedAt} is null`,
        ),
      );
    if (!delivery || (delivery.expiresAt && delivery.expiresAt <= new Date()))
      throw fail('Link de entrega inválido ou expirado.', 404);
    const [order] = await db.select().from(orders).where(eq(orders.id, delivery.orderId));
    if (!order) throw fail('Entrega indisponível.', 404);
    await releasedDeliveryFor(order.id);
    const lyricRows = await db
      .select()
      .from(lyricVersions)
      .where(
        and(
          eq(lyricVersions.orderId, order.id),
          sql`${lyricVersions.id} = (select lyric_version_id from productions where id = ${delivery.productionId})`,
        ),
      );
    const lyrics = lyricRows.map((row) => ({
      number: row.number,
      kind: row.kind,
      content: row.content,
    }));
    const audio = await db
      .select({ variant: audioGenerations.variant })
      .from(audioGenerations)
      .where(
        and(
          eq(audioGenerations.orderId, order.id),
          eq(audioGenerations.status, 'completed'),
          eq(audioGenerations.selected, true),
          sql`${audioGenerations.productionId} = ${delivery.productionId}`,
        ),
      );
    return { publicOrderId: order.publicId, lyrics, audio };
  });
  app.get('/api/v1/deliveries/:token/files/:variant/download', async (request, reply) => {
    const { token, variant } = request.params as { token: string; variant: string };
    const [delivery] = await db
      .select()
      .from(deliveries)
      .where(
        and(
          eq(deliveries.tokenHash, hashToken(token, env.CUSTOMER_ACCESS_TOKEN_PEPPER)),
          sql`${deliveries.revokedAt} is null`,
        ),
      );
    if (!delivery || (delivery.expiresAt && delivery.expiresAt <= new Date()))
      throw fail('Link de entrega inválido ou expirado.', 404);
    const [order] = await db.select().from(orders).where(eq(orders.id, delivery.orderId));
    if (!order) throw fail('Entrega indisponível.', 404);
    await releasedDeliveryFor(order.id);
    const variantNumber = Number(variant);
    if (!Number.isInteger(variantNumber) || variantNumber < 1)
      throw fail('Arquivo não encontrado', 404);
    const [generation] = await db
      .select({ fileId: audioGenerations.fileId })
      .from(audioGenerations)
      .where(
        and(
          eq(audioGenerations.orderId, delivery.orderId),
          eq(audioGenerations.variant, variantNumber),
          eq(audioGenerations.status, 'completed'),
          eq(audioGenerations.selected, true),
          sql`${audioGenerations.productionId} = ${delivery.productionId}`,
        ),
      );
    if (!generation?.fileId) throw fail('Arquivo não encontrado', 404);
    const [file] = await db
      .select()
      .from(storedFiles)
      .where(and(eq(storedFiles.id, generation.fileId), eq(storedFiles.orderId, delivery.orderId)));
    if (!file) throw fail('Arquivo não encontrado', 404);
    reply
      .type(file.mimeType)
      .header(
        'content-disposition',
        `attachment; filename="musica-da-resenha${file.storageKey.slice(file.storageKey.lastIndexOf('.'))}"`,
      );
    return sendPrivateFile(request, reply, storage, file);
  });
  app.get('/api/v1/deliveries/:token/cover', async (request) => {
    const token = (request.params as { token: string }).token;
    const order = await deliveredOrderFor(token);
    const cover = await latestCover(order.id);
    return {
      available: coverAvailable,
      cover: cover
        ? {
            ...publicCover(cover, false),
            ...(cover.status === 'completed' && cover.coverFileId
              ? { downloadUrl: `/api/v1/deliveries/${token}/cover/download` }
              : {}),
          }
        : null,
    };
  });
  app.get('/api/v1/deliveries/:token/cover/download', async (request, reply) => {
    const token = (request.params as { token: string }).token;
    const order = await deliveredOrderFor(token);
    const result = await pool.query<{ storage_key: string; mime_type: string; size_bytes: number }>(
      `select f.storage_key,f.mime_type,f.size_bytes from album_covers c
       join stored_files f on f.id=c.cover_file_id
       where c.order_id=$1 and c.status='completed'
       order by c.attempt desc limit 1`,
      [order.id],
    );
    const asset = result.rows[0];
    if (!asset) throw fail('Capa ainda indisponível.', 404);
    const extension =
      asset.mime_type === 'image/png' ? 'png' : asset.mime_type === 'image/webp' ? 'webp' : 'jpg';
    reply
      .type(asset.mime_type)
      .header('content-disposition', `attachment; filename="capa-musica-da-resenha.${extension}"`);
    return sendPrivateFile(request, reply, storage, {
      storageKey: asset.storage_key,
      mimeType: asset.mime_type,
      sizeBytes: asset.size_bytes,
    });
  });
  app.post('/api/v1/orders/:publicId/revision-requests', async (request) => {
    const publicId = (request.params as { publicId: string }).publicId;
    if (!(await hasAccess(publicId, request))) throw fail('Acesso privado necessário', 401);
    const { message } = revisionRequestSchema.parse(request.body);
    await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.publicId, publicId))
        .for('update');
      if (!order) throw fail('Pedido não encontrado', 404);
      if (order.status === 'revision_requested') return;
      if (order.status !== 'delivered')
        throw fail('Ajustes ficam disponíveis após a entrega.', 409);
      assertTransition(order.status, 'revision_requested');
      await tx.insert(revisionRequests).values({ orderId: order.id, message });
      await tx
        .update(orders)
        .set({ status: 'revision_requested', updatedAt: new Date() })
        .where(eq(orders.id, order.id));
    });
    return { received: true };
  });
  /**
   * Recovery sem cadastro: um link de entrega válido (que o cliente tem no e-mail)
   * vira sessão limitada de leitura neste navegador (sem story/PII, sem mutações).
   * Só vale para pedido já entregue.
   */
  app.post(
    '/api/v1/deliveries/:token/access',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      deliveryAccessSchema.parse(request.body ?? {});
      const token = (request.params as { token: string }).token;
      const [delivery] = await db
        .select()
        .from(deliveries)
        .where(
          and(
            eq(deliveries.tokenHash, hashToken(token, env.CUSTOMER_ACCESS_TOKEN_PEPPER)),
            sql`${deliveries.revokedAt} is null`,
          ),
        );
      if (!delivery || (delivery.expiresAt && delivery.expiresAt <= new Date()))
        throw fail('Link de entrega inválido ou expirado.', 404);
      const [order] = await db.select().from(orders).where(eq(orders.id, delivery.orderId));
      if (!order || order.status !== 'delivered') throw fail('Entrega indisponível.', 404);
      await setAccessCookie(reply, 'order_view', order.publicId);
      return { publicId: order.publicId };
    },
  );
};
