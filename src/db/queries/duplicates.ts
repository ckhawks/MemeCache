import { db } from '@/db/db';
import { isUuid } from './ids';
import { warningsSql } from './warnings';
import { mutedSql } from './tagPreferences';
import { CONFIRMATIONS_NEEDED, type MatchAnswer } from '@/constants/queue';
import type { RelationKind } from '@/server/mediaHash';
import type { ContentWarning } from '@/constants/contentWarnings';

// Members and moderators judging the pairs the media fingerprints matched (migration 021):
// the same meme uploaded twice, the same template, or not related at all. The queue's
// Duplicates tab asks members; /admin/duplicates lets moderators answer directly and merge
// what is settled as the same meme.

// The CTEs every read here starts from, as `WITH ${matchCtes()} ...`. `filter` narrows the
// answers read, as SQL on the alias `a` (one meme's pairs), and can use the caller's
// parameters. What they define:
//
//   mv_tally    per pair and answer, how many counted people gave it: not either meme's
//               uploader, and not a held user (user_trust, migration 005).
//   mv_verdict  per settled pair, the answer it settled on, and whether a moderator settled
//               it. The newest decisive answer wins; otherwise an answer given by at least
//               CONFIRMATIONS_NEEDED counted people, and by more than any other answer.
//
// Worked out on every read, like the queue's tags and transcriptions, so a hold that starts
// or lifts changes what is settled by itself.
export function matchCtes(filter = 'true') {
  return `
    mv_counted AS (
      SELECT a.meme_id, a.other_id, a.answer
        FROM meme_match_answer a
        JOIN meme mv_a ON mv_a.id = a.meme_id
        JOIN meme mv_b ON mv_b.id = a.other_id
       WHERE ${filter}
         AND a.user_id <> mv_a.uploader_id
         AND a.user_id <> mv_b.uploader_id
         AND a.user_id NOT IN (SELECT user_id FROM user_trust WHERE held)
    ),
    mv_tally AS (
      SELECT meme_id, other_id, answer, count(*)::int AS n
        FROM mv_counted
       GROUP BY meme_id, other_id, answer
    ),
    mv_community AS (
      SELECT t.meme_id, t.other_id, t.answer
        FROM mv_tally t
       WHERE t.n >= ${CONFIRMATIONS_NEEDED}
         AND t.n > ALL (
           SELECT o.n FROM mv_tally o
            WHERE o.meme_id = t.meme_id AND o.other_id = t.other_id AND o.answer <> t.answer
         )
    ),
    mv_moderator AS (
      SELECT DISTINCT ON (a.meme_id, a.other_id) a.meme_id, a.other_id, a.answer
        FROM meme_match_answer a
       WHERE ${filter}
         AND a.decisive
       ORDER BY a.meme_id, a.other_id, a.created_at DESC
    ),
    mv_verdict AS (
      SELECT meme_id,
             other_id,
             COALESCE(mo.answer, c.answer) AS verdict,
             mo.answer IS NOT NULL AS "byModerator"
        FROM mv_moderator mo
        FULL JOIN mv_community c USING (meme_id, other_id)
    )
  `;
}

export interface PairMeme {
  id: string;
  slug: string;
  contentType: string;
  // From JSON, so a string.
  createdAt: string;
  uploaderId: string;
  username: string;
  avatarKey: string | null;
  warnings: ContentWarning[];
  // Likes from others, as on a card.
  likeCount: number;
  hasAudio: boolean | null;
}

export interface MatchPair {
  // The pair's key: the smaller id first, as stored.
  memeId: string;
  otherId: string;
  // What the fingerprints said.
  kind: RelationKind;
  // The two memes, older first.
  memes: [PairMeme, PairMeme];
}

export interface AdminMatchPair extends MatchPair {
  // Null while unsettled.
  verdict: MatchAnswer | null;
  byModerator: boolean;
  // Counted answers so far.
  tally: Record<MatchAnswer, number>;
}

