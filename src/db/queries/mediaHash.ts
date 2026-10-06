import { db } from '@/db/db';
import {
  FINGERPRINT_VERSION,
  THUMB_SIZE,
  DETAIL_WIDTH,
  DETAIL_HEIGHT,
  type Fingerprint,
  type RegionHashes,
  type RegionKind,
  type RelationKind,
} from '@/server/mediaHash';
import { isUuid } from './ids';
import { matchCtes } from './duplicates';

// Media fingerprints and the matches between memes (migration 013). The fingerprint's
// layout is src/server/mediaHash.ts's; this file only stores and loads it.

const HASHES_PER_REGION = 6;
const THUMB_BYTES = THUMB_SIZE * THUMB_SIZE;

// A hash is two unsigned 32-bit halves in memory and one signed bigint in Postgres.
// node-postgres hands bigints over as strings, which keeps all 64 bits.
function hashToSql([high, low]: [number, number]): string {
  return BigInt.asIntN(64, (BigInt(high) << BigInt(32)) + BigInt(low)).toString();
}

function hashFromSql(value: string): [number, number] {
  const unsigned = BigInt.asUintN(64, BigInt(value));
  return [Number(unsigned >> BigInt(32)), Number(unsigned & BigInt(0xffffffff))];
}

function hashesFromSql(values: string[]): [number, number][][] {
  const regions: [number, number][][] = [];
  for (let i = 0; i < values.length; i += HASHES_PER_REGION) {
    regions.push(values.slice(i, i + HASHES_PER_REGION).map(hashFromSql));
  }
  return regions;
}

export async function saveFingerprint(memeId: string, fingerprint: Fingerprint) {
  const { regions, detail } = fingerprint;
  await db(
    `INSERT INTO meme_media_hash (meme_id, version, error, kinds, aspects, hashes, thumbs, detail)
     VALUES ($1, $2, NULL, $3::text[], $4::real[], $5::bigint[], $6, $7)
     ON CONFLICT (meme_id) DO UPDATE
       SET version = EXCLUDED.version,
           error = NULL,
           kinds = EXCLUDED.kinds,
           aspects = EXCLUDED.aspects,
           hashes = EXCLUDED.hashes,
           thumbs = EXCLUDED.thumbs,
           detail = EXCLUDED.detail,
           hashed_at = now()`,
    [
      memeId,
      FINGERPRINT_VERSION,
      regions.map((r) => r.kind),
      regions.map((r) => r.aspect),
      regions.flatMap((r) => r.hashes.map(hashToSql)),
      Buffer.concat(regions.map((r) => Buffer.from(r.thumb.pixels))),
      Buffer.from(detail.pixels),
    ]
  );
}

// Records that a meme's file could not be fingerprinted, so the backfill moves on.
export async function saveFingerprintError(memeId: string, error: string) {
  await db(
    `INSERT INTO meme_media_hash (meme_id, version, error)
     VALUES ($1, $2, $3)
     ON CONFLICT (meme_id) DO UPDATE
       SET version = EXCLUDED.version,
           error = EXCLUDED.error,
           kinds = NULL,
           aspects = NULL,
           hashes = NULL,
           thumbs = NULL,
           detail = NULL,
           hashed_at = now()`,
    [memeId, FINGERPRINT_VERSION, error.slice(0, 500)]
  );
}

export interface MemeHashes {
  memeId: string;
  regions: RegionHashes[];
}

// The hashes of every live meme with a current fingerprint: what a duplicate check scans.
// About 50 bytes per region, so a few thousand memes is a few hundred KB.
export async function listMemeHashes(): Promise<MemeHashes[]> {
  const rows = await db<{ memeId: string; hashes: string[] }>(
    `SELECT h.meme_id AS "memeId", h.hashes
       FROM meme_media_hash h
       JOIN meme m ON m.id = h.meme_id
      WHERE m.deleted_at IS NULL
        AND h.error IS NULL
        AND h.version = $1`,
    [FINGERPRINT_VERSION]
  );
  return rows.map((row) => ({
    memeId: row.memeId,
    regions: hashesFromSql(row.hashes).map((hashes) => ({ hashes })),
  }));
}

// Full fingerprints, thumbnails included, by meme id. Ids without one are left out.
export async function getFingerprints(memeIds: string[]): Promise<Map<string, Fingerprint>> {
  const rows = await db<{
    memeId: string;
    kinds: RegionKind[];
    aspects: number[];
    hashes: string[];
    thumbs: Buffer;
    detail: Buffer;
  }>(
    `SELECT meme_id AS "memeId", kinds, aspects, hashes, thumbs, detail
       FROM meme_media_hash
      WHERE meme_id = ANY($1::uuid[])
        AND error IS NULL
        AND version = $2`,
    [memeIds.filter(isUuid), FINGERPRINT_VERSION]
  );
  const fingerprints = new Map<string, Fingerprint>();
  for (const row of rows) {
    const hashes = hashesFromSql(row.hashes);
    fingerprints.set(row.memeId, {
      regions: row.kinds.map((kind, i) => ({
        kind,
        aspect: row.aspects[i],
        hashes: hashes[i],
        thumb: {
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          pixels: new Uint8Array(row.thumbs.subarray(i * THUMB_BYTES, (i + 1) * THUMB_BYTES)),
        },
      })),
      detail: {
        width: DETAIL_WIDTH,
        height: DETAIL_HEIGHT,
        pixels: new Uint8Array(row.detail),
      },
    });
  }
  return fingerprints;
}

