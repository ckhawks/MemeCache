import { db } from '@/db/db';
import { isSlug, isUuid } from './ids';
import { karmaSql } from './users';
import { warningsSql } from './warnings';
import type { ContentWarning } from '@/constants/contentWarnings';

export interface MemeCard {
  id: string;
  // The short public id used in page URLs: /meme/<slug>.
  slug: string;
  contentType: string;
  createdAt: Date;
  uploaderId: string;
  username: string;
  // For avatarUrl. Null until they upload one.
  avatarKey: string | null;
  // The uploader's karma, shown beside their name.
  karma: number;
  likeCount: number;
  // Counted views of its page (migration 015), a running total kept on the meme row.
  viewCount: number;
  hasLiked: boolean;
  // Whether the viewer saved it to their Library. Saves are private, so no count.
  hasSaved: boolean;
  // Content warnings (migration 007). Any at all and the meme is shown blurred.
  warnings: ContentWarning[];
}

export interface MemePage {
  memes: MemeCard[];
  // Pass back as `cursor` for the next page. Null on the last page.
  nextCursor: string | null;
}

export interface MemeFilter {
  // The logged-in user, for hasLiked. Absent for visitors.
  viewerId?: string;
  uploaderId?: string;
  // Memes carrying this tag with a net score of at least 1.
  tagName?: string;
  // Memes this user saved: their Library.
  savedBy?: string;
}

export const FEED_PAGE_SIZE = 60;

// Counts are subqueries rather than joins. Joining likes and votes into the same FROM
// multiplies one by the other, which is how like counts and tag scores used to inflate.
// Views are the exception: there can be many per meme, so recordView keeps a total on the
// meme row and no card counts them.
// Every query using it passes the viewer (or null) as $1.
export const CARD_COLUMNS = `
  m.id,
  m.slug,
  m.content_type AS "contentType",
  m.created_at AS "createdAt",
  m.uploader_id AS "uploaderId",
  u.username,
  u.avatar_s3_key AS "avatarKey",
  ${karmaSql('m.uploader_id')} AS karma,
  (SELECT count(*)::int FROM meme_like l WHERE l.meme_id = m.id) AS "likeCount",
  m.view_count AS "viewCount",
  EXISTS (
    SELECT 1 FROM meme_like l WHERE l.meme_id = m.id AND l.user_id = $1::uuid
  ) AS "hasLiked",
  EXISTS (
    SELECT 1 FROM meme_save s WHERE s.meme_id = m.id AND s.user_id = $1::uuid
  ) AS "hasSaved",
  ${warningsSql('m.id')} AS warnings
`;

// Shared by the feed and its count, which number their parameters differently. Postgres
// refuses a parameter the SQL never mentions, so each query passes only what it uses.
function filterSql(uploaderParam: string, tagParam: string, savedByParam: string) {
  return `
    m.deleted_at IS NULL
    AND (${uploaderParam}::uuid IS NULL OR m.uploader_id = ${uploaderParam}::uuid)
    AND (
      ${savedByParam}::uuid IS NULL
      OR EXISTS (
        SELECT 1 FROM meme_save s WHERE s.meme_id = m.id AND s.user_id = ${savedByParam}::uuid
      )
    )
    AND (
      ${tagParam}::text IS NULL
      OR EXISTS (
        SELECT 1
          FROM meme_tag mt
          JOIN tag t ON t.id = mt.tag_id
         WHERE mt.meme_id = m.id
           AND lower(t.name) = lower(${tagParam}::text)
           AND (
             SELECT COALESCE(sum(v.vote), 0)
               FROM counted_tag_vote v
              WHERE v.meme_id = mt.meme_id AND v.tag_id = mt.tag_id
           ) >= 1
      )
    )
  `;
}

function filterParams(filter: MemeFilter) {
  return [
    isUuid(filter.uploaderId) ? filter.uploaderId : null,
    filter.tagName ?? null,
    isUuid(filter.savedBy) ? filter.savedBy : null,
  ];
}

function viewerParam(viewerId: string | undefined) {
  return isUuid(viewerId) ? viewerId : null;
}

