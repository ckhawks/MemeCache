import { Pool } from 'pg';

// The whole data layer. Every query in the app goes through db().
//
// Pages and routes do not call this directly. They call the typed functions in
// src/db/queries/, which are the only place SQL lives.
//
// int8 (COUNT, SUM) comes back from node-postgres as a string. The queries cast counts to
// int (`count(*)::int`) so they arrive as numbers.

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

  const pool = new Pool({
    connectionString,
    ssl: wantsSsl ? { rejectUnauthorized: false } : false,
    // Deliberately small. On a long-running server this is plenty for the traffic this
    // app sees, and it keeps headroom on a Postgres shared with several other projects.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // An idle client erroring (server restart, network blip) emits on the pool. Without a
  // listener that is an unhandled 'error' event, which takes the whole process down.
  // Attached here, once per pool: the module body re-runs on every dev hot reload while
  // the pool is reused, which used to stack a new listener each time.
  pool.on('error', (err) => {
    console.error('Unexpected error on idle database client:', err);
  });

  return pool;
}

// One pool for the process. Cached on globalThis because Next's dev server re-evaluates
// modules on every hot reload, and a fresh Pool per reload leaks connections until the
// server refuses new ones.
const pool = global.__memecachePool ?? createPool();

if (process.env.NODE_ENV !== 'production') {
  global.__memecachePool = pool;
}

export async function db<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query(query, params);
  return result.rows as T[];
}
