import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index'; // adjust if your db export is named differently
import { digSites, genera, itemTypes, players, specimens, taxa } from '../db/schema';
import { HttpError } from '../lib/httpError';
import { publicItemFields } from '../lib/publicFields';
import { isUuid } from '../lib/uuid';

const MAX_INT4 = 2147483647; // specimens.id is a Postgres integer

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

    const rows = await db
      .select({
        id: specimens.id,
        status: specimens.status,
        foundAt: specimens.foundAt,
        item: publicItemFields,
        genus: genera.name,
        species: taxa.speciesName,
        genusHolotypeId: genera.holotypeSpecimenId,
        siteId: digSites.id,
        siteName: digSites.name,
      })
      .from(specimens)
      .innerJoin(itemTypes, eq(itemTypes.id, specimens.itemTypeId))
      .leftJoin(taxa, eq(taxa.id, specimens.taxonId))
      .leftJoin(genera, eq(genera.id, taxa.genusId))
      .leftJoin(digSites, eq(digSites.id, specimens.foundSiteId))
      .where(and(eq(specimens.playerId, id), eq(specimens.status, 'owned')))
      .orderBy(desc(specimens.foundAt), desc(specimens.id));

    // name is the player's own current name for the specimen, or null if unnamed.
    // isHolotype: this specimen is the holotype of the (valid) genus it is currently named in.
    const owned = rows.map(({ genus, species, genusHolotypeId, siteId, siteName, ...rest }) => ({
      ...rest,
      name:
        genus && species ? { genus, species, isHolotype: genusHolotypeId === rest.id } : null,
      site: siteId !== null && siteName !== null ? { id: siteId, name: siteName } : null,
    }));

    return { player, specimens: owned };
  });

  /**
   * Sell a specimen for its item's base value.
   * The row is kept (status 'sold') so the end-game score can count it as lost to science.
   * If the specimen was named, selling clears its name; if it was a genus's holotype, that
   * genus becomes invalid automatically, because validity is derived.
   */
  app.post<{ Params: { id: string; specimenId: string } }>(
    '/api/players/:id/specimens/:specimenId/sell',
    async (req, reply) => {
      const { id } = req.params;
      const specimenId = Number(req.params.specimenId);

      if (!isUuid(id)) {
        return reply.code(404).send({ error: 'Player not found.' });
      }
      if (!Number.isInteger(specimenId) || specimenId < 1 || specimenId > MAX_INT4) {
        return reply.code(404).send({ error: 'Specimen not found.' });
      }

      try {
        const result = await db.transaction(async (tx) => {
          // Claim the specimen. The conditions make this atomic: it only succeeds for the
          // owner, and only while the specimen is still owned, so it can't be sold twice.
          const [sold] = await tx
            .update(specimens)
            .set({ status: 'sold', soldAt: new Date(), taxonId: null })
            .where(
              and(
                eq(specimens.id, specimenId),
                eq(specimens.playerId, id),
                eq(specimens.status, 'owned'),
              ),
            )
            .returning({ itemTypeId: specimens.itemTypeId });

          if (!sold) {
            const [existing] = await tx
              .select({ id: specimens.id })
              .from(specimens)
              .where(and(eq(specimens.id, specimenId), eq(specimens.playerId, id)));
            throw existing
              ? new HttpError(409, 'This specimen has already been sold.')
              : new HttpError(404, 'Specimen not found.');
          }

          const [item] = await tx
            .select({ baseValue: itemTypes.baseValue })
            .from(itemTypes)
            .where(eq(itemTypes.id, sold.itemTypeId));

          // Throwing below rolls back the specimen update too, so a failed payout never
          // leaves a specimen sold without the player being paid.
          const [paid] = await tx
            .update(players)
            .set({ balance: sql`${players.balance} + ${item.baseValue}` })
            .where(and(eq(players.id, id), isNull(players.endedAt)))
            .returning({ balance: players.balance });
          if (!paid) {
            throw new HttpError(409, 'This game has already ended.');
          }

          return { specimenId, earned: item.baseValue, balance: paid.balance };
        });

        return result;
      } catch (err) {
        if (err instanceof HttpError) {
          return reply.code(err.status).send({ error: err.message });
        }
        throw err;
      }
    },
  );
}