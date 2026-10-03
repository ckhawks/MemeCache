#!/usr/bin/env node
//
// Copies a small, real sample of production into db/seed/sample/ for `npm run db:seed`.
//
//   node scripts/pull-sample.mjs
//
// Read-only against production. This file runs twice: locally it pipes itself over SSH to
// the Dallas box and runs there with --remote, where the production .env already lives, so
// production credentials never need to exist on a dev machine. The remote half prints one
// JSON document to stdout; the local half writes it to disk.
//
// Emails and password hashes are never selected, so they never leave the box. The seed
// script fills in placeholders.
//
// The sample is gitignored. It holds real memes and real usernames, and the repo is public.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SSH_HOST = 'dallas';
const REMOTE_APP_DIR = '/root/memecache';

// How many memes, and how they are picked. Most are the best-documented memes (tagged,
// transcribed, liked), so the app looks like it does in production. A few untouched ones
// keep the empty states and a future "needs work" queue testable.
const DOCUMENTED_COUNT = 24;
const UNTOUCHED_COUNT = 6;
const MAX_VIDEOS = 3;
const MAX_GIFS = 3;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_BYTES = 6 * 1024 * 1024;

// The avatar route falls back to this key for users without one.
const DEFAULT_AVATAR_KEY = 'avatars/images (1).png';

if (process.argv.includes('--remote')) {
  await remote();
} else {
  await local();
}

