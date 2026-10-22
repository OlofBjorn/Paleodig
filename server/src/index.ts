import cors from '@fastify/cors';
import { sql } from 'drizzle-orm';
import Fastify from 'fastify';
import { db } from './db/index'; // adjust if your db export is named differently
import { itemTypes } from './db/schema';
import { playerRoutes } from './routes/players';

const app = Fastify({ logger: true });

/** Confirms the server is up and can reach Postgres. Also useful for the deploy host's health check. */
app.get('/api/health', async (_req, reply) => {
  try {
    await db.execute(sql`select 1`);
    return { status: 'ok', db: 'up' };
  } catch (err) {
    app.log.error(err);
    return reply.code(503).send({ status: 'error', db: 'down' });
  }
});

/**
 * TEMPORARY Sprint 1 endpoint: returns a random item from the catalog.
 * Sprint 2 replaces this with the weighted dig logic (site_spawns), a cost
 * deducted server-side, and a real specimen row for the player.
 *
 * Note the explicit column list: animalId and diagnostic are the hidden
 * answers and must never be sent to the client.
 */
app.post('/api/dig', async (_req, reply) => {
  const [item] = await db
    .select({
      id: itemTypes.id,
      kind: itemTypes.kind,
      name: itemTypes.name,
      description: itemTypes.description,
      image: itemTypes.image,
      size: itemTypes.size,
      baseValue: itemTypes.baseValue,
    })
    .from(itemTypes)
    .orderBy(sql`random()`)
    .limit(1);

  if (!item) {
    return reply.code(404).send({ error: 'No items found. Did you run the seed?' });
  }
  return { item };
});

async function start() {
  await app.register(cors, {
    origin: [
      'https://paleodig-wkvi.vercel.app',
      'http://localhost:5173',
      ...(process.env.CLIENT_ORIGIN ? [process.env.CLIENT_ORIGIN] : []),
    ],
  });

  await app.register(playerRoutes);

  const port = Number(process.env.PORT ?? 3000);
  try {
    // 0.0.0.0 so the server is reachable inside a container or on a deploy host
    await app.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();