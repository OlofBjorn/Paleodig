const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const PLAYER_KEY = 'paleodig.playerId';

export type ItemKind = 'fossil' | 'rock' | 'gem';
export type ItemSize = 'small' | 'medium' | 'large';

export interface Player {
  id: string;
  name: string;
  balance: number;
}

/** What the server sends after a dig. Never includes the hidden animal or diagnostic data. */
export interface DugItem {
  id: number;
  kind: ItemKind;
  name: string;
  description: string;
  image: string;
  size: ItemSize;
  baseValue: number;
}

/* ----------------------------- session storage ---------------------------- */

// localStorage can throw (private mode, blocked storage), so never let it crash the game.
export function getStoredPlayerId(): string | null {
  try {
    return localStorage.getItem(PLAYER_KEY);
  } catch {
    return null;
  }
}

export function storePlayerId(id: string): void {
  try {
    localStorage.setItem(PLAYER_KEY, id);
  } catch {
    // Without storage the session lasts until the page is closed.
  }
}

export function clearStoredPlayerId(): void {
  try {
    localStorage.removeItem(PLAYER_KEY);
  } catch {
    // ignore
  }
}

/* --------------------------------- players -------------------------------- */

export async function createPlayer(name: string): Promise<Player> {
  const res = await fetch(`${API_URL}/api/players`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { player: Player };
  return data.player;
}

/** Returns null if the server doesn't know this player; throws on any other failure. */
export async function fetchPlayer(id: string): Promise<Player | null> {
  const res = await fetch(`${API_URL}/api/players/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { player: Player };
  return data.player;
}

/* ----------------------------------- dig ---------------------------------- */

export async function dig(): Promise<DugItem> {
  const res = await fetch(`${API_URL}/api/dig`, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { item: DugItem };
  return data.item;
}