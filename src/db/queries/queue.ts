import { db } from '@/db/db';
import { isUuid } from './ids';
import { STANDS, VERSION_COLUMNS } from './transcriptions';
import { warningsSql } from './warnings';
import { mutedSql } from './tagPreferences';
import {
  CONFIRMATIONS_NEEDED,
  QUEUE_TASKS,
  TAGS_NEEDED,
  type QueueTask,
} from '@/constants/queue';
import type { ContentWarning } from '@/constants/contentWarnings';

export { QUEUE_TASKS, type QueueTask };

export interface QueueMeme {
  id: string;
  slug: string;
  contentType: string;
  username: string;
  avatarKey: string | null;
  warnings: ContentWarning[];
}

export interface QueueVersion {
  id: string;
  text: string;
  editedByUsername: string;
  confirms: number;
  rejects: number;
}

export interface QueueItem {
  meme: QueueMeme;
  // Transcription task: the version to check, or none when the meme needs typing out.
  transcription?: QueueVersion | null;
}

const MEME_COLUMNS = `
  m.id,
  m.slug,
  m.content_type AS "contentType",
  u.username,
  u.avatar_s3_key AS "avatarKey",
  ${warningsSql('m.id')} AS warnings
`;

// The viewer skipped this meme for this task after `since` (null: ever). A skip only lasts
// until something new happens on the meme, so new work brings it back.
function skippedSince(task: QueueTask, since: string) {
  return `EXISTS (
    SELECT 1 FROM queue_skip s
     WHERE s.user_id = $1 AND s.task = '${task}' AND s.meme_id = m.id
       AND (${since} IS NULL OR s.created_at >= ${since})
  )`;
}

// Each meme's version under review: the newest one that has not been settled as wrong
// (rejected by CONFIRMATIONS_NEEDED more people than confirmed it). Null when there is no
// such version and the meme needs its text typed out.
const OPEN_VERSION = `
  SELECT DISTINCT ON (t.meme_id) t.meme_id, ${VERSION_COLUMNS}
    FROM meme_transcription t
    JOIN app_user u ON u.id = t.edited_by
   WHERE (SELECT count(*) FILTER (WHERE r.verdict = -1) - count(*) FILTER (WHERE r.verdict = 1)
            FROM counted_transcription_review r
           WHERE r.transcription_id = t.id) < ${CONFIRMATIONS_NEEDED}
   ORDER BY t.meme_id, t.created_at DESC, t.id DESC
`;

// Per tag on a meme: the net of counted votes from everyone but whoever added it.
// Settled at +CONFIRMATIONS_NEEDED (confirmed) or -CONFIRMATIONS_NEEDED (rejected).
const TAG_AGREEMENT = `
  SELECT mt.meme_id,
         mt.tag_id,
         mt.added_by,
         (SELECT COALESCE(sum(v.vote), 0)
            FROM counted_tag_vote v
           WHERE v.meme_id = mt.meme_id AND v.tag_id = mt.tag_id
             AND v.voter_id <> mt.added_by) AS agreement
    FROM meme_tag mt
   WHERE mt.removed_at IS NULL
`;