function pairMemeSql(m: string) {
  return `(
    SELECT json_build_object(
      'id', ${m}.id,
      'slug', ${m}.slug,
      'contentType', ${m}.content_type,
      'createdAt', ${m}.created_at,
      'uploaderId', ${m}.uploader_id,
      'username', pu.username,
      'avatarKey', pu.avatar_s3_key,
      'warnings', ${warningsSql(`${m}.id`)},
      'likeCount', (
        SELECT count(*)::int FROM meme_like pl
         WHERE pl.meme_id = ${m}.id AND pl.removed_at IS NULL AND pl.user_id <> ${m}.uploader_id
      ),
      'hasAudio', ${m}.has_audio
    )
      FROM app_user pu
     WHERE pu.id = ${m}.uploader_id
  )`;
}

const PAIR_COLUMNS = `
  x.meme_id AS "memeId",
  x.other_id AS "otherId",
  x.kind,
  ${pairMemeSql('a')} AS a,
  ${pairMemeSql('b')} AS b
`;

const TALLY_COLUMNS = `
  COALESCE((SELECT t.n FROM mv_tally t
             WHERE t.meme_id = x.meme_id AND t.other_id = x.other_id AND t.answer = 'same_meme'), 0) AS "sameMeme",
  COALESCE((SELECT t.n FROM mv_tally t
             WHERE t.meme_id = x.meme_id AND t.other_id = x.other_id AND t.answer = 'same_template'), 0) AS "sameTemplate",
  COALESCE((SELECT t.n FROM mv_tally t
             WHERE t.meme_id = x.meme_id AND t.other_id = x.other_id AND t.answer = 'different'), 0) AS different
`;

type PairRow = Omit<MatchPair, 'memes'> & { a: PairMeme; b: PairMeme };

function toPair<T extends PairRow>(row: T): MatchPair & Omit<T, 'a' | 'b'> {
  const { a, b, ...rest } = row;
  const memes: [PairMeme, PairMeme] = new Date(a.createdAt) <= new Date(b.createdAt) ? [a, b] : [b, a];
  return { ...rest, memes };
}

// Stored pairs between two live memes, with the verdicts joined in as v.
const LIVE_PAIRS = `
  FROM meme_media_match x
  JOIN meme a ON a.id = x.meme_id
  JOIN meme b ON b.id = x.other_id
  LEFT JOIN mv_verdict v ON v.meme_id = x.meme_id AND v.other_id = x.other_id
 WHERE a.deleted_at IS NULL
   AND b.deleted_at IS NULL
`;

// The pairs viewer $1 may answer in the queue: unsettled, neither meme theirs, not answered
// or skipped by them, and no muted tag on either. Likely duplicates first, then the closest.
const QUEUE_PAIRS = `
  ${LIVE_PAIRS}
   AND v.meme_id IS NULL
   AND a.uploader_id <> $1
   AND b.uploader_id <> $1
   AND NOT ${mutedSql('a.id', '$1')}
   AND NOT ${mutedSql('b.id', '$1')}
   AND NOT EXISTS (
     SELECT 1 FROM meme_match_answer q_a
      WHERE q_a.meme_id = x.meme_id AND q_a.other_id = x.other_id AND q_a.user_id = $1
   )
   AND NOT EXISTS (
     SELECT 1 FROM meme_match_skip q_s
      WHERE q_s.meme_id = x.meme_id AND q_s.other_id = x.other_id AND q_s.user_id = $1
   )
`;

export async function nextDuplicatePair(viewerId: string): Promise<MatchPair | null> {
  if (!isUuid(viewerId)) {
    return null;
  }
  const [row] = await db<PairRow>(
    `WITH ${matchCtes()}
     SELECT ${PAIR_COLUMNS}
       ${QUEUE_PAIRS}
      ORDER BY (x.kind = 'duplicate') DESC, x.score DESC, x.created_at, x.meme_id, x.other_id
      LIMIT 1`,
    [viewerId]
  );
  return row ? toPair(row) : null;
}

// For countQueue: how many pairs are waiting for viewer $1, as a scalar SQL expression.
export function countDuplicatePairsSql() {
  return `(
    WITH ${matchCtes()}
    SELECT count(*)::int
      ${QUEUE_PAIRS}
  )`;
}

