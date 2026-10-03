#!/usr/bin/env node
//
// Rebuilds the local database and bucket from scratch.
//
//   node scripts/seed.mjs
//
// 1. Drops and recreates the public schema, applies db/schema.sql, runs every migration.
// 2. Loads db/seed/sample/ (from `npm run db:pull-sample`) if it exists. Otherwise creates
//    two users and nothing else.
// 3. Uploads the sample media to the local S3 bucket (SeaweedFS), creating the bucket if needed.
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

// Tables in foreign-key order. Keys match the manifest written by pull-sample.mjs.
const TABLES = [
  'User',
  'Cache',
  'Meme',
  'MemeCache',
  'Tag',
  'MemeTag',
  'MemeTagVote',
  'MemeTranscription',
  'Like',
];

// Tables whose integer id comes from a sequence. Rows are inserted with their original
// ids, so each sequence has to be moved past the highest one.
const SEQUENCED_TABLES = [
  'Like',
  'MemeCache',
  'MemeTranscription',
];

function isLocal(url) {
  const host = new URL(url).hostname;
  return host === 'localhost' || host === '127.0.0.1';
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

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    console.log('Resetting schema ...');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query(readFileSync(join(root, 'db', 'schema.sql'), 'utf8'));
    // schema.sql (a pg_dump) empties search_path for the session.
    await client.query('RESET search_path');

    execFileSync(process.execPath, [join(root, 'scripts', 'migrate.mjs')], {
      stdio: 'inherit',
      env: process.env,
    });

    const manifest = existsSync(join(sampleDir, 'manifest.json'))
      ? JSON.parse(readFileSync(join(sampleDir, 'manifest.json'), 'utf8'))
      : null;

    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tables = manifest ? manifest.tables : minimalTables();

    for (const user of tables.User) {
      user.email = `${user.username.toLowerCase()}@example.test`;
      user.passwordHash = passwordHash;
    }

    console.log(manifest ? `Loading sample pulled ${manifest.pulledAt}:` : 'No sample found:');
    for (const table of TABLES) {
      const rows = tables[table] ?? [];
      if (rows.length > 0) {
        // json_populate_recordset maps keys to columns by name, so the manifest does not
        // need to know the column order.
        await client.query(
          `INSERT INTO "${table}" SELECT * FROM json_populate_recordset(null::"${table}", $1)`,
          [JSON.stringify(rows)]
        );
      }
      console.log(`  ${table}: ${rows.length}`);
    }

    for (const table of SEQUENCED_TABLES) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'),
                       GREATEST((SELECT max(id) FROM "${table}"), 1))`
      );
    }

    if (manifest) {
      await uploadMedia(manifest.media);
    } else {
      console.log('Run `npm run db:pull-sample` first to get memes. Seeded users only.');
    }

    console.log(`Done. Log in as any user with password "${PASSWORD}".`);
  } finally {
    await client.end();
  }
}

function minimalTables() {
  const users = [
    'alice',
    'bob',
  ];
  return {
    User: users.map((username, i) => ({
      id: `00000000-0000-1000-8000-00000000000${i + 1}`,
      username,
      createdAt: new Date().toISOString(),
      role: i === 0 ? 'admin' : 'user',
    })),
    // Upload crashes for a user without a cache (known-bugs.md).
    Cache: users.map((username, i) => ({
      id: `00000000-0000-4000-8000-00000000000${i + 1}`,
      name: `${username}'s cache`,
      // json_populate_recordset passes an explicit null for a missing key, which skips
      // the column default, so NOT NULL columns have to be filled here.
      createdAt: new Date().toISOString(),
      ownerUserId: `00000000-0000-1000-8000-00000000000${i + 1}`,
    })),
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