// Live memes that still need a fingerprint: none yet, or one from an older version. With
// retryFailed, also the ones whose file failed last time.
export async function listMemesToHash(
  limit: number,
  retryFailed = false
): Promise<{ id: string; s3Key: string; contentType: string }[]> {
  return db(
    `SELECT m.id, m.s3_key AS "s3Key", m.content_type AS "contentType"
       FROM meme m
       LEFT JOIN meme_media_hash h ON h.meme_id = m.id
      WHERE m.deleted_at IS NULL
        AND (
          h.meme_id IS NULL
          OR h.version < $1
          OR ($2::boolean AND h.error IS NOT NULL)
        )
      ORDER BY m.created_at, m.id
      LIMIT $3`,
    [FINGERPRINT_VERSION, retryFailed, limit]
  );
}

export interface MediaMatch {
  memeId: string;
  otherId: string;
  kind: RelationKind;
  score: number;
}

// Stores matches, each pair once with the smaller id first. A pair seen again takes the
// new kind and score.
export async function saveMatches(matches: MediaMatch[]) {
  // One row per pair: Postgres refuses to update the same row twice in one statement.
  const byPair = new Map<string, MediaMatch>();
  for (const m of matches) {
    const pair = m.memeId < m.otherId ? m : { ...m, memeId: m.otherId, otherId: m.memeId };
    byPair.set(`${pair.memeId} ${pair.otherId}`, pair);
  }
  const pairs = [...byPair.values()];
  if (pairs.length === 0) {
    return;
  }
  await db(
    `INSERT INTO meme_media_match (meme_id, other_id, kind, score)
     SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::real[])
     ON CONFLICT (meme_id, other_id) DO UPDATE
       SET kind = EXCLUDED.kind,
           score = EXCLUDED.score`,
    [
      pairs.map((p) => p.memeId),
      pairs.map((p) => p.otherId),
      pairs.map((p) => p.kind),
      pairs.map((p) => p.score),
    ]
  );
}

// Removes stored pairs between memes in `memeIds` that are not in `keep`: a rebuild's
// cleanup after saveMatches has written the current ones.
export async function deleteMatchesExcept(memeIds: string[], keep: MediaMatch[]) {
  const pairs = keep.map((m) => (m.memeId < m.otherId ? [m.memeId, m.otherId] : [m.otherId, m.memeId]));
  await db(
    `DELETE FROM meme_media_match x
      WHERE x.meme_id = ANY($1::uuid[])
        AND x.other_id = ANY($1::uuid[])
        AND NOT EXISTS (
          SELECT 1
            FROM unnest($2::uuid[], $3::uuid[]) AS k (meme_id, other_id)
           WHERE k.meme_id = x.meme_id AND k.other_id = x.other_id
        )`,
    [memeIds, pairs.map((p) => p[0]), pairs.map((p) => p[1])]
  );
}

// Slugs and types for linking to and previewing memes, in the order given. Deleted memes
// are left out.
export async function getMemeLinks(
  memeIds: string[]
): Promise<{ id: string; slug: string; contentType: string }[]> {
  const rows = await db<{ id: string; slug: string; contentType: string }>(
    `SELECT id, slug, content_type AS "contentType"
       FROM meme
      WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
    [memeIds.filter(isUuid)]
  );
  return memeIds.flatMap((id) => rows.filter((row) => row.id === id));
}

export interface MatchedMeme {
  id: string;
  slug: string;
  contentType: string;
  matchKind: RelationKind;
}

// Live memes matched to this one, duplicates first, then the closest. A pair people settled
// (migration 021) takes their answer as its kind, and one settled as different is left out.
export async function listMatchedMemes(memeId: string, limit = 12): Promise<MatchedMeme[]> {
  if (!isUuid(memeId)) {
    return [];
  }
  return db<MatchedMeme>(
    `WITH ${matchCtes('(a.meme_id = $1 OR a.other_id = $1)')},
     matched AS (
       SELECT x.meme_id, x.other_id, x.other_id AS id, x.kind, x.score
         FROM meme_media_match x WHERE x.meme_id = $1
       UNION ALL
       SELECT x.meme_id, x.other_id, x.meme_id AS id, x.kind, x.score
         FROM meme_media_match x WHERE x.other_id = $1
     ),
     judged AS (
       SELECT x.id,
              x.score,
              CASE v.verdict
                WHEN 'same_meme' THEN 'duplicate'
                WHEN 'same_template' THEN 'template'
                ELSE x.kind
              END AS kind
         FROM matched x
         LEFT JOIN mv_verdict v ON v.meme_id = x.meme_id AND v.other_id = x.other_id
        WHERE v.verdict IS DISTINCT FROM 'different'
     )
     SELECT m.id,
            m.slug,
            m.content_type AS "contentType",
            x.kind AS "matchKind"
       FROM judged x
       JOIN meme m ON m.id = x.id
      WHERE m.deleted_at IS NULL
      ORDER BY (x.kind = 'duplicate') DESC, x.score DESC, m.created_at DESC
      LIMIT $2`,
    [memeId, limit]
  );
}
