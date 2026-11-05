import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index'; // adjust if your db export is named differently
import { animals, genera, itemTypes, players, specimens, taxa } from '../db/schema';
import { scoreGame, type ScoreReport, type ScoringInput } from '../game/scoring';
import { HttpError } from '../lib/httpError';
import { isUuid } from '../lib/uuid';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Gathers one player's whole game and scores it. This is the ONLY place the hidden answers
 * (which animal each fossil really belongs to, and how diagnostic it is) are read for a
 * response, and both routes below only call it once the game is over or being ended.
 */
async function buildReport(tx: Tx, playerId: string, balance: number): Promise<ScoreReport> {
  const specimenRows = await tx
    .select({
      id: specimens.id,
      status: specimens.status,
      taxonId: specimens.taxonId,
      name: itemTypes.name,
      kind: itemTypes.kind,
      animalId: itemTypes.animalId,
      diagnostic: itemTypes.diagnostic,
    })
    .from(specimens)
    .innerJoin(itemTypes, eq(itemTypes.id, specimens.itemTypeId))
    .where(eq(specimens.playerId, playerId));

  const generaRows = await tx.select().from(genera).where(eq(genera.playerId, playerId));

  const taxaRows = await tx
    .select({
      id: taxa.id,
      genusId: taxa.genusId,
      speciesName: taxa.speciesName,
      createdAt: taxa.createdAt,
    })
    .from(taxa)
    .innerJoin(genera, eq(genera.id, taxa.genusId))
    .where(eq(genera.playerId, playerId));

  const animalRows = await tx.select().from(animals);

  const input: ScoringInput = {
    balance,
    specimens: specimenRows.map((r) => ({
      id: r.id,
      status: r.status,
      taxonId: r.taxonId,
      item: { name: r.name, kind: r.kind, animalId: r.animalId, diagnostic: r.diagnostic },
    })),
    taxa: taxaRows,
    genera: generaRows.map((g) => ({
      id: g.id,
      name: g.name,
      createdAt: g.createdAt,
      holotypeSpecimenId: g.holotypeSpecimenId,
    })),
    animals: animalRows,
  };

  return scoreGame(input);
}

export async function endgameRoutes(app: FastifyInstance) {
  /**
   * End the game: freeze it, score it, and return the report.
   *
   * Safe to call more than once. The first call stamps ended_at and final_score; later calls
   * just score the (now frozen) game again and return the same report. The player row is
   * locked first, so a dig or sale arriving at the same moment either finishes before the
   * scoring or is refused with a 409. It can never change the game mid-score.
   */
  app.post<{ Params: { id: string } }>('/api/players/:id/end', async (req, reply) => {
    const { id } = req.params;
    if (!isUuid(id)) {
      return reply.code(404).send({ error: 'Player not found.' });
    }

    try {
      return await db.transaction(async (tx) => {
        const [player] = await tx
          .select({
            id: players.id,
            name: players.name,
            balance: players.balance,
            endedAt: players.endedAt,
            finalScore: players.finalScore,
          })
          .from(players)
          .where(eq(players.id, id))
          .for('update');
        if (!player) throw new HttpError(404, 'Player not found.');

        const report = await buildReport(tx, id, player.balance);

        if (!player.endedAt) {
          await tx
            .update(players)
            .set({ endedAt: new Date(), finalScore: report.score })
            .where(eq(players.id, id));
        }

        return {
          player: {
            id: player.id,
            name: player.name,
            balance: player.balance,
            ended: true,
            finalScore: player.endedAt ? player.finalScore : report.score,
          },
          report,
        };
      });
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.status).send({ error: err.message });
      }
      throw err;
    }
  });

  /**
   * The report for a game that has already ended, so a reload can show the results again.
   * Refused with 409 while the game is still running: until then the hidden answers must
   * never leave the server.
   */
  app.get<{ Params: { id: string } }>('/api/players/:id/report', async (req, reply) => {
    const { id } = req.params;
    if (!isUuid(id)) {
      return reply.code(404).send({ error: 'Player not found.' });
    }

    try {
      return await db.transaction(async (tx) => {
        const [player] = await tx
          .select({
            id: players.id,
            name: players.name,
            balance: players.balance,
            endedAt: players.endedAt,
            finalScore: players.finalScore,
          })
          .from(players)
          .where(eq(players.id, id));
        if (!player) throw new HttpError(404, 'Player not found.');
        if (!player.endedAt) throw new HttpError(409, 'The game has not ended yet.');

        const report = await buildReport(tx, id, player.balance);
        return {
          player: {
            id: player.id,
            name: player.name,
            balance: player.balance,
            ended: true,
            finalScore: player.finalScore,
          },
          report,
        };
      });
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.status).send({ error: err.message });
      }
      throw err;
    }
  });
}