#!/usr/bin/env node
//
// Applies db/migrations/*.sql in filename order, once each, recording what ran in a
// _migration table. Deliberately small -- this project does not need a migration
// framework, it needs migrations to exist at all.
//
//   node scripts/migrate.mjs           apply pending migrations
//   node scripts/migrate.mjs --status  list applied and pending, change nothing
//   node scripts/migrate.mjs --dry-run print the SQL that would run, change nothing
//
// Reads DATABASE_URL from the environment, falling back to .env. Neon's -pooler host is
// rewritten to the direct endpoint: DDL in a transaction does not survive PgBouncer in
// transaction pooling mode.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'db', 'migrations');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const envPath = join(root, '.env');
  if (!existsSync(envPath)) {
    throw new Error('No DATABASE_URL in the environment and no .env file found.');
  }

  const line = readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('DATABASE_URL='));

  if (!line) {
    throw new Error('No DATABASE_URL in the environment or in .env.');
  }

  return line.slice('DATABASE_URL='.length).trim().replace(/^['"]|['"]$/g, '');
}

function directEndpoint(url) {
  // Neon's pooled endpoint runs PgBouncer in transaction mode, which cannot hold DDL
  // inside a transaction across statements. Always migrate against the direct host.
  return url.includes('-pooler') ? url.replace('-pooler', '') : url;
}

function migrationFiles() {
  if (!existsSync(migrationsDir)) {
    return [];
  }
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function main() {
  const mode = process.argv[2];
  const url = directEndpoint(loadDatabaseUrl());
  const client = new pg.Client({
    connectionString: url,
    // Neon and most managed providers require TLS but present a chain node does not
    // ship a root for. The connection string already carries sslmode=require.
    ssl: url.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_migration" (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query('SELECT id FROM "_migration"');
    const applied = new Set(rows.map((r) => r.id));
    const all = migrationFiles();
    const pending = all.filter((f) => !applied.has(f));

    if (mode === '--status') {
      for (const f of all) {
        console.log(`${applied.has(f) ? 'applied' : 'pending'}  ${f}`);
      }
      if (all.length === 0) {
        console.log('No migrations found in db/migrations.');
      }
      return;
    }

    if (pending.length === 0) {
      console.log('Nothing to apply. Database is up to date.');
      return;
    }

    for (const file of pending) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');

      if (mode === '--dry-run') {
        console.log(`\n--- ${file} ---\n${sql}`);
        continue;
      }

      process.stdout.write(`applying ${file} ... `);
      // Each migration is one transaction: it applies completely or not at all, and the
      // bookkeeping row commits with it so a crash cannot record a migration that failed.
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO "_migration" (id) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log('ok');
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('FAILED');
        throw err;
      }
    }

    if (mode !== '--dry-run') {
      console.log(`Applied ${pending.length} migration(s).`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
