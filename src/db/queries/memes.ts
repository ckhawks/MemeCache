import { db } from '@/db/db';
import { isUuid } from './ids';

export interface MemeCard {
  id: string;
  contentType: string;
  createdAt: Date;
  uploaderId: string;
  username: string;
  likeCount: number;
  hasLiked: boolean;
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
}

export const FEED_PAGE_SIZE = 60;

// Counts are subqueries rather than joins. Joining likes and votes into the same FROM
// multiplies one by the other, which is how like counts and tag scores used to inflate.
const CARD_COLUMNS = `
  m.id,
  m.content_type AS "contentType",
  m.created_at AS "createdAt",
  m.uploader_id AS "uploaderId",
  u.username,
  (SELECT count(*)::int FROM meme_like l WHERE l.meme_id = m.id) AS "likeCount",
  EXISTS (
    SELECT 1 FROM meme_like l WHERE l.meme_id = m.id AND l.user_id = $1::uuid
  ) AS "hasLiked"
`;

// Shared by the feed and its count, which number their parameters differently. Postgres
// refuses a parameter the SQL never mentions, so each query passes only what it uses.
function filterSql(uploaderParam: string, tagParam: string) {
  return `
    m.deleted_at IS NULL
    AND (${uploaderParam}::uuid IS NULL OR m.uploader_id = ${uploaderParam}::uuid)
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
               FROM meme_tag_vote v
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
      WHERE ${filterSql('$2', '$3')}
        AND ($4::timestamptz IS NULL OR (m.created_at, m.id) < ($4::timestamptz, $5::uuid))
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $6`,
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
      WHERE ${filterSql('$1', '$2')}`,
    filterParams(filter)
  );
  return row.count;
}

// Null when the meme does not exist or has been deleted.
export async function getMeme(id: string, viewerId?: string): Promise<MemeCard | null> {
  if (!isUuid(id)) {
    return null;
  }
  const [meme] = await db<MemeCard>(
    `SELECT ${CARD_COLUMNS}
       FROM meme m
       JOIN app_user u ON u.id = m.uploader_id
      WHERE m.id = $2::uuid
        AND m.deleted_at IS NULL`,
    [viewerParam(viewerId), id]
  );
  return meme ?? null;
}

export async function createMeme(meme: {
  id: string;
  uploaderId: string;
  s3Key: string;
  contentType: string;
}) {
  await db(
    `INSERT INTO meme (id, uploader_id, s3_key, content_type)
     VALUES ($1, $2, $3, $4)`,
    [meme.id, meme.uploaderId, meme.s3Key, meme.contentType]
  );
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
