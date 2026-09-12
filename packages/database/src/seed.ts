import dotenv from 'dotenv';
import { createDb, adminUsers, products } from './index.js';
import { sql } from 'drizzle-orm';
dotenv.config({ path: new URL('../../../.env', import.meta.url).pathname });
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const { db, pool } = createDb(url);
const songPrice = Number(process.env.SONG_PRICE_CENTS ?? 0);
if (!Number.isSafeInteger(songPrice) || songPrice < 0 || songPrice > 2_147_483_647)
  throw new Error('SONG_PRICE_CENTS must be integer cents between 0 and 2147483647');
await db
  .insert(products)
  .values([{ type: 'custom_song', name: 'Sua música', priceCents: songPrice, active: true }])
  .onConflictDoNothing({ target: products.type });
if (songPrice > 0)
  await db
    .update(products)
    .set({ priceCents: songPrice, updatedAt: new Date() })
    .where(sql`${products.type} = 'custom_song' and ${products.priceCents} = 0`);
if (process.env.ADMIN_EMAIL)
  await db
    .insert(adminUsers)
    .values({ email: process.env.ADMIN_EMAIL })
    .onConflictDoUpdate({
      target: adminUsers.email,
      set: { updatedAt: sql`now()` },
    });
await pool.end();
