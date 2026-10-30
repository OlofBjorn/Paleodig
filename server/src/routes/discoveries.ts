import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index'; // adjust if your db export is named differently
import { digSites, genera, itemTypes, players, specimens, taxa } from '../db/schema';
import { isUuid } from '../lib/uuid';

type SpeciesEntry = {
  id: number;
  name: string;
  specimens: { id: number; itemName: string; siteName: string | null }[];
};

export async function discoveryRoutes(app: FastifyInstance) {
  /**
   * Everything the player has named: genera (oldest first), each with its holotype, whether
   * it is currently valid, and the species and specimens under it.
   *
   * A genus is valid exactly when its holotype is currently named within that genus.
   * Validity is derived here on every read, never stored, so it can't drift out of sync.
   * Only item names are returned, never the hidden animal or diagnostic data.
   */
  app.get<{ Params: { id: string } }>('/api/players/:id/discoveries', async (req, reply) => {
    const { id } = req.params;
    if (!isUuid(id)) {
      return reply.code(404).send({ error: 'Player not found.' });
    }

    const [player] = await db.select({ id: players.id }).from(players).where(eq(players.id, id));
    if (!player) {
      return reply.code(404).send({ error: 'Player not found.' });
    }

    // Every genus the player has ever created, including invalid ones (they keep their name).
    const generaRows = await db
      .select({
        id: genera.id,
        name: genera.name,
        holotypeId: genera.holotypeSpecimenId,
        holotypeStatus: specimens.status,
        holotypeItemName: itemTypes.name,
        holotypeCurrentGenusId: taxa.genusId, // null if the holotype is unnamed or sold
      })
      .from(genera)
      .innerJoin(specimens, eq(specimens.id, genera.holotypeSpecimenId))
      .innerJoin(itemTypes, eq(itemTypes.id, specimens.itemTypeId))
      .leftJoin(taxa, eq(taxa.id, specimens.taxonId))
      .where(eq(genera.playerId, id))
      .orderBy(asc(genera.createdAt), asc(genera.id));

    // Every specimen that currently has a name (sold specimens never do).
    const namedRows = await db
      .select({
        specimenId: specimens.id,
        itemName: itemTypes.name,
        siteName: digSites.name,
        taxonId: taxa.id,
        genusId: taxa.genusId,
        speciesName: taxa.speciesName,
      })
      .from(specimens)
      .innerJoin(itemTypes, eq(itemTypes.id, specimens.itemTypeId))
      .innerJoin(taxa, eq(taxa.id, specimens.taxonId))
      .leftJoin(digSites, eq(digSites.id, specimens.foundSiteId))
      .where(and(eq(specimens.playerId, id), eq(specimens.status, 'owned')))
      .orderBy(asc(taxa.createdAt), asc(taxa.id), asc(specimens.id));

    // genus id -> species id -> species. Species with no specimens left simply don't appear.
    const speciesByGenus = new Map<number, Map<number, SpeciesEntry>>();
    for (const row of namedRows) {
      const bySpecies = speciesByGenus.get(row.genusId) ?? new Map<number, SpeciesEntry>();
      speciesByGenus.set(row.genusId, bySpecies);

      const entry = bySpecies.get(row.taxonId) ?? {
        id: row.taxonId,
        name: row.speciesName,
        specimens: [],
      };
      bySpecies.set(row.taxonId, entry);
      entry.specimens.push({ id: row.specimenId, itemName: row.itemName, siteName: row.siteName });
    }

    const result = generaRows.map((g) => {
      const valid = g.holotypeCurrentGenusId === g.id;
      const sold = g.holotypeStatus === 'sold';

      return {
        id: g.id,
        name: g.name,
        valid,
        // Why it's invalid: the holotype was sold, is unnamed, or now lives in another genus.
        invalidReason: valid
          ? null
          : sold
            ? ('sold' as const)
            : g.holotypeCurrentGenusId === null
              ? ('unnamed' as const)
              : ('moved' as const),
        holotype: { specimenId: g.holotypeId, itemName: g.holotypeItemName, sold },
        species: [...(speciesByGenus.get(g.id)?.values() ?? [])],
      };
    });

    return { genera: result };
  });
}