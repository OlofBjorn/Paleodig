import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index'; // adjust if your db export is named differently
import { players } from '../db/schema';
import { playerFields, toPlayer } from '../lib/player';
import { isUuid } from '../lib/uuid';

const MAX_NAME_LENGTH = 40;

export async function playerRoutes(app: FastifyInstance) {
  /** Start a new game session. The returned id is what the client keeps in localStorage. */
  app.post<{ Body: { name?: unknown } }>('/api/players', async (req, reply) => {
    const raw = req.body?.name;
    const name = typeof raw === 'string' ? raw.trim() : '';
    // Array.from counts characters, matching Postgres char_length
    const length = Array.from(name).length;

    if (length < 1 || length > MAX_NAME_LENGTH) {
      return reply
        .code(400)
        .send({ error: `Name must be between 1 and ${MAX_NAME_LENGTH} characters.` });
    }

    const [player] = await db.insert(players).values({ name }).returning(playerFields);
    return reply.code(201).send({ player: toPlayer(player) });
  });

  /** Lets the client check that a stored id still exists, and refresh name and balance. */
  app.get<{ Params: { id: string } }>('/api/players/:id', async (req, reply) => {
    const { id } = req.params;

    // Postgres throws on a malformed uuid, so reject those as "not found" up front.
    if (!isUuid(id)) {
      return reply.code(404).send({ error: 'Player not found.' });
    }

    const [player] = await db.select(playerFields).from(players).where(eq(players.id, id));
    if (!player) {
      return reply.code(404).send({ error: 'Player not found.' });
    }
    return { player: toPlayer(player) };
  });
}