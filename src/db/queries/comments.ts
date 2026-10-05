import { db } from '@/db/db';
import { isSlug, isUuid } from './ids';
import { karmaSql } from './users';
import { warningsSql } from './warnings';
import { parseSearch, searchMemes } from './search';
import { COMMENT_EDIT_MINUTES } from '@/constants/comments';
import type { ContentWarning } from '@/constants/contentWarnings';

// Comments on memes (migration 014). Flat, oldest first. Deleting is soft: the row stays and
// reads back with its text and meme left out.

// A meme attached to a comment, or offered by the picker: enough for a thumbnail and a link.
export interface MemeRef {
  id: string;
  slug: string;
  contentType: string;
  username: string;
  // Shown blurred, like anywhere else, when it has any.
  warnings: ContentWarning[];
}

export interface MemeComment {
  // bigint, as a string.
  id: string;
  memeId: string;
  authorId: string;
  username: string;
  avatarKey: string | null;
  karma: number;
  // Empty when the comment is only a meme, and when it was deleted.
  body: string;
  // Null when there is none, when it was deleted, and when the comment was deleted.
  ref: MemeRef | null;
  // It replied with a meme that has since been deleted.
  refGone: boolean;
  createdAt: Date;
  // Null until the author edits it.
  editedAt: Date | null;
  // Who deleted it: the author, or a moderator. Null while it stands.
  deleted: 'author' | 'moderator' | null;
}

// Comment ids come from URLs. Postgres errors on a bigint that is not one.
export function isCommentId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9][0-9]{0,17}$/.test(value);
}

function refJson(meme: string, uploader: string) {
  return `json_build_object(
    'id', ${meme}.id,
    'slug', ${meme}.slug,
    'contentType', ${meme}.content_type,
    'username', ${uploader}.username,
    'warnings', ${warningsSql(`${meme}.id`)}
  )`;
}

// A deleted comment keeps its row but reads back empty. A referenced meme that was deleted
// reads back as refGone.
const COMMENT_COLUMNS = `
  c.id::text AS id,
  c.meme_id AS "memeId",
  c.author_id AS "authorId",
  u.username,
  u.avatar_s3_key AS "avatarKey",
  ${karmaSql('c.author_id')} AS karma,
  CASE WHEN c.deleted_at IS NULL THEN c.body ELSE '' END AS body,
  CASE WHEN c.deleted_at IS NULL AND r.id IS NOT NULL THEN ${refJson('r', 'ru')} END AS ref,
  (c.deleted_at IS NULL AND c.ref_meme_id IS NOT NULL AND r.id IS NULL) AS "refGone",
  c.created_at AS "createdAt",
  c.edited_at AS "editedAt",
  CASE
    WHEN c.deleted_at IS NULL THEN NULL
    WHEN c.deleted_by = c.author_id THEN 'author'
    ELSE 'moderator'
  END AS deleted
`;

const COMMENT_FROM = `
  meme_comment c
  JOIN app_user u ON u.id = c.author_id
  LEFT JOIN meme r ON r.id = c.ref_meme_id AND r.deleted_at IS NULL
  LEFT JOIN app_user ru ON ru.id = r.uploader_id
`;

// Enough for a busy meme. Past this the oldest show and the rest wait for paging, which
// nothing needs yet.
const MAX_COMMENTS = 500;

export async function listComments(memeId: string): Promise<MemeComment[]> {
  if (!isUuid(memeId)) {
    return [];
  }
  return db<MemeComment>(
    `SELECT ${COMMENT_COLUMNS}
       FROM ${COMMENT_FROM}
      WHERE c.meme_id = $1
      ORDER BY c.created_at, c.id
      LIMIT $2`,
    [memeId, MAX_COMMENTS]
  );
}

