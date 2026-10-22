const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres throws on a malformed uuid, so routes check this before querying. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}