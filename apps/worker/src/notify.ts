import {
  assertJobLease,
  withJobLease,
  type ClaimedJob,
  type EmailDeliveryMessage,
} from '@resenha/database';
import { workerError } from './ai-call.js';
import { hashToken, stableDeliveryToken } from '@resenha/domain';
import { createEmailProvider, type EmailConfig, type EmailProvider } from '@resenha/providers';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { WorkerConfig } from './config.js';

export const orderContactEmail = async (
  pool: Pool,
  orderId: string,
): Promise<string | undefined> => {
  const result = await pool.query<{ email: string }>(
    'select email from order_contacts where order_id=$1',
    [orderId],
  );
  return result.rows[0]?.email;
};

type EmailIntent = {
  id: string;
  recipient: string;
  provider: EmailConfig['kind'];
  status: string;
  message: EmailDeliveryMessage;
  created_at: Date;
};
/** Commit a stable intent before I/O. Concurrent attempts reuse the provider's idempotency key. */
export const deliveryEmail = async (
  pool: Pool,
  config: WorkerConfig,
  orderId: string,
  recipient: string,
  provider: EmailProvider = createEmailProvider(config.email),
  job?: ClaimedJob,
): Promise<void> => {
  const client = await pool.connect();
  let intent: EmailIntent | undefined;
  let token = '';
  try {
    await client.query('begin');
    const order = await client.query<{ status: string; current_production_id: string | null }>(
      'select status,current_production_id from orders where id=$1 for update',
      [orderId],
    );
    if (job) await assertJobLease(client, job);
    const productionId = order.rows[0]?.current_production_id;
    if (order.rows[0]?.status !== 'delivered' || !productionId)
      throw workerError('JOB_PRECONDITION_FAILED');
    const audio = await client.query(
      "select a.variant from audio_generations a join productions p on p.id=a.production_id where a.production_id=$1 and p.status='completed' and p.provenance='recorded' and a.selected and a.status='completed' and a.file_id is not null and a.duration_ms>=10000",
      [productionId],
    );
    if (![1, 2].every((variant) => audio.rows.some((row) => row.variant === variant)))
      throw workerError('JOB_PRECONDITION_FAILED');
    const sent = await client.query(
      "select id from email_deliveries where order_id=$1 and production_id=$2 and template='music_delivered' and status='sent' limit 1",
      [orderId, productionId],
    );
    if (sent.rowCount) {
      await client.query('commit');
      return;
    }
    intent = (
      await client.query<EmailIntent>(
        "select id,recipient,provider,status,message,created_at from email_deliveries where order_id=$1 and production_id=$2 and template='music_delivered' and message is not null",
        [orderId, productionId],
      )
    ).rows[0];
    const delivery = (
      await client.query<{
        id: string;
        token_hash: string;
        revoked_at: Date | null;
        expires_at: Date | null;
        production_id: string | null;
      }>(
        'select id,token_hash,revoked_at,expires_at,production_id from deliveries where order_id=$1 for update',
        [orderId],
      )
    ).rows[0];
    if (
      delivery &&
      (delivery.revoked_at || (delivery.expires_at && delivery.expires_at <= new Date()))
    )
      throw Object.assign(new Error('Delivery access is revoked or expired'), { terminal: true });
    const deliveryId = intent?.message.deliveryId ?? delivery?.id ?? randomUUID();
    token = stableDeliveryToken(deliveryId, config.tokenPepper);
    const tokenHash = hashToken(token, config.tokenPepper);
    if (delivery && delivery.production_id !== productionId)
      await client.query(
        'update deliveries set production_id=$2,delivered_at=now(),updated_at=now() where id=$1',
        [delivery.id, productionId],
      );
    if (intent) {
      if (!delivery || delivery.id !== deliveryId || delivery.token_hash !== tokenHash)
        throw Object.assign(new Error('Delivery access changed; notification requires review'), {
          terminal: true,
        });
    } else {
      // Never rotate an existing untracked link: its previous send outcome is unknown.
      if (delivery && delivery.token_hash !== tokenHash)
        throw Object.assign(new Error('Legacy delivery notification requires review'), {
          terminal: true,
        });
      if (!delivery)
        await client.query(
          'insert into deliveries(id,order_id,token_hash,production_id,delivered_at) values($1,$2,$3,$4,now())',
          [deliveryId, orderId, tokenHash, productionId],
        );
      const message: EmailDeliveryMessage = {
        deliveryId,
        webUrl: config.webUrl.replace(/\/$/, ''),
        from: config.email.from,
        subject: 'Sua música está pronta',
        textTemplate:
          'Ouça e baixe suas duas versões no link privado:\n{{delivery_link}}\nEste link é privado; não compartilhe publicamente.',
        htmlTemplate:
          '<p>Sua música está pronta! Ouça e baixe suas duas versões.</p><p><a href="{{delivery_link}}">Ouvir minhas músicas</a></p><p>Este link é privado; não compartilhe publicamente.</p>',
      };
      intent = (
        await client.query<EmailIntent>(
          `insert into email_deliveries(order_id,production_id,template,recipient,provider,status,message)
         values($1,$5,'music_delivered',$2,$3,'pending',$4) returning id,recipient,provider,status,message,created_at`,
          [orderId, recipient, provider.kind, JSON.stringify(message), productionId],
        )
      ).rows[0];
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  if (!intent) throw new Error('Email intent was not persisted');
  if (intent.provider !== provider.kind)
    throw new Error('Pending email provider changed; restore its configuration before retry');
  // Resend retains idempotency keys for 24h; an older uncertain send needs operator review.
  if (
    intent.provider === 'resend' &&
    Date.now() - intent.created_at.getTime() >= 23 * 60 * 60 * 1000
  )
    throw workerError('JOB_EMAIL_REVIEW_REQUIRED');
  if (job) await withJobLease(pool, job, async () => undefined);
  const link = `${intent.message.webUrl}/entrega/${token}`;
  const escapedLink = link
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  const result = await provider.send(
    {
      from: intent.message.from,
      to: intent.recipient,
      subject: intent.message.subject,
      text: intent.message.textTemplate.replaceAll('{{delivery_link}}', link),
      html: intent.message.htmlTemplate.replaceAll('{{delivery_link}}', escapedLink),
    },
    `music_delivered:${intent.id}`,
  );
  const markSent = async (client: Pick<Pool, 'query'>) => {
    await client.query(
      "update email_deliveries set status='sent',external_id=$2,updated_at=now() where id=$1",
      [intent.id, result.externalId],
    );
  };
  if (job) await withJobLease(pool, job, markSent);
  else await markSent(pool);
  console.info({ provider: intent.provider }, 'delivery notification recorded');
};
export const processNotificationJob = async (
  pool: Pool,
  job: ClaimedJob,
  config: WorkerConfig,
  provider?: EmailProvider,
): Promise<void> => {
  const recipient = await orderContactEmail(pool, job.orderId);
  if (!recipient) throw workerError('JOB_PRECONDITION_FAILED');
  await deliveryEmail(pool, config, job.orderId, recipient, provider, job);
};
