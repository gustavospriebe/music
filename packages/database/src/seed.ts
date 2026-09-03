import dotenv from 'dotenv';
import { createDb, adminUsers, products } from './index.js';
import { sql } from 'drizzle-orm';
dotenv.config({ path: new URL('../../../.env', import.meta.url).pathname });
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const { db, pool } = createDb(url);
await db
  .insert(products)
  .values([
    { type: 'friend_roast', name: 'Música da Resenha', priceCents: 4990 },
    { type: 'team_anthem', name: 'Hino da Pelada', priceCents: 4990 },
    { type: 'emotional_tribute', name: 'Sua História em Música', priceCents: 4990 },
  ])
  .onConflictDoUpdate({
    target: products.type,
    set: { priceCents: sql`excluded.price_cents`, updatedAt: sql`now()` },
  });
if (process.env.ADMIN_EMAIL)
  await db
    .insert(adminUsers)
    .values({ email: process.env.ADMIN_EMAIL, passwordHash: 'env-managed' })
    .onConflictDoUpdate({
      target: adminUsers.email,
      set: { updatedAt: sql`now()` },
    });
await pool.end();
