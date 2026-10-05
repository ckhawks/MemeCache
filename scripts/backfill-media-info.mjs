#!/usr/bin/env node
//
// Fills in width, height, duration and whether a video has sound (migration 019) for memes
// uploaded before uploads recorded them. Reads each file from the bucket, measures it with
// ffprobe (videos) or sharp (images), and updates only rows whose width is still unknown,
// so it can be stopped and run again at any time.
//
//   node scripts/backfill-media-info.mjs            measure and write
//   node scripts/backfill-media-info.mjs --dry-run  measure and print, write nothing
//
// Reads DATABASE_URL and the S3 settings (MC_AWS_*, MC_S3_ENDPOINT) from the environment,
// falling back to .env. Needs ffprobe on PATH or FFPROBE_PATH.

import { readFileSync, existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import pg from 'pg';
import sharp from 'sharp';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

function loadEnv() {
  const env = { ...process.env };
  const envPath = join(root, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && env[m[1]] === undefined) {
        env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }
  return env;
}

async function probeVideo(bytes, ffprobe) {
  const dir = await mkdtemp(join(os.tmpdir(), 'memecache-backfill-'));
  try {
    const file = join(dir, 'media');
    await writeFile(file, bytes);
    const result = spawnSync(
      ffprobe,
      ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file],
      { encoding: 'utf8', windowsHide: true, timeout: 30_000 }
    );
    if (result.status !== 0) {
      throw new Error(`ffprobe failed: ${result.stderr?.slice(-300)}`);
    }
    const probe = JSON.parse(result.stdout);
    const streams = probe.streams ?? [];
    const video = streams.find((s) => s.codec_type === 'video');
    const seconds = Number(probe.format?.duration ?? video?.duration);
    const rotation = Math.abs(Number(video?.tags?.rotate ?? video?.side_data_list?.[0]?.rotation ?? 0)) % 180;
    const sideways = rotation === 90;
    return {
      width: (sideways ? video?.height : video?.width) ?? null,
      height: (sideways ? video?.width : video?.height) ?? null,
      durationMs: Number.isFinite(seconds) ? Math.round(seconds * 1000) : null,
      hasAudio: streams.some((s) => s.codec_type === 'audio'),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function probeImage(bytes) {
  const meta = await sharp(bytes, { animated: true }).metadata();
  return {
    width: meta.width ?? null,
    height: meta.pageHeight ?? meta.height ?? null,
    durationMs: null,
    hasAudio: null,
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const env = loadEnv();
  const ffprobe = env.FFPROBE_PATH || 'ffprobe';
  const endpoint = env.MC_S3_ENDPOINT || undefined;
  const s3 = new S3Client({
    region: 'us-west-1',
    endpoint,
    forcePathStyle: endpoint !== undefined,
    credentials: {
      accessKeyId: env.MC_AWS_ACCESS_KEY,
      secretAccessKey: env.MC_AWS_SECRET_ACCESS_KEY,
    },
  });
  const url = env.DATABASE_URL;
  const client = new pg.Client({
    connectionString: url,
    ssl: url.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  const { rows } = await client.query(
    `SELECT id, s3_key, content_type FROM meme WHERE width IS NULL ORDER BY created_at`
  );
  console.log(`${rows.length} meme(s) to measure${dryRun ? ' (dry run)' : ''}`);

  let done = 0;
  let failed = 0;
  for (const meme of rows) {
    try {
      const object = await s3.send(new GetObjectCommand({ Bucket: env.MC_AWS_S3_BUCKET, Key: meme.s3_key }));
      const bytes = Buffer.from(await object.Body.transformToByteArray());
      const info = VIDEO_TYPES.includes(meme.content_type)
        ? await probeVideo(bytes, ffprobe)
        : await probeImage(bytes);
      console.log(
        `${meme.id} ${meme.content_type} ${info.width}x${info.height}` +
          (info.durationMs !== null ? ` ${info.durationMs}ms` : '') +
          (info.hasAudio !== null ? (info.hasAudio ? ' sound' : ' silent') : '')
      );
      if (!dryRun) {
        await client.query(
          `UPDATE meme SET width = $2, height = $3, duration_ms = $4, has_audio = $5
            WHERE id = $1 AND width IS NULL`,
          [meme.id, info.width, info.height, info.durationMs, info.hasAudio]
        );
      }
      done += 1;
    } catch (error) {
      failed += 1;
      console.error(`${meme.id} failed: ${error.message}`);
    }
  }

  console.log(`measured ${done}, failed ${failed}${dryRun ? ', nothing written' : ''}`);
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
