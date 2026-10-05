// Runs before every test file, ahead of any import of src/db/db.ts, which reads
// DATABASE_URL when the first query creates its pool.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://memecache:memecache@localhost:5433/memecache_test?sslmode=disable';

process.env.DATABASE_URL = TEST_DATABASE_URL;

// src/auth/lib.ts signs tokens with this, read when the module loads. Tests never see the
// real one.
process.env.JWT_ACCESS_SECRET = 'test-only-secret-not-used-anywhere-else';
