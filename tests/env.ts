// Runs before every test file, ahead of any import of src/db/db.ts, which reads
// DATABASE_URL when the first query creates its pool.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://memecache:memecache@localhost:5433/memecache_test?sslmode=disable';

process.env.DATABASE_URL = TEST_DATABASE_URL;
