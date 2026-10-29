const NAME_RE = /^[A-Za-z]{3,30}$/;

/**
 * "  toothosaurus " -> "Toothosaurus". Returns null if it isn't a valid genus name
 * (3 to 30 plain letters, no spaces, digits or accents).
 */
export function normalizeGenus(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!NAME_RE.test(trimmed)) return null;
  return trimmed[0].toUpperCase() + trimmed.slice(1).toLowerCase();
}

/** "REX" -> "rex". Returns null if it isn't a valid species epithet (same rules as genus). */
export function normalizeSpecies(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!NAME_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}