import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { TEST_DATABASE_URL } from './env';

// Recreates the test database from db/schema.sql plus every migration, the same way
// production got its schema. Never touches the database `npm run dev` uses.
export default async function setup() {
  const testUrl = new URL(TEST_DATABASE_URL);
  const host = testUrl.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error('Refusing to run tests: TEST_DATABASE_URL does not point at localhost.');
  }
  const testDb = testUrl.pathname.slice(1);

  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${testDb} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${testDb}`);
  await admin.end();

  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  await client.query(readFileSync('db/schema.sql', 'utf8'));
  await client.end();

  execFileSync(process.execPath, ['scripts/migrate.mjs'], {
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
    },
  });
}
