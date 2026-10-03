// Postgres rejects a malformed uuid with an error, not an empty result. Ids come from URLs
// and request bodies, so check the shape first and treat a bad one as "not found".
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}