// The cursor is the last row's sort key. created_at is carried as Postgres's own text form
// rather than a JS Date, which would drop the microseconds and skip rows on a page edge.
function parseCursor(cursor: string | null | undefined) {
  if (!cursor) {
    return [null, null];
  }
  const separator = cursor.lastIndexOf('~');
  const createdAt = cursor.slice(0, separator);
  const id = cursor.slice(separator + 1);
  if (separator === -1 || !isUuid(id) || Number.isNaN(Date.parse(createdAt))) {
    return [null, null];
  }
  return [createdAt, id];
}

// Newest first, keyset-paginated on (created_at, id).
export async function listMemes(
  filter: MemeFilter,
  cursor?: string | null,
  limit = FEED_PAGE_SIZE
): Promise<MemePage> {
  const [cursorCreatedAt, cursorId] = parseCursor(cursor);

  const rows = await db<MemeCard & { sortKey: string }>(
    `SELECT ${CARD_COLUMNS},
            m.created_at::text || '~' || m.id AS "sortKey"
       FROM meme m
       JOIN app_user u ON u.id = m.uploader_id
      WHERE ${filterSql('$2', '$3', '$4')}
        AND ($5::timestamptz IS NULL OR (m.created_at, m.id) < ($5::timestamptz, $6::uuid))
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $7`,
    [viewerParam(filter.viewerId), ...filterParams(filter), cursorCreatedAt, cursorId, limit + 1]
  );

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  return {
    memes: page.map(({ sortKey, ...meme }) => meme),
    nextCursor: hasMore ? page[page.length - 1].sortKey : null,
  };
}

export async function countMemes(filter: MemeFilter): Promise<number> {
  const [row] = await db<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM meme m
      WHERE ${filterSql('$1', '$2', '$3')}`,
    filterParams(filter)
  );
  return row.count;
}

// By uuid or by slug. Null when the meme does not exist or has been deleted.
export async function getMeme(idOrSlug: string, viewerId?: string): Promise<MemeCard | null> {
  const column = isUuid(idOrSlug) ? 'm.id = $2::uuid' : isSlug(idOrSlug) ? 'm.slug = $2' : null;
  if (!column) {
    return null;
  }
  const [meme] = await db<MemeCard>(
    `SELECT ${CARD_COLUMNS}
       FROM meme m
       JOIN app_user u ON u.id = m.uploader_id
      WHERE ${column}
        AND m.deleted_at IS NULL`,
    [viewerParam(viewerId), idOrSlug]
  );
  return meme ?? null;
}

// Returns the slug the database generated for it. Warnings go in with the meme, in the same
// statement, so it is never visible without the labels its uploader gave it.
export async function createMeme(meme: {
  id: string;
  uploaderId: string;
  s3Key: string;
  contentType: string;
  // The post it was imported from, normalized. Null for a file upload.
  sourceUrl?: string | null;
  warnings?: ContentWarning[];
}): Promise<string> {
  const [row] = await db<{ slug: string }>(
    `WITH created AS (
       INSERT INTO meme (id, uploader_id, s3_key, content_type, source_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, slug
     ),
     labelled AS (
       INSERT INTO meme_content_warning (meme_id, warning, added_by)
       SELECT created.id, unnest($6::text[]), $2 FROM created
     )
     SELECT slug FROM created`,
    [
      meme.id,
      meme.uploaderId,
      meme.s3Key,
      meme.contentType,
      meme.sourceUrl ?? null,
      [...new Set(meme.warnings ?? [])],
    ]
  );
  return row.slug;
}

// The newest live meme imported from this (normalized) link, for the duplicate warning.
export async function findMemeBySourceUrl(sourceUrl: string): Promise<{ slug: string } | null> {
  const [row] = await db<{ slug: string }>(
    `SELECT slug
       FROM meme
      WHERE source_url = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [sourceUrl]
  );
  return row ?? null;
}

