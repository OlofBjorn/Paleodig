import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index'; // adjust if your db export is named differently
import { itemTypes, players, specimens } from '../db/schema';
import { publicItemFields } from '../lib/publicFields';
import { isUuid } from '../lib/uuid';

export async function specimenRoutes(app: FastifyInstance) {
  /** The player's inventory: everything they own, newest first, plus their current balance. */
  app.get<{ Params: { id: string } }>('/api/players/:id/specimens', async (req, reply) => {
    const { id } = req.params;
    if (!isUuid(id)) {
      return reply.code(404).send({ error: 'Player not found.' });
    }

    const [player] = await db
      .select({ id: players.id, name: players.name, balance: players.balance })
      .from(players)
      .where(eq(players.id, id));
    if (!player) {
      return reply.code(404).send({ error: 'Player not found.' });
    }

    const owned = await db
      .select({
        id: specimens.id,
        status: specimens.status,
        foundAt: specimens.foundAt,
        item: publicItemFields,
      })
      .from(specimens)
      .innerJoin(itemTypes, eq(itemTypes.id, specimens.itemTypeId))
      .where(and(eq(specimens.playerId, id), eq(specimens.status, 'owned')))
      .orderBy(desc(specimens.foundAt), desc(specimens.id));

    return { player, specimens: owned };
  });
}