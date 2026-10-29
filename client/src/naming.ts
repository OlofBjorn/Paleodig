// Mirrors server/src/game/naming.ts so the dialog can preview names as the player types.
// The server is still the authority: it normalises and validates again.

const NAME_RE = /^[A-Za-z]{3,30}$/;

/** "toothosaurus" -> "Toothosaurus", or null if it isn't 3 to 30 plain letters. */
export function normalizeGenus(raw: string): string | null {
  const trimmed = raw.trim();
  if (!NAME_RE.test(trimmed)) return null;
  return trimmed[0].toUpperCase() + trimmed.slice(1).toLowerCase();
}

/** "REX" -> "rex", or null if it isn't 3 to 30 plain letters. */
export function normalizeSpecies(raw: string): string | null {
  const trimmed = raw.trim();
  if (!NAME_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}