// Soft delete. The row and the stored file stay, so a takedown can hold content and a
// mistaken delete can be undone. Every read above filters deleted_at.
export async function softDeleteMeme(id: string) {
  await db(`UPDATE meme SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

// The stored file behind a meme, or null when it does not exist or has been deleted. The
// media route goes through this so a deleted meme's file stops being served.
export async function getMemeMedia(id: string): Promise<{ s3Key: string } | null> {
  if (!isUuid(id)) {
    return null;
  }
  const [row] = await db<{ s3Key: string }>(
    `SELECT s3_key AS "s3Key" FROM meme WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return row ?? null;
}

// "More like this" under a meme: other memes ranked by how many confirmed tags (net score
// at least 1) they share with it, then by the same uploader, then newest. Memes that share
// nothing still fill the list, so an untagged meme gets a feed too.
export async function listRelatedMemes(
  meme: { id: string; uploaderId: string },
  viewerId?: string,
  limit = 12
): Promise<MemeCard[]> {
  return db<MemeCard>(
    `WITH confirmed AS (
       SELECT mt.meme_id, mt.tag_id
         FROM meme_tag mt
        WHERE (SELECT COALESCE(sum(v.vote), 0)
                 FROM counted_tag_vote v
                WHERE v.meme_id = mt.meme_id AND v.tag_id = mt.tag_id) >= 1
     ),
     this_meme AS (
       SELECT tag_id FROM confirmed WHERE meme_id = $2
     )
     SELECT ${CARD_COLUMNS}
       FROM meme m
       JOIN app_user u ON u.id = m.uploader_id
      WHERE m.id <> $2
        AND m.deleted_at IS NULL
      ORDER BY
        (SELECT count(*) FROM confirmed c WHERE c.meme_id = m.id AND c.tag_id IN (SELECT tag_id FROM this_meme)) DESC,
        (m.uploader_id = $3) DESC,
        m.created_at DESC,
        m.id DESC
      LIMIT $4`,
    [viewerParam(viewerId), meme.id, meme.uploaderId, limit]
  );
}

export type FeedSort = 'new' | 'top' | 'random';

// Feeds in an order that keyset pagination cannot follow: most liked first, or a shuffle.
// Paged by offset instead. A shuffle is a seeded hash of each id, so the same seed gives the
// same order on every page and no meme shows twice.
export async function listMemesOrdered(
  filter: MemeFilter,
  sort: 'top' | 'random',
  options: { page?: number; seed?: string; limit?: number } = {}
): Promise<{ memes: MemeCard[]; nextPage: number | null }> {
  const limit = options.limit ?? FEED_PAGE_SIZE;
  const page = Math.max(0, Math.floor(options.page ?? 0));
  // Postgres refuses a parameter the SQL never mentions, so the seed is only passed (as $5)
  // when the shuffle uses it, and LIMIT/OFFSET follow whatever came last.
  const params: unknown[] = [viewerParam(filter.viewerId), ...filterParams(filter)];
  let order: string;
  if (sort === 'top') {
    order = `"likeCount" DESC, m.created_at DESC, m.id DESC`;
  } else {
    params.push(options.seed ?? '');
    order = `md5(m.id::text || $${params.length}::text), m.id`;
  }
  params.push(limit + 1, page * limit);

  const rows = await db<MemeCard>(
    `SELECT ${CARD_COLUMNS}
       FROM meme m
       JOIN app_user u ON u.id = m.uploader_id
      WHERE ${filterSql('$2', '$3', '$4')}
      ORDER BY ${order}
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const hasMore = rows.length > limit;
  return { memes: rows.slice(0, limit), nextPage: hasMore ? page + 1 : null };
}

export type TopWindow = 'day' | 'week' | 'month' | 'all';

const WINDOW_INTERVALS: Record<Exclude<TopWindow, 'all'>, string> = {
  day: '1 day',
  week: '7 days',
  month: '30 days',
};

// The home page's "top memes": the shortest window with at least `limit` memes posted in
// it, most liked first. A quiet day falls back to the week, then the month, then all time,
// so the section is never short.
export async function listTopMemes(
  viewerId: string | undefined,
  limit: number
): Promise<{ window: TopWindow; memes: MemeCard[] }> {
  const [counts] = await db<Record<Exclude<TopWindow, 'all'>, number>>(
    `SELECT count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS day,
            count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS week,
            count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS month
       FROM meme
      WHERE deleted_at IS NULL`
  );
  const window = (['day', 'week', 'month'] as const).find((w) => counts[w] >= limit) ?? 'all';
  const since = window === 'all' ? null : WINDOW_INTERVALS[window];

  const memes = await db<MemeCard>(
    `SELECT ${CARD_COLUMNS}
       FROM meme m
       JOIN app_user u ON u.id = m.uploader_id
      WHERE m.deleted_at IS NULL
        AND ($2::interval IS NULL OR m.created_at > now() - $2::interval)
      ORDER BY "likeCount" DESC, m.created_at DESC, m.id DESC
      LIMIT $3`,
    [viewerParam(viewerId), since, limit]
  );
  return { window, memes };
}
