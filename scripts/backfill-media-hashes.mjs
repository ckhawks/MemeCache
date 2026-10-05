#!/usr/bin/env node
//
// Fingerprints the media of memes that have no fingerprint yet (everything uploaded before
// migration 013, or hashed by an older FINGERPRINT_VERSION), then rebuilds the stored
// matches between all memes: the duplicates and same-template pairs the meme pages show.
//
//   node scripts/backfill-media-hashes.mjs                 hash what is missing, then rebuild matches
//   node scripts/backfill-media-hashes.mjs --dry-run       say what it would do, change nothing
//   node scripts/backfill-media-hashes.mjs --limit 50      hash at most 50 memes this run
//   node scripts/backfill-media-hashes.mjs --retry-failed  also retry memes whose file failed before
//   node scripts/backfill-media-hashes.mjs --skip-matches  hash only
//   node scripts/backfill-media-hashes.mjs --from-url https://memecache.me
//                                    read the media from a running site's /api/resource/<id>
//                                    instead of the bucket (no S3 keys needed)
//
// Reads DATABASE_URL and, without --from-url, the S3 settings (MC_AWS_ACCESS_KEY,
// MC_AWS_SECRET_ACCESS_KEY, MC_AWS_S3_BUCKET, MC_S3_ENDPOINT) from the environment, falling
// back to .env. Videos need ffmpeg on PATH or FFMPEG_PATH.
//
// Safe to stop and run again. Each meme's fingerprint is saved in one statement as soon as
// it is made, so a rerun carries on where the last one stopped. It only reads the media and
// writes only meme_media_hash and meme_media_match. Rebuilding matches writes the current
// pairs first and only then removes pairs that no longer hold, so stopping in between
// leaves extra pairs at worst, never missing ones.
//
// Needs Node 22.18 or later, which runs the app's TypeScript modules directly.

import { readFileSync, existsSync } from 'node:fs';
import { register } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Every KEY=value line of .env that the environment does not already set.
function loadEnvFile() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) {
    return;
  }
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

function parseArgs(args) {
  const fromIndex = args.indexOf('--from-url');
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex === -1 ? Infinity : Number(args[limitIndex + 1]);
  if (Number.isNaN(limit) || limit < 0) {
    throw new Error('--limit takes a number.');
  }
  const fromUrl = fromIndex === -1 ? null : (args[fromIndex + 1] ?? '').replace(/\/+$/, '');
  if (fromUrl !== null && !/^https?:\/\//.test(fromUrl)) {
    throw new Error('--from-url takes the site address, like https://memecache.me.');
  }
  return {
    dryRun: args.includes('--dry-run'),
    retryFailed: args.includes('--retry-failed'),
    skipMatches: args.includes('--skip-matches'),
    limit,
    fromUrl,
  };
}

// The same client as src/util/s3/GetS3Client.ts.
function s3Client() {
  const endpoint = process.env.MC_S3_ENDPOINT || undefined;
  return new S3Client({
    region: 'us-west-1',
    endpoint,
    forcePathStyle: endpoint !== undefined,
    credentials: {
      accessKeyId: process.env.MC_AWS_ACCESS_KEY,
      secretAccessKey: process.env.MC_AWS_SECRET_ACCESS_KEY,
    },
  });
}

// Through the site's own media route, which serves a live meme's file by its id.
async function fetchFromSite(base, id) {
  const response = await fetch(`${base}/api/resource/${id}`);
  if (!response.ok) {
    throw new Error(`${base}/api/resource/${id} answered ${response.status}.`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function download(client, key) {
  const response = await client.send(
    new GetObjectCommand({
      Bucket: process.env.MC_AWS_S3_BUCKET,
      Key: key,
    })
  );
  return Buffer.from(await response.Body.transformToByteArray());
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!process.features.typescript) {
    throw new Error(`This script needs Node 22.18 or later (this is ${process.version}).`);
  }
  loadEnvFile();
  if (!process.env.DATABASE_URL) {
    throw new Error('No DATABASE_URL in the environment or in .env.');
  }

  // After the environment is set: src/db/db.ts reads DATABASE_URL when it is first imported.
  register('./ts-resolve.mjs', import.meta.url);
  const { db } = await import('../src/db/db.ts');
  const queries = await import('../src/db/queries/mediaHash.ts');
  const { fingerprintMedia } = await import('../src/server/mediaHashDecode.ts');
  const { matchAll } = await import('../src/server/mediaMatch.ts');

  const [{ ready }] = await db(`SELECT to_regclass('meme_media_hash') IS NOT NULL AS ready`);
  if (!ready) {
    throw new Error('meme_media_hash does not exist. Apply migration 013 first (npm run db:migrate).');
  }

  const todo = (await queries.listMemesToHash(1_000_000, options.retryFailed)).slice(0, options.limit);
  console.log(`${todo.length} meme(s) to fingerprint.`);

  if (options.dryRun) {
    const [counts] = await db(
      `SELECT count(*) FILTER (WHERE error IS NULL)::int AS ok,
              count(*) FILTER (WHERE error IS NOT NULL)::int AS failed
         FROM meme_media_hash`
    );
    console.log(`Already stored: ${counts.ok} fingerprint(s), ${counts.failed} failure(s). Dry run, nothing written.`);
    return;
  }

  const client = options.fromUrl ? null : s3Client();
  let failed = 0;
  for (let i = 0; i < todo.length; i++) {
    const meme = todo[i];
    const label = `[${i + 1}/${todo.length}] ${meme.id} ${meme.contentType}`;
    try {
      const file = options.fromUrl
        ? await fetchFromSite(options.fromUrl, meme.id)
        : await download(client, meme.s3Key);
      const fingerprint = await fingerprintMedia(file, meme.contentType);
      await queries.saveFingerprint(meme.id, fingerprint);
      console.log(`${label}: ok, ${fingerprint.regions.length} region(s)`);
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`${label}: failed, ${message}`);
      await queries.saveFingerprintError(meme.id, message);
    }
  }
  if (todo.length > 0) {
    console.log(`Fingerprinted ${todo.length - failed}, failed ${failed}.`);
  }

  if (options.skipMatches) {
    return;
  }

  // Every fingerprint in memory at once: a few KB each, so thousands of memes is tens of
  // MB. Comparing all pairs takes seconds per thousand memes.
  const ids = (await queries.listMemeHashes()).map((m) => m.memeId);
  const fingerprints = new Map();
  for (let i = 0; i < ids.length; i += 500) {
    for (const [id, fingerprint] of await queries.getFingerprints(ids.slice(i, i + 500))) {
      fingerprints.set(id, fingerprint);
    }
  }
  console.log(`Comparing ${fingerprints.size} meme(s)...`);
  const started = Date.now();
  const matches = matchAll(fingerprints);
  await queries.saveMatches(matches);
  await queries.deleteMatchesExcept([...fingerprints.keys()], matches);

  const duplicates = matches.filter((m) => m.kind === 'duplicate');
  console.log(
    `Stored ${duplicates.length} duplicate pair(s) and ${matches.length - duplicates.length} same-template pair(s) in ${((Date.now() - started) / 1000).toFixed(1)}s.`
  );
  // Listed so they can be checked by eye.
  const links = new Map((await queries.getMemeLinks(duplicates.flatMap((m) => [m.memeId, m.otherId]))).map((l) => [l.id, l.slug]));
  for (const pair of duplicates.slice(0, 100)) {
    console.log(`  duplicate: /meme/${links.get(pair.memeId)}  /meme/${links.get(pair.otherId)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