async function local() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const sampleDir = join(root, 'db', 'seed', 'sample');
  const self = readFileSync(fileURLToPath(import.meta.url));

  console.log(`Pulling a sample from ${SSH_HOST} (read-only) ...`);

  const output = await new Promise((resolve, reject) => {
    const child = spawn(
      'ssh',
      [
        '-o',
        'BatchMode=yes',
        SSH_HOST,
        `cd ${REMOTE_APP_DIR} && node --input-type=module - --remote`,
      ],
      { stdio: ['pipe', 'pipe', 'inherit'] }
    );
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ssh exited with code ${code}`));
        return;
      }
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    child.stdin.end(self);
  });

  const sample = JSON.parse(output);

  rmSync(sampleDir, { recursive: true, force: true });
  mkdirSync(join(sampleDir, 'media'), { recursive: true });

  const media = [];
  for (const item of sample.media) {
    // Keys can contain slashes and spaces ("avatars/images (1).png").
    const file = encodeURIComponent(item.key);
    writeFileSync(join(sampleDir, 'media', file), Buffer.from(item.base64, 'base64'));
    media.push({
      key: item.key,
      file,
      contentType: item.contentType,
    });
  }

  const manifest = {
    pulledAt: sample.pulledAt,
    tables: sample.tables,
    media,
  };
  writeFileSync(join(sampleDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  for (const [table, rows] of Object.entries(sample.tables)) {
    console.log(`  ${table}: ${rows.length}`);
  }
  console.log(`  media files: ${media.length}`);
  console.log(`Wrote ${sampleDir}`);
}

async function remote() {
  const { default: pg } = await import('pg');
  const { S3Client, HeadObjectCommand, GetObjectCommand } = await import('@aws-sdk/client-s3');

  process.loadEnvFile('.env');

  // Keep "timestamp without time zone" as the literal string. Parsing it to a Date applies
  // the box's local zone, and writing that back as ISO would shift every timestamp.
  pg.types.setTypeParser(1114, (value) => value);

  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const s3 = new S3Client({
    region: 'us-west-1',
    credentials: {
      accessKeyId: process.env.MC_AWS_ACCESS_KEY,
      secretAccessKey: process.env.MC_AWS_SECRET_ACCESS_KEY,
    },
  });
  const bucket = process.env.MC_AWS_S3_BUCKET;

  const log = (line) => process.stderr.write(`  ${line}\n`);

  async function objectSize(key) {
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return head.ContentLength ?? null;
    } catch {
      return null;
    }
  }

  async function objectBase64(key) {
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await object.Body.transformToByteArray();
    return Buffer.from(bytes).toString('base64');
  }

  try {
    const { rows: candidates } = await db.query(`
      SELECT m.id,
             m."s3Key",
             m."contentType",
             (SELECT count(*) FROM "MemeTag" mt WHERE mt.memeid = m.id)::int AS tags,
             EXISTS (SELECT 1 FROM "MemeTranscription" t WHERE t.meme_id = m.id) AS transcribed,
             (SELECT count(*) FROM "Like" l
               WHERE l."memeId" = m.id AND l."deletedAt" IS NULL)::int AS likes
        FROM "Meme" m
       WHERE m."deletedAt" IS NULL
       ORDER BY transcribed DESC, tags DESC, likes DESC, m."createdAt" DESC
    `);

    const picked = [];
    let videos = 0;
    let gifs = 0;

    async function tryPick(meme) {
      const isVideo = meme.contentType.startsWith('video/');
      const isGif = meme.contentType === 'image/gif';
      if (isVideo && videos >= MAX_VIDEOS) {
        return false;
      }
      if (isGif && gifs >= MAX_GIFS) {
        return false;
      }
      const size = await objectSize(meme.s3Key);
      const cap = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if (size === null || size > cap) {
        return false;
      }
      if (isVideo) {
        videos++;
      }
      if (isGif) {
        gifs++;
      }
      picked.push(meme);
      return true;
    }

    const documented = candidates.filter((m) => m.tags > 0 || m.transcribed);
    const untouched = candidates.filter((m) => m.tags === 0 && !m.transcribed);

    let count = 0;
    for (const meme of documented) {
      if (count >= DOCUMENTED_COUNT) {
        break;
      }
      if (await tryPick(meme)) {
        count++;
      }
    }
    count = 0;
    for (const meme of untouched) {
      if (count >= UNTOUCHED_COUNT) {
        break;
      }
      if (await tryPick(meme)) {
        count++;
      }
    }
    log(`picked ${picked.length} memes (${videos} videos, ${gifs} gifs)`);

    const ids = picked.map((m) => m.id);
    const query = async (sql, params = []) => (await db.query(sql, params)).rows;

    const tables = {
      // No email, no passwordHash.
      User: await query(`
        SELECT id, username, "createdAt", "deletedAt", role, "lastActive", "avatarS3Key"
          FROM "User"
      `),
      Cache: await query(`SELECT * FROM "Cache"`),
      Meme: await query(`SELECT * FROM "Meme" WHERE id = ANY($1)`, [ids]),
      MemeCache: await query(`SELECT * FROM "MemeCache" WHERE "memeId" = ANY($1)`, [ids]),
      Tag: await query(
        `SELECT * FROM "Tag"
          WHERE id IN (SELECT tagid FROM "MemeTag" WHERE memeid = ANY($1))`,
        [ids]
      ),
      MemeTag: await query(`SELECT * FROM "MemeTag" WHERE memeid = ANY($1)`, [ids]),
      MemeTagVote: await query(`SELECT * FROM "MemeTagVote" WHERE memeid = ANY($1)`, [ids]),
      MemeTranscription: await query(
        `SELECT * FROM "MemeTranscription" WHERE meme_id = ANY($1) ORDER BY id`,
        [ids]
      ),
      Like: await query(`SELECT * FROM "Like" WHERE "memeId" = ANY($1) ORDER BY id`, [ids]),
    };

    const mediaKeys = [
      ...picked.map((m) => ({ key: m.s3Key, contentType: m.contentType })),
      ...tables.User.filter((u) => u.avatarS3Key).map((u) => ({
        key: u.avatarS3Key,
        contentType: null,
      })),
      { key: DEFAULT_AVATAR_KEY, contentType: null },
    ];

    const media = [];
    for (const { key, contentType } of mediaKeys) {
      const size = await objectSize(key);
      if (size === null || size > MAX_IMAGE_BYTES * 3) {
        log(`skipped ${key} (missing or too large)`);
        continue;
      }
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      media.push({
        key,
        contentType: contentType ?? head.ContentType ?? 'application/octet-stream',
        base64: await objectBase64(key),
      });
    }
    log(`copied ${media.length} media files`);

    process.stdout.write(
      JSON.stringify({
        pulledAt: new Date().toISOString(),
        tables,
        media,
      })
    );
  } finally {
    await db.end();
  }
}
