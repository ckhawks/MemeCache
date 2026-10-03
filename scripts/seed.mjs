#!/usr/bin/env node
//
// Rebuilds the local database and bucket from scratch.
//
//   node scripts/seed.mjs
//
// 1. Drops and recreates the public schema and applies db/schema.sql.
// 2. Migrates up to the version the sample was pulled at, loads the sample, then applies
//    the remaining migrations. A sample pulled before a migration is carried forward by
//    that migration, which also tests it against real data.
// 3. Uploads the sample media to the local S3 bucket (SeaweedFS), creating it if needed.
//
// Without a sample (`npm run db:pull-sample` writes one to db/seed/sample/) it migrates all
// the way and creates two users and nothing else.
//
// Every account's password is "password".
//
// Destructive by design, so it refuses to run unless DATABASE_URL and MC_S3_ENDPOINT both
// point at localhost.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import bcrypt from 'bcrypt';
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sampleDir = join(root, 'db', 'seed', 'sample');
const PASSWORD = 'password';

// Samples pulled before pull-sample.mjs recorded a version were taken at this one.
const UNVERSIONED_SAMPLE_VERSION = '001_indexes_and_case_insensitive_uniques.sql';

// The user table and its password column, by schema generation. The sample never contains
// emails or password hashes, so the seed fills them in.
const USER_TABLES = {
  User: {
    hash: 'passwordHash',
  },
  app_user: {
    hash: 'password_hash',
  },
};

function isLocal(url) {
  const host = new URL(url).hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function migrate(args = []) {
  execFileSync(process.execPath, [join(root, 'scripts', 'migrate.mjs'), ...args], {
    stdio: 'inherit',
    env: process.env,
  });
}

async function main() {
  process.loadEnvFile(join(root, '.env'));

  const databaseUrl = process.env.DATABASE_URL;
  const s3Endpoint = process.env.MC_S3_ENDPOINT;
  if (!databaseUrl || !isLocal(databaseUrl)) {
    throw new Error('Refusing to seed: DATABASE_URL does not point at localhost.');
  }
  if (!s3Endpoint || !isLocal(s3Endpoint)) {
    throw new Error('Refusing to seed: MC_S3_ENDPOINT does not point at localhost.');
  }

  const manifest = existsSync(join(sampleDir, 'manifest.json'))
    ? JSON.parse(readFileSync(join(sampleDir, 'manifest.json'), 'utf8'))
    : null;

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    console.log('Resetting schema ...');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query(readFileSync(join(root, 'db', 'schema.sql'), 'utf8'));
    // schema.sql (a pg_dump) empties search_path for the session.
    await client.query('RESET search_path');

    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    if (manifest) {
      const version = manifest.schemaVersion ?? UNVERSIONED_SAMPLE_VERSION;
      migrate(['--to', version]);
      console.log(`Loading sample pulled ${manifest.pulledAt} at ${version}:`);
      await loadTables(client, manifest.tables, passwordHash);
      migrate();
      await uploadMedia(manifest.media);
    } else {
      migrate();
      console.log('No sample found:');
      await loadTables(client, minimalTables(), passwordHash);
      console.log('Run `npm run db:pull-sample` first to get memes. Seeded users only.');
    }

    console.log(`Done. Log in as any user with password "${PASSWORD}".`);
  } finally {
    await client.end();
  }
}

// Tables load in manifest order, which pull-sample.mjs writes in foreign-key order.
async function loadTables(client, tables, passwordHash) {
  for (const [table, rows] of Object.entries(tables)) {
    const userTable = USER_TABLES[table];
    if (userTable) {
      for (const user of rows) {
        user.email = `${user.username.toLowerCase()}@example.test`;
        user[userTable.hash] = passwordHash;
      }
    }

    if (rows.length > 0) {
      // json_populate_recordset maps keys to columns by name, so the manifest does not
      // need to know the column order. A missing key becomes an explicit null, which
      // skips the column default.
      await client.query(
        `INSERT INTO "${table}" SELECT * FROM json_populate_recordset(null::"${table}", $1)`,
        [JSON.stringify(rows)]
      );
    }

    // Rows keep their original integer ids, so a sequence behind an id column has to be
    // moved past the highest one.
    const { rows: sequences } = await client.query(
      `SELECT pg_get_serial_sequence(format('%I', table_name), 'id') AS seq
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = 'id'
          AND data_type IN ('integer', 'bigint')`,
      [table]
    );
    if (sequences[0]?.seq) {
      await client.query(
        `SELECT setval($1, GREATEST((SELECT max(id) FROM "${table}"), 1))`,
        [sequences[0].seq]
      );
    }

    console.log(`  ${table}: ${rows.length}`);
  }
}

function minimalTables() {
  return {
    app_user: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        username: 'alice',
        role: 'admin',
        created_at: new Date().toISOString(),
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        username: 'bob',
        role: 'user',
        created_at: new Date().toISOString(),
      },
    ],
  };
}

async function uploadMedia(media) {
  const s3 = new S3Client({
    region: 'us-west-1',
    endpoint: process.env.MC_S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MC_AWS_ACCESS_KEY,
      secretAccessKey: process.env.MC_AWS_SECRET_ACCESS_KEY,
    },
  });
  const bucket = process.env.MC_AWS_S3_BUCKET;

  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }

  for (const item of media) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: item.key,
        Body: readFileSync(join(sampleDir, 'media', item.file)),
        ContentType: item.contentType,
      })
    );
  }
  console.log(`  media files: ${media.length} uploaded to ${bucket}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
