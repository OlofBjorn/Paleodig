import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { sql } from 'drizzle-orm';
import { db } from './db/index.js';

const app = Fastify({ logger: true });
await app.register(cors, { origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' });

app.get('/health', async () => ({ status: 'ok' }));

app.get('/api/test', async () => {
  const result = await db.execute(sql`select * from "animals"`);
  return result.rows;
});

await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });