import { and, asc, eq, gte, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index'; // adjust if your db export is named differently
import { digSites, itemTypes, players, siteSpawns, specimens } from '../db/schema';
import { pickWeighted } from '../game/weightedPick';
import { publicItemFields } from '../lib/publicFields';
import { isUuid } from '../lib/uuid';

export async function digRoutes(app: FastifyInstance) {
  /** Lists dig sites so the client can show the cost. */
  app.get('/api/sites', async () => {
    const sites = await db
      .select({
        id: digSites.id,
        name: digSites.name,
        description: digSites.description,
        image: digSites.image,
        digCost: digSites.digCost,
      })
      .from(digSites)
      .orderBy(asc(digSites.id));
    return { sites };
  });

  /**
   * Pay for a dig and receive a random item.
   * Everything happens in one transaction: if anything fails after the money is taken,
   * the whole thing rolls back and the player isn't charged.
   */
  app.post<{ Params: { id: string }; Body: { siteId?: unknown } | undefined }>(
    '/api/players/:id/dig',
    async (req, reply) => {
      const { id } = req.params;
      if (!isUuid(id)) {
        return reply.code(404).send({ error: 'Player not found.' });
      }

      // No siteId means "the first site". Only one exists for now.
      const rawSiteId = req.body?.siteId;
      if (rawSiteId !== undefined && !Number.isInteger(rawSiteId)) {
        return reply.code(400).send({ error: 'siteId must be an integer.' });
      }
      // Postgres integers top out at 2147483647; anything outside that can't be a real site.
      if (typeof rawSiteId === 'number' && (rawSiteId < 1 || rawSiteId > 2147483647)) {
        return reply.code(404).send({ error: 'Dig site not found.' });
      }

      const outcome = await db.transaction(async (tx) => {
        const [site] =
          rawSiteId === undefined
            ? await tx.select().from(digSites).orderBy(asc(digSites.id)).limit(1)
            : await tx
                .select()
                .from(digSites)
                .where(eq(digSites.id, rawSiteId as number))
                .limit(1);
        if (!site) {
          return { ok: false as const, status: 404, error: 'Dig site not found.' };
        }

        const spawns = await tx
          .select({ weight: siteSpawns.weight, item: publicItemFields })
          .from(siteSpawns)
          .innerJoin(itemTypes, eq(itemTypes.id, siteSpawns.itemTypeId))
          .where(eq(siteSpawns.siteId, site.id));
        // A misconfigured site is a server problem: throw, which rolls back and returns a 500.
        if (spawns.length === 0) {
          throw new Error(`Dig site ${site.id} has no spawns configured`);
        }
        const picked = pickWeighted(spawns);

        // Conditional update: the balance check and the deduction are one atomic step,
        // so two quick clicks can't both succeed on the same money.
        const [paid] = await tx
          .update(players)
          .set({ balance: sql`${players.balance} - ${site.digCost}` })
          .where(
            and(
              eq(players.id, id),
              isNull(players.endedAt),
              gte(players.balance, site.digCost),
            ),
          )
          .returning({ balance: players.balance });

        if (!paid) {
          // Work out why, so the client gets a useful answer.
          const [existing] = await tx
            .select({ endedAt: players.endedAt })
            .from(players)
            .where(eq(players.id, id));
          if (!existing) {
            return { ok: false as const, status: 404, error: 'Player not found.' };
          }
          if (existing.endedAt) {
            return { ok: false as const, status: 409, error: 'This game has already ended.' };
          }
          return { ok: false as const, status: 402, error: 'Not enough money to dig here.' };
        }

        const [specimen] = await tx
          .insert(specimens)
          .values({ playerId: id, itemTypeId: picked.item.id, foundSiteId: site.id })
          .returning({ id: specimens.id });

        return {
          ok: true as const,
          specimenId: specimen.id,
          item: picked.item,
          balance: paid.balance,
        };
      });

      if (!outcome.ok) {
        return reply.code(outcome.status).send({ error: outcome.error });
      }
      return { specimenId: outcome.specimenId, item: outcome.item, balance: outcome.balance };
    },
  );
}