// The pair as stored (smaller id first), when it is a stored match between two live memes.
// With both uploaders, so a route can keep them from answering.
export async function getMatchPair(
  memeId: string,
  otherId: string
): Promise<{ memeId: string; otherId: string; uploaderIds: [string, string] } | null> {
  if (!isUuid(memeId) || !isUuid(otherId) || memeId === otherId) {
    return null;
  }
  const [first, second] = memeId < otherId ? [memeId, otherId] : [otherId, memeId];
  const [row] = await db<{ memeId: string; otherId: string; aUploader: string; bUploader: string }>(
    `SELECT x.meme_id AS "memeId",
            x.other_id AS "otherId",
            a.uploader_id AS "aUploader",
            b.uploader_id AS "bUploader"
       FROM meme_media_match x
       JOIN meme a ON a.id = x.meme_id
       JOIN meme b ON b.id = x.other_id
      WHERE x.meme_id = $1
        AND x.other_id = $2
        AND a.deleted_at IS NULL
        AND b.deleted_at IS NULL`,
    [first, second]
  );
  return row
    ? {
        memeId: row.memeId,
        otherId: row.otherId,
        uploaderIds: [row.aUploader, row.bUploader],
      }
    : null;
}

// One current answer per person per pair; answering again replaces it. Every new answer and
// every change is also copied to meme_match_answer_history by a trigger. decisive is a
// moderator answering on /admin/duplicates, which settles the pair alone. The ids are put
// in stored order here.
export async function answerMatch(
  memeId: string,
  otherId: string,
  userId: string,
  answer: MatchAnswer,
  decisive = false
) {
  const [first, second] = memeId < otherId ? [memeId, otherId] : [otherId, memeId];
  await db(
    `INSERT INTO meme_match_answer (meme_id, other_id, user_id, answer, decisive)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (meme_id, other_id, user_id)
       DO UPDATE SET answer = EXCLUDED.answer, decisive = EXCLUDED.decisive, created_at = now()`,
    [first, second, userId, answer, decisive]
  );
}

// Takes a pair out of this person's queue for good: nothing new happens to a pair.
export async function skipMatch(userId: string, memeId: string, otherId: string) {
  const [first, second] = memeId < otherId ? [memeId, otherId] : [otherId, memeId];
  await db(
    `INSERT INTO meme_match_skip (user_id, meme_id, other_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, meme_id, other_id) DO UPDATE SET created_at = now()`,
    [userId, first, second]
  );
}

type AdminRow = PairRow & {
  verdict: MatchAnswer | null;
  byModerator: boolean | null;
  sameMeme: number;
  sameTemplate: number;
  different: number;
};

function toAdminPair(row: AdminRow): AdminMatchPair {
  const { sameMeme, sameTemplate, different, ...rest } = toPair(row);
  return {
    ...rest,
    verdict: row.verdict,
    byModerator: !!row.byModerator,
    tally: {
      same_meme: sameMeme,
      same_template: sameTemplate,
      different,
    },
  };
}

// /admin/duplicates. Settled as the same meme: waiting for a merge, oldest stored first.
// Open: not settled yet, likely duplicates first, then the closest.
export async function listAdminPairs(
  view: 'settled' | 'open',
  limit = 100
): Promise<AdminMatchPair[]> {
  const where = view === 'settled' ? `AND v.verdict = 'same_meme'` : `AND v.meme_id IS NULL`;
  const order =
    view === 'settled'
      ? `x.created_at, x.meme_id, x.other_id`
      : `(x.kind = 'duplicate') DESC, x.score DESC, x.created_at, x.meme_id, x.other_id`;
  const rows = await db<AdminRow>(
    `WITH ${matchCtes()}
     SELECT ${PAIR_COLUMNS},
            v.verdict,
            v."byModerator",
            ${TALLY_COLUMNS}
       ${LIVE_PAIRS}
       ${where}
      ORDER BY ${order}
      LIMIT $1`,
    [limit]
  );
  return rows.map(toAdminPair);
}

export async function countAdminPairs(): Promise<{ settled: number; open: number }> {
  const [row] = await db<{ settled: number; open: number }>(
    `WITH ${matchCtes()}
     SELECT count(*) FILTER (WHERE v.verdict = 'same_meme')::int AS settled,
            count(*) FILTER (WHERE v.meme_id IS NULL)::int AS open
       ${LIVE_PAIRS}`
  );
  return row;
}
