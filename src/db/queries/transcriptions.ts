import { db } from '@/db/db';
import { isUuid } from './ids';

export interface Transcription {
  // bigint, which node-postgres returns as a string.
  id: string;
  text: string;
  editedBy: string;
  editedByUsername: string;
  createdAt: Date;
  // Reviews that count (migration 005: held reviewers' do not).
  confirms: number;
  rejects: number;
}

// Empty text is a real answer: it says the meme has no text on it, and is reviewed and
// can be rejected like any other version.
//
// Transcriptions are append-only: each edit is a new version, and every review is kept
// against the version it judged. The current text is the newest version that stands:
//   - not rejected more than it is confirmed, and
//   - written by someone who is not held, or confirmed by someone who counts.
// So a rejected edit falls back to the version before it, and a held user's edit waits
// for a confirm before anyone else sees it.
export const VERSION_COLUMNS = `
  t.id::text AS id,
  t.text,
  t.edited_by AS "editedBy",
  u.username AS "editedByUsername",
  t.created_at AS "createdAt",
  (SELECT count(*)::int FROM counted_transcription_review r
    WHERE r.transcription_id = t.id AND r.verdict = 1) AS confirms,
  (SELECT count(*)::int FROM counted_transcription_review r
    WHERE r.transcription_id = t.id AND r.verdict = -1) AS rejects,
  (SELECT held FROM user_trust WHERE user_id = t.edited_by) AS "authorHeld"
`;

export const STANDS = `(confirms >= rejects AND (NOT "authorHeld" OR confirms >= 1))`;

// Every meme's current version at once: (meme_id, id, text), one row per meme that has a
// standing version. The same rule as STANDS, written as joins rather than per-row
// subqueries, because asking user_trust once per version recomputes the whole view each
// time (2 s over a few thousand versions, against 20 ms this way). Search reads it; a test
// checks it agrees with getCurrentTranscription, so change both together.
export const CURRENT_TRANSCRIPTIONS = `
  SELECT DISTINCT ON (t.meme_id) t.meme_id, t.id, t.text
    FROM meme_transcription t
    JOIN user_trust ut ON ut.user_id = t.edited_by
    LEFT JOIN (
      SELECT transcription_id,
             count(*) FILTER (WHERE verdict = 1) AS confirms,
             count(*) FILTER (WHERE verdict = -1) AS rejects
        FROM counted_transcription_review
       GROUP BY transcription_id
    ) r ON r.transcription_id = t.id
   WHERE COALESCE(r.confirms, 0) >= COALESCE(r.rejects, 0)
     AND (NOT ut.held OR COALESCE(r.confirms, 0) >= 1)
   ORDER BY t.meme_id, t.created_at DESC, t.id DESC
`;

// The meme ids with a standing transcription, for the queue's "needs transcribing".
export const STANDING_MEMES = `
  SELECT v.meme_id FROM (
    SELECT t.meme_id, ${VERSION_COLUMNS}
      FROM meme_transcription t
      JOIN app_user u ON u.id = t.edited_by
  ) v
  WHERE ${STANDS}
`;

export async function getCurrentTranscription(memeId: string): Promise<Transcription | null> {
  if (!isUuid(memeId)) {
    return null;
  }
  const [row] = await db<Transcription>(
    `SELECT id, text, "editedBy", "editedByUsername", "createdAt", confirms, rejects
       FROM (
         SELECT ${VERSION_COLUMNS}
           FROM meme_transcription t
           JOIN app_user u ON u.id = t.edited_by
          WHERE t.meme_id = $1
       ) v
      WHERE ${STANDS}
      ORDER BY "createdAt" DESC, id::bigint DESC
      LIMIT 1`,
    [memeId]
  );
  return row ?? null;
}

// Returns the new version and whether it stands yet: a held user's edit does not until
// someone confirms it.
export async function addTranscription(
  memeId: string,
  text: string,
  editedBy: string
): Promise<Transcription & { pending: boolean }> {
  const [row] = await db<Transcription & { pending: boolean }>(
    `WITH inserted AS (
       INSERT INTO meme_transcription (meme_id, text, edited_by)
       VALUES ($1, $2, $3)
       RETURNING id, text, edited_by, created_at
     )
     SELECT i.id::text AS id,
            i.text,
            i.edited_by AS "editedBy",
            u.username AS "editedByUsername",
            i.created_at AS "createdAt",
            0 AS confirms,
            0 AS rejects,
            (SELECT held FROM user_trust WHERE user_id = i.edited_by) AS pending
       FROM inserted i
       JOIN app_user u ON u.id = i.edited_by`,
    [memeId, text, editedBy]
  );
  return row;
}

export async function getTranscriptionAuthor(
  transcriptionId: string
): Promise<{ editedBy: string; memeId: string } | null> {
  if (!/^\d+$/.test(transcriptionId)) {
    return null;
  }
  const [row] = await db<{ editedBy: string; memeId: string }>(
    `SELECT edited_by AS "editedBy", meme_id AS "memeId"
       FROM meme_transcription
      WHERE id = $1`,
    [transcriptionId]
  );
  return row ?? null;
}

// One verdict per reviewer per version; changing your mind replaces it.
export async function reviewTranscription(
  transcriptionId: string,
  reviewerId: string,
  verdict: 1 | -1
) {
  await db(
    `INSERT INTO transcription_review (transcription_id, reviewer_id, verdict)
     VALUES ($1, $2, $3)
     ON CONFLICT (transcription_id, reviewer_id)
       DO UPDATE SET verdict = EXCLUDED.verdict, created_at = now()`,
    [transcriptionId, reviewerId, verdict]
  );
}
