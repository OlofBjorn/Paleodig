import cors from '@fastify/cors';
import { sql } from 'drizzle-orm';
import Fastify from 'fastify';
import { db } from './db/index.js';
import { digRoutes } from './routes/dig.js';
import { discoveryRoutes } from './routes/discoveries.js';
import { namingRoutes } from './routes/naming.js';
import { playerRoutes } from './routes/players.js';
import { specimenRoutes } from './routes/specimens.js';

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

async function start() {
  await app.register(cors, {
    origin: [
      'https://paleodig-wkvi.vercel.app',
      'http://localhost:5173',
      ...(process.env.CLIENT_ORIGIN ? [process.env.CLIENT_ORIGIN] : []),
    ],
    methods: ['GET', 'HEAD', 'POST', 'DELETE'], // the default only allows GET, HEAD and POST
  });

  await app.register(playerRoutes);
  await app.register(digRoutes);
  await app.register(specimenRoutes);
  await app.register(namingRoutes);
  await app.register(discoveryRoutes);

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