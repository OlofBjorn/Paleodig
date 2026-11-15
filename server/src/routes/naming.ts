import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { genera, itemTypes, players, specimens, taxa } from '../db/schema.js';
import { normalizeGenus, normalizeSpecies } from '../game/naming.js';
import { HttpError } from '../lib/httpError.js';
import { isUuid } from '../lib/uuid.js';

const MAX_INT4 = 2147483647; //specimens.id is a Postgres integer

function parseSpecimenId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= MAX_INT4 ? n : null;
}

export async function namingRoutes(app: FastifyInstance) {
  /**
   *Name a specimen "Genus species", or move it to a different name (reclassification).
   *
   *Rules:
   *  - Only owned fossils can be named.
   *  - A brand-new genus name is created with this specimen as its holotype.
   *  - An existing genus name can be used only if that genus is valid (its holotype is
   *    currently named within it), or if this specimen IS that genus's holotype
   *    (which reinstates it).
   *  - A species name that already exists in the genus is not an error: it means "this
   *    specimen belongs to that same species". That is how findings get grouped.
   */
  app.post<{
    Params: { id: string; specimenId: string };
    Body: { genus?: unknown; species?: unknown } | undefined;
  }>('/api/players/:id/specimens/:specimenId/name', async (req, reply) => {
    const { id } = req.params;
    const specimenId = parseSpecimenId(req.params.specimenId);

    if (!isUuid(id)) {
      return reply.code(404).send({ error: 'Player not found.' });
    }
    if (specimenId === null) {
      return reply.code(404).send({ error: 'Specimen not found.' });
    }

    const genusName = normalizeGenus(req.body?.genus);
    const speciesName = normalizeSpecies(req.body?.species);
    if (!genusName) {
      return reply.code(400).send({ error: 'The genus must be 3 to 30 letters (A-Z only).' });
    }
    if (!speciesName) {
      return reply.code(400).send({ error: 'The species must be 3 to 30 letters (A-Z only).' });
    }

    try {
      const result = await db.transaction(async (tx) => {
        //Lock the player's row so naming requests from one player run one at a time.
        //That removes races on creating genera and on the validity checks below.
        const [player] = await tx
          .select({ id: players.id, endedAt: players.endedAt })
          .from(players)
          .where(eq(players.id, id))
          .for('update');
        if (!player) throw new HttpError(404, 'Player not found.');
        if (player.endedAt) throw new HttpError(409, 'This game has already ended.');

        const [specimen] = await tx
          .select({
            id: specimens.id,
            status: specimens.status,
            taxonId: specimens.taxonId,
            kind: itemTypes.kind,
          })
          .from(specimens)
          .innerJoin(itemTypes, eq(itemTypes.id, specimens.itemTypeId))
          .where(and(eq(specimens.id, specimenId), eq(specimens.playerId, id)));
        if (!specimen) throw new HttpError(404, 'Specimen not found.');
        if (specimen.status !== 'owned') throw new HttpError(409, 'Sold specimens cannot be named.');
        if (specimen.kind !== 'fossil') throw new HttpError(422, 'Only fossils can be named.');

        // Remember the genus this specimen is leaving, to report if that invalidates it.
        let previousGenus: { id: number; name: string; holotypeSpecimenId: number } | undefined;
        if (specimen.taxonId !== null) {
          [previousGenus] = await tx
            .select({
              id: genera.id,
              name: genera.name,
              holotypeSpecimenId: genera.holotypeSpecimenId,
            })
            .from(taxa)
            .innerJoin(genera, eq(genera.id, taxa.genusId))
            .where(eq(taxa.id, specimen.taxonId));
        }

        //Genus: create it, or check that this specimen is allowed to use the existing one.
        const [existingGenus] = await tx
          .select()
          .from(genera)
          .where(and(eq(genera.playerId, id), eq(genera.name, genusName)));

        let genus = existingGenus;
        let genusCreated = false;
        if (!genus) {
          const [created] = await tx
            .insert(genera)
            .values({ playerId: id, name: genusName, holotypeSpecimenId: specimen.id })
            .returning();
          genus = created;
          genusCreated = true;
        } else if (genus.holotypeSpecimenId !== specimen.id) {
          //Not the holotype, so the genus must currently be valid: its holotype has to be
          //named within this very genus.
          const [holotype] = await tx
            .select({ status: specimens.status, genusId: taxa.genusId })
            .from(specimens)
            .leftJoin(taxa, eq(taxa.id, specimens.taxonId))
            .where(eq(specimens.id, genus.holotypeSpecimenId));

          if (holotype?.genusId !== genus.id) {
            throw new HttpError(
              409,
              holotype?.status === 'sold'
                ? `The genus name ${genusName} can't be reused: its holotype was sold.`
                : `The genus name ${genusName} belongs to an invalid genus. Name its holotype ${genusName} again to reinstate it first.`,
            );
          }
        }

        //Species: reuse the existing one in this genus (grouping), or create it.
        const [existingTaxon] = await tx
          .select()
          .from(taxa)
          .where(and(eq(taxa.genusId, genus.id), eq(taxa.speciesName, speciesName)));

        let taxon = existingTaxon;
        let taxonCreated = false;
        if (!taxon) {
          const [created] = await tx
            .insert(taxa)
            .values({ genusId: genus.id, speciesName })
            .returning();
          taxon = created;
          taxonCreated = true;
        }

        await tx.update(specimens).set({ taxonId: taxon.id }).where(eq(specimens.id, specimen.id));

        // If this specimen was the holotype of the genus it just left, that genus is now invalid.
        const invalidatedGenus =
          previousGenus &&
          previousGenus.holotypeSpecimenId === specimen.id &&
          previousGenus.id !== genus.id
            ? previousGenus.name
            : null;

        return {
          specimenId: specimen.id,
          genus: genus.name,
          species: taxon.speciesName,
          genusCreated,
          taxonCreated,
          invalidatedGenus,
        };
      });

      return result;
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.status).send({ error: err.message });
      }
      throw err;
    }
  });

  /**Remove a specimen's name. If it was a genus's holotype, that genus becomes invalid. */
  app.delete<{ Params: { id: string; specimenId: string } }>(
    '/api/players/:id/specimens/:specimenId/name',
    async (req, reply) => {
      const { id } = req.params;
      const specimenId = parseSpecimenId(req.params.specimenId);

      if (!isUuid(id)) {
        return reply.code(404).send({ error: 'Player not found.' });
      }
      if (specimenId === null) {
        return reply.code(404).send({ error: 'Specimen not found.' });
      }

      try {
        const result = await db.transaction(async (tx) => {
          //Same lock and check as naming: a finished game is frozen.
          const [player] = await tx
            .select({ endedAt: players.endedAt })
            .from(players)
            .where(eq(players.id, id))
            .for('update');
          if (!player) throw new HttpError(404, 'Player not found.');
          if (player.endedAt) throw new HttpError(409, 'This game has already ended.');

          const [specimen] = await tx
            .select({ id: specimens.id, status: specimens.status, taxonId: specimens.taxonId })
            .from(specimens)
            .where(and(eq(specimens.id, specimenId), eq(specimens.playerId, id)));
          if (!specimen) throw new HttpError(404, 'Specimen not found.');
          if (specimen.status !== 'owned') {
            throw new HttpError(409, 'Sold specimens cannot be changed.');
          }

          let invalidatedGenus: string | null = null;
          if (specimen.taxonId !== null) {
            const [previous] = await tx
              .select({ name: genera.name, holotypeSpecimenId: genera.holotypeSpecimenId })
              .from(taxa)
              .innerJoin(genera, eq(genera.id, taxa.genusId))
              .where(eq(taxa.id, specimen.taxonId));
            if (previous && previous.holotypeSpecimenId === specimen.id) {
              invalidatedGenus = previous.name;
            }
          }

          await tx.update(specimens).set({ taxonId: null }).where(eq(specimens.id, specimen.id));
          return { specimenId: specimen.id, invalidatedGenus };
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