import { eq } from 'drizzle-orm';
import { db } from './index'; // adjust if your db export is named differently
import { genera, specimens, taxa } from './schema';

/**
 * A genus is valid exactly when its holotype specimen currently belongs
 * to a species inside that same genus. Derived on read, so it can never
 * drift out of sync when the player reclassifies or sells specimens.
 */
export async function getGeneraWithValidity(playerId: string) {
  const rows = await db
    .select({
      id: genera.id,
      name: genera.name,
      createdAt: genera.createdAt,
      holotypeSpecimenId: genera.holotypeSpecimenId,
      holotypeCurrentGenusId: taxa.genusId, // null if the holotype is unnamed or sold
    })
    .from(genera)
    .innerJoin(specimens, eq(specimens.id, genera.holotypeSpecimenId))
    .leftJoin(taxa, eq(taxa.id, specimens.taxonId))
    .where(eq(genera.playerId, playerId));

  return rows.map(({ holotypeCurrentGenusId, ...g }) => ({
    ...g,
    valid: holotypeCurrentGenusId === g.id,
  }));
}