export async function getComment(id: string): Promise<MemeComment | null> {
  if (!isCommentId(id)) {
    return null;
  }
  const [row] = await db<MemeComment>(
    `SELECT ${COMMENT_COLUMNS}
       FROM ${COMMENT_FROM}
      WHERE c.id = $1`,
    [id]
  );
  return row ?? null;
}

// Whether the author can still edit it: standing, and inside the edit window by the
// database's clock, the same test editComment makes.
export async function isCommentEditable(id: string): Promise<boolean> {
  if (!isCommentId(id)) {
    return false;
  }
  const [row] = await db<{ editable: boolean }>(
    `SELECT deleted_at IS NULL AND created_at > now() - make_interval(mins => $2) AS editable
       FROM meme_comment
      WHERE id = $1`,
    [id, COMMENT_EDIT_MINUTES]
  );
  return row?.editable ?? false;
}

// The caller has checked the meme exists and the text is within COMMENT_MAX, and that there
// is text or a meme.
export async function addComment(comment: {
  memeId: string;
  authorId: string;
  body: string;
  refMemeId: string | null;
}): Promise<MemeComment> {
  const [row] = await db<{ id: string }>(
    `INSERT INTO meme_comment (meme_id, author_id, body, ref_meme_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id::text AS id`,
    [comment.memeId, comment.authorId, comment.body, comment.refMemeId]
  );
  return (await getComment(row.id))!;
}

// Rewrites the text and meme of the author's own comment while it is inside the edit
// window. Marks it edited only when something changed. False when it is not theirs, is
// deleted or is too old.
export async function editComment(
  id: string,
  authorId: string,
  body: string,
  refMemeId: string | null
): Promise<boolean> {
  if (!isCommentId(id)) {
    return false;
  }
  const rows = await db(
    `UPDATE meme_comment
        SET body = $3,
            ref_meme_id = $4,
            edited_at = CASE
              WHEN body IS DISTINCT FROM $3 OR ref_meme_id IS DISTINCT FROM $4::uuid THEN now()
              ELSE edited_at
            END
      WHERE id = $1
        AND author_id = $2
        AND deleted_at IS NULL
        AND created_at > now() - make_interval(mins => $5)
      RETURNING id`,
    [id, authorId, body, refMemeId, COMMENT_EDIT_MINUTES]
  );
  return rows.length > 0;
}

// Soft delete, by its author or a moderator (the route decides who may). Deleting twice
// keeps the first.
export async function deleteComment(id: string, deletedBy: string) {
  if (!isCommentId(id)) {
    return;
  }
  await db(
    `UPDATE meme_comment
        SET deleted_at = now(),
            deleted_by = $2
      WHERE id = $1 AND deleted_at IS NULL`,
    [id, deletedBy]
  );
}

// A live meme to attach, by uuid or slug, with its uploader's id for the notification.
export async function getMemeRef(
  idOrSlug: string
): Promise<(MemeRef & { uploaderId: string }) | null> {
  const column = isUuid(idOrSlug) ? 'r.id = $1::uuid' : isSlug(idOrSlug) ? 'r.slug = $1' : null;
  if (!column) {
    return null;
  }
  const [row] = await db<{ ref: MemeRef; uploaderId: string }>(
    `SELECT ${refJson('r', 'ru')} AS ref,
            r.uploader_id AS "uploaderId"
       FROM meme r
       JOIN app_user ru ON ru.id = r.uploader_id
      WHERE ${column}
        AND r.deleted_at IS NULL`,
    [idOrSlug]
  );
  return row ? { ...row.ref, uploaderId: row.uploaderId } : null;
}

// The picker in the comment box: the best few search results for what was typed.
export async function searchMemeRefs(q: string, limit = 8): Promise<MemeRef[]> {
  const { memes } = await searchMemes(parseSearch(q), { limit });
  return memes.map((meme) => ({
    id: meme.id,
    slug: meme.slug,
    contentType: meme.contentType,
    username: meme.username,
    warnings: meme.warnings,
  }));
}
