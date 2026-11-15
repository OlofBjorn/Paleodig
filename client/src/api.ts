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
  /**True once the game has been ended and scored. */
  ended: boolean;
}

export interface DigSite {
  id: number;
  name: string;
  description: string;
  image: string;
  digCost: number;
}

/**What the server sends about an item. Never includes the hidden animal or diagnostic data. */
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

/**An error response from the server, carrying the HTTP status so scenes can react to it. */
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

//localStorage can throw (private mode, blocked storage), so never let it crash the game.
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
    //Without storage the session lasts until the page is closed.
  }
}

export function clearStoredPlayerId(): void {
  try {
    localStorage.removeItem(PLAYER_KEY);
  } catch {
    //ignore
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

/**Returns null if the server doesn't know this player; throws on any other failure. */
export async function fetchPlayer(id: string): Promise<Player | null> {
  try {
    const data = await request<{ player: Player }>(`/api/players/${encodeURIComponent(id)}`);
    return data.player;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/*------------------------------- sites & dig ------------------------------ */

export async function fetchSites(): Promise<DigSite[]> {
  const data = await request<{ sites: DigSite[] }>('/api/sites');
  return data.sites;
}

export function dig(playerId: string, siteId: number): Promise<DigResult> {
  return request<DigResult>(`/api/players/${encodeURIComponent(playerId)}/dig`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId }),
  });
}

/**Dig site backgrounds are static files served by the client from public/images/sites/. */
export function siteImageUrl(image: string): string {
  return `${import.meta.env.BASE_URL}images/sites/${encodeURIComponent(image)}`;
}

/* -------------------------------- inventory ------------------------------- */

/**The player's own current name for a specimen. isHolotype: it is the holotype of that genus. */
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
  /** Where it was dug up; null for finds made before sites were tracked. */
  site: { id: number; name: string } | null;
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

/*--------------------------------- naming --------------------------------- */

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
  specimens: { id: number; itemName: string; siteName: string | null }[];
}

export interface DiscoveredGenus {
  id: number;
  name: string;
  valid: boolean;
  //Why an invalid genus is invalid.
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

/* -------------------------------- end game -------------------------------- */

// These mirror the report built by the server's scoring service.

export type Tier = 'high' | 'medium' | 'low';

export interface ReportAnimal {
  id: number;
  genus: string;
  species: string;
}

export interface NameRef {
  taxonId: number;
  genus: string;
  species: string;
}

export interface SpeciesResult extends NameRef {
  genusId: number;
  genusValid: boolean;
  verdict: 'correct' | 'dubious' | 'wrong_merge';
  hasDiagnostic: boolean;
  specimens: {
    id: number;
    itemName: string;
    diagnostic: Tier;
    animal: ReportAnimal;
    credit: number;
  }[];
  animals: ReportAnimal[];
  synonymOf: (NameRef & { sameGenus: boolean }) | null;
  points: number;
}

export interface SynonymResult {
  junior: NameRef;
  senior: NameRef;
  animal: ReportAnimal;
  sameGenus: boolean;
}

export interface GenusResult {
  genusId: number;
  name: string;
  /**valid; dubious (its holotype species couldn't be verified); junior synonym; or invalid. */
  status: 'valid' | 'dubious' | 'synonym' | 'invalid';
  points: number;
  /**The species the holotype is named in: the one the genus stands or falls on. */
  holotypeTaxonId: number | null;
}

export interface LostFossil {
  specimenId: number;
  itemName: string;
  diagnostic: Tier;
  animal: ReportAnimal;
  penalty: number;
}

export interface ScoreReport {
  score: number;
  money: number;
  breakdown: {
    specimenCredit: number;
    speciesPoints: number;
    genusPoints: number;
    moneyPoints: number;
    soldPenalty: number;
    wrongMergePenalty: number;
    duplicatePenalty: number;
  };
  species: SpeciesResult[];
  genera: GenusResult[];
  synonyms: SynonymResult[];
  lostFossils: LostFossil[];
  unnamedFossils: { specimenId: number; itemName: string; animal: ReportAnimal }[];
}

export interface EndResult {
  player: { id: string; name: string; balance: number; ended: boolean; finalScore: number | null };
  report: ScoreReport;
}

/**Ends and scores the game. Safe to call again: an ended game returns the same report. */
export function endGame(playerId: string): Promise<EndResult> {
  return request(`/api/players/${encodeURIComponent(playerId)}/end`, { method: 'POST' });
}

/**The report for a game that has already ended. The server refuses it while a game is running. */
export function fetchReport(playerId: string): Promise<EndResult> {
  return request(`/api/players/${encodeURIComponent(playerId)}/report`);
}

/**True when the server rejected a request because the game is over. */
export function isGameEnded(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && /already ended/i.test(err.message);
}