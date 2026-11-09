import { players } from '../db/schema.js';

/** The only player fields the client ever needs. */
export const playerFields = {
  id: players.id,
  name: players.name,
  balance: players.balance,
  endedAt: players.endedAt,
};

/** Turns a selected player row into what the client sees: endedAt becomes a plain `ended` flag. */
export function toPlayer(row: { id: string; name: string; balance: number; endedAt: Date | null }) {
  const { endedAt, ...rest } = row;
  return { ...rest, ended: endedAt !== null };
}