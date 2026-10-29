const API_URL =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.PROD ? 'https://paleodig.vercel.app' : 'http://localhost:3000');
const PLAYER_KEY = 'paleodig.playerId';

export type ItemKind = 'fossil' | 'rock' | 'gem';
export type ItemSize = 'small' | 'medium' | 'large';

export interface Player {
  id: string;
  name: string;
  balance: number;
}

export interface DigSite {
  id: number;
  name: string;
  description: string;
  digCost: number;
}

/** What the server sends about an item. Never includes the hidden animal or diagnostic data. */
export interface DugItem {
  id: number;
  kind: ItemKind;
  name: string;
  description: string;
  image: string;
  size: ItemSize;
  baseValue: number;
}

export interface DigResult {
  specimenId: number;
  item: DugItem;
  balance: number;
}

/* ------------------------------- http helper ------------------------------ */

/** An error response from the server, carrying the HTTP status so scenes can react to it. */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
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
  const data = await request<{ player: Player }>('/api/players', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return data.player;
}

/** Returns null if the server doesn't know this player; throws on any other failure. */
export async function fetchPlayer(id: string): Promise<Player | null> {
  try {
    const data = await request<{ player: Player }>(`/api/players/${encodeURIComponent(id)}`);
    return data.player;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/* ------------------------------- sites & dig ------------------------------ */

export async function fetchSites(): Promise<DigSite[]> {
  const data = await request<{ sites: DigSite[] }>('/api/sites');
  return data.sites;
}

export function dig(playerId: string): Promise<DigResult> {
  return request<DigResult>(`/api/players/${encodeURIComponent(playerId)}/dig`, {
    method: 'POST',
  });
}

/* -------------------------------- inventory ------------------------------- */

/** The player's own current name for a specimen. isHolotype: it is the holotype of that genus. */
export interface SpecimenName {
  genus: string;
  species: string;
  isHolotype: boolean;
}

export interface Specimen {
  id: number;
  status: 'owned' | 'sold';
  foundAt: string;
  item: DugItem;
  name: SpecimenName | null;
}

export function fetchInventory(playerId: string): Promise<{ player: Player; specimens: Specimen[] }> {
  return request(`/api/players/${encodeURIComponent(playerId)}/specimens`);
}

/** Item images are static files served by the client from public/images/items/. */
export function itemImageUrl(image: string): string {
  return `${import.meta.env.BASE_URL}images/items/${encodeURIComponent(image)}`;
}

export interface SellResult {
  specimenId: number;
  earned: number;
  balance: number;
}

export function sellSpecimen(playerId: string, specimenId: number): Promise<SellResult> {
  return request(
    `/api/players/${encodeURIComponent(playerId)}/specimens/${specimenId}/sell`,
    { method: 'POST' },
  );
}

/* --------------------------------- naming --------------------------------- */

export interface NameResult {
  specimenId: number;
  genus: string;
  species: string;
  genusCreated: boolean;
  taxonCreated: boolean;
  invalidatedGenus: string | null;
}

export function nameSpecimen(
  playerId: string,
  specimenId: number,
  genus: string,
  species: string,
): Promise<NameResult> {
  return request(`/api/players/${encodeURIComponent(playerId)}/specimens/${specimenId}/name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ genus, species }),
  });
}

export function unnameSpecimen(
  playerId: string,
  specimenId: number,
): Promise<{ specimenId: number; invalidatedGenus: string | null }> {
  return request(`/api/players/${encodeURIComponent(playerId)}/specimens/${specimenId}/name`, {
    method: 'DELETE',
  });
}

/* ------------------------------- discoveries ------------------------------ */

export interface DiscoveredSpecies {
  id: number;
  name: string;
  specimens: { id: number; itemName: string }[];
}

export interface DiscoveredGenus {
  id: number;
  name: string;
  valid: boolean;
  /** Why an invalid genus is invalid. */
  invalidReason: 'sold' | 'unnamed' | 'moved' | null;
  holotype: { specimenId: number; itemName: string; sold: boolean };
  species: DiscoveredSpecies[];
}

export interface Discoveries {
  genera: DiscoveredGenus[];
}

export function fetchDiscoveries(playerId: string): Promise<Discoveries> {
  return request(`/api/players/${encodeURIComponent(playerId)}/discoveries`);
}