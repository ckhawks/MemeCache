import { Pool } from 'pg';

// The whole data layer. Every query in the app goes through db().
//
// Was @neondatabase/serverless, whose neon() HTTP driver only talks to Neon. This uses the
// standard wire protocol, so it works against Neon today and against self-hosted Postgres
// after the move, with no further code change.
//
// int8 (COUNT, SUM) is left as a string rather than parsed to a number. That is what both
// node-postgres and the Neon driver do by default, and changing it here would silently
// alter every likeCount and tag score in the app. See the note in db/MIGRATION.md.

declare global {
  // eslint-disable-next-line no-var
  var __memecachePool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set.');
  }

  // Managed providers require TLS but present chains Node has no root for. Self-hosted
  // Postgres over localhost does not want TLS at all.
  const wantsSsl = !/sslmode=disable/.test(connectionString);

  return new Pool({
    connectionString,
    ssl: wantsSsl ? { rejectUnauthorized: false } : false,
    // Deliberately small. On a long-running server this is plenty for the traffic this
    // app sees, and it keeps headroom on a Postgres shared with several other projects.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

// One pool for the process. Cached on globalThis because Next's dev server re-evaluates
// modules on every hot reload, and a fresh Pool per reload leaks connections until the
// server refuses new ones.
const pool = global.__memecachePool ?? createPool();

if (process.env.NODE_ENV !== 'production') {
  global.__memecachePool = pool;
}

// An idle client erroring (server restart, network blip) emits on the pool. Without a
// listener that is an unhandled 'error' event, which takes the whole process down.
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err);
});

export async function db(query: string, params: any[] = []) {
  const result = await pool.query(query, params);
  // Callers expect the row array directly, as the Neon driver returned.
  return result.rows;
}