// Each task's candidates for viewer $1, best first. Used both for "next" (LIMIT 1) and for
// the count on its tab. Memes carrying a tag the viewer muted are not offered.
function candidatesSql(task: QueueTask) {
  if (task === 'transcription') {
    return `
      SELECT ${MEME_COLUMNS}, v.id AS "versionId"
        FROM meme m
        JOIN app_user u ON u.id = m.uploader_id
        LEFT JOIN (${OPEN_VERSION}) v ON v.meme_id = m.id
       WHERE m.deleted_at IS NULL
         AND NOT ${mutedSql('m.id', '$1')}
         AND (
           -- Nothing to check: type it out.
           (v.id IS NULL
             AND NOT ${skippedSince(task, `(SELECT max(t.created_at) FROM meme_transcription t WHERE t.meme_id = m.id)`)})
           OR
           -- Someone else's version that still needs confirming, and the viewer has not judged it.
           (v.id IS NOT NULL
             AND v.confirms < ${CONFIRMATIONS_NEEDED}
             AND v."editedBy" <> $1
             AND NOT EXISTS (
               SELECT 1 FROM transcription_review r
                WHERE r.transcription_id = v.id::bigint AND r.reviewer_id = $1
             )
             AND NOT ${skippedSince(task, 'v."createdAt"')})
         )
       -- Checking someone's work first (they are waiting on it), then text that does not show
       -- yet, then untranscribed memes, newest first.
       ORDER BY (v.id IS NULL) ASC,
                CASE WHEN v.id IS NULL THEN true ELSE ${STANDS} END ASC,
                m.created_at DESC,
                m.id`;
  }
  return `
    SELECT ${MEME_COLUMNS}, NULL::text AS "versionId"
      FROM meme m
      JOIN app_user u ON u.id = m.uploader_id
     WHERE m.deleted_at IS NULL
       AND NOT ${mutedSql('m.id', '$1')}
       AND (
         -- Room for more tags, or a tag still being decided.
         (SELECT count(*) FROM (${TAG_AGREEMENT}) a
           WHERE a.meme_id = m.id AND a.agreement >= ${CONFIRMATIONS_NEEDED}) < ${TAGS_NEEDED}
         OR EXISTS (
           SELECT 1 FROM (${TAG_AGREEMENT}) a
            WHERE a.meme_id = m.id
              AND abs(a.agreement) < ${CONFIRMATIONS_NEEDED}
              AND a.added_by <> $1
              AND NOT EXISTS (
                SELECT 1 FROM meme_tag_vote mv
                 WHERE mv.meme_id = a.meme_id AND mv.tag_id = a.tag_id AND mv.voter_id = $1
              )
         )
       )
       AND NOT ${skippedSince(task, `(SELECT max(mt.created_at) FROM meme_tag mt WHERE mt.meme_id = m.id AND mt.removed_at IS NULL)`)}
     ORDER BY
       (SELECT count(*) FROM (${TAG_AGREEMENT}) a
         WHERE a.meme_id = m.id AND a.agreement >= ${CONFIRMATIONS_NEEDED}) ASC,
       m.created_at DESC,
       m.id`;
}

export async function nextQueueItem(task: QueueTask, viewerId: string): Promise<QueueItem | null> {
  if (!isUuid(viewerId)) {
    return null;
  }
  const [row] = await db<QueueMeme & { versionId: string | null }>(
    `${candidatesSql(task)} LIMIT 1`,
    [viewerId]
  );
  if (!row) {
    return null;
  }
  const meme: QueueMeme = {
    id: row.id,
    slug: row.slug,
    contentType: row.contentType,
    username: row.username,
    avatarKey: row.avatarKey,
    warnings: row.warnings,
  };
  if (task !== 'transcription') {
    return { meme };
  }
  if (!row.versionId) {
    return { meme, transcription: null };
  }
  const [transcription] = await db<QueueVersion>(
    `SELECT id, text, "editedByUsername", confirms, rejects
       FROM (
         SELECT ${VERSION_COLUMNS}
           FROM meme_transcription t
           JOIN app_user u ON u.id = t.edited_by
          WHERE t.id = $1
       ) v`,
    [row.versionId]
  );
  return { meme, transcription };
}

export async function countQueue(viewerId: string): Promise<Record<QueueTask, number>> {
  if (!isUuid(viewerId)) {
    return { transcription: 0, tag: 0 };
  }
  const [row] = await db<Record<QueueTask, number>>(
    `SELECT
       (SELECT count(*)::int FROM (${candidatesSql('transcription')}) q) AS transcription,
       (SELECT count(*)::int FROM (${candidatesSql('tag')}) q) AS tag`,
    [viewerId]
  );
  return row;
}

// A skip lasts until something new happens on the meme, so a repeat skip moves its time on.
export async function dismissQueueItem(viewerId: string, task: QueueTask, memeId: string) {
  await db(
    `INSERT INTO queue_skip (user_id, task, meme_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, task, meme_id) DO UPDATE SET created_at = now()`,
    [viewerId, task, memeId]
  );
}
