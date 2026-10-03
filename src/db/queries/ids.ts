// Postgres rejects a malformed uuid with an error, not an empty result. Ids come from URLs
// and request bodies, so check the shape first and treat a bad one as "not found".
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

// Public meme slugs (migration 004): 7 characters, no 0 O o 1 l I.
const SLUG_PATTERN = /^[2-9A-HJ-NP-Za-km-np-z]{7}$/;

export function isSlug(value: unknown): value is string {
  return typeof value === 'string' && SLUG_PATTERN.test(value);
}
