import { db, transaction, type Query } from '@/db/db';
import { isSlug, isUuid } from './ids';
import { STANDS, VERSION_COLUMNS } from './transcriptions';

// Merging a meme uploaded twice into the first copy (migration 021). Everything people did
// on the duplicate moves to the original, and the duplicate is soft deleted pointing at it,
// so its page redirects there.
//
// Where both memes have a row for the same person, the original's is kept and the
// duplicate's stays where it was, on the deleted duplicate: nothing is thrown away, and a
// row that stays behind no longer counts anywhere, because every count and feed skips
// deleted memes. Per table:
//
//   meme_like, meme_save        moved, except a live row when the original has a live one
//                               from the same person. Likes by the original's uploader stay
//                               behind: nobody likes their own meme.
//   meme_content_warning        moved, except a live warning the original already has.
//   meme_tag, meme_tag_vote,    a tag only the duplicate has moves over whole: same adder,
//   tag_vote_history            same votes, same history. For a tag both have, the original's
//                               application is kept, and each vote on the duplicate's moves
//                               to it unless that person voted there already. Their history
//                               rows move with the votes that moved.
//   meme_transcription          moved, with their reviews and history (which hang off the
//                               version), only when the original has no standing text.
//                               Otherwise they stay behind, so the original's text stays
//                               current and the duplicate's versions keep their record.
//   meme_comment                moved, and comments replying with the duplicate now reply
//                               with the original.
//   meme_report                 moved, except an open report when the same person has one
//                               open on the original.
//   meme_view, view_count       the rows move and the original's count gains the
//                               duplicate's.
//   event                       moved, with mergedFrom (the duplicate's id) added to data so
//                               an upload event still says which upload it was.
//   notification                moved, except a like notification the original already has
//                               for the same person and liker.
//   meme.source_url             the original takes the duplicate's when it has none, so an
//                               import of that post finds the original.
//   meme.merged_into            set on the duplicate, and repointed on memes merged into it
//                               earlier, so every redirect is one hop.
//
// Left with the duplicate: queue_skip (skips of that meme), meme_media_hash and
// meme_media_match (its fingerprint and pairs, which feeds skip once it is deleted), and the
// answers and skips about its pairs (meme_match_answer, meme_match_answer_history,
// meme_match_skip), which are the record of how it was found. The moderation log gets one
// meme_merge row, in the same transaction.

export class MergeError extends Error {}

export interface MergeResult {
  originalSlug: string;
  duplicateSlug: string;
  // Rows moved, per table, for the log.
  moved: Record<string, number>;
}

async function countChanged(query: Query, sql: string, params: unknown[]): Promise<number> {
  const [row] = await query<{ n: number }>(
    `WITH changed AS (${sql} RETURNING 1) SELECT count(*)::int AS n FROM changed`,
    params
  );
  return row.n;
}

export async function mergeMemes(
  duplicateId: string,
  originalId: string,
  actorId: string
): Promise<MergeResult> {
  if (!isUuid(duplicateId) || !isUuid(originalId)) {
    throw new MergeError('That meme does not exist.');
  }
  if (duplicateId === originalId) {
    throw new MergeError('A meme cannot be merged into itself.');
  }
  return transaction(async (query) => {
    // Locked, in a fixed order, so two merges of the same pair cannot cross.
    const rows = await query<{
      id: string;
      slug: string;
      uploaderId: string;
      deleted: boolean;
      viewCount: number;
      sourceUrl: string | null;
    }>(
      `SELECT id,
              slug,
              uploader_id AS "uploaderId",
              deleted_at IS NOT NULL AS deleted,
              view_count AS "viewCount",
              source_url AS "sourceUrl"
         FROM meme
        WHERE id = ANY($1::uuid[])
        ORDER BY id
          FOR UPDATE`,
      [[duplicateId, originalId]]
    );
    const duplicate = rows.find((r) => r.id === duplicateId);
    const original = rows.find((r) => r.id === originalId);
    if (!duplicate || duplicate.deleted) {
      throw new MergeError('The duplicate does not exist or was deleted.');
    }
    if (!original || original.deleted) {
      throw new MergeError('The original does not exist or was deleted.');
    }

    const pair = [duplicateId, originalId];
    const moved: Record<string, number> = {};

    moved.likes = await countChanged(
      query,
      `UPDATE meme_like d SET meme_id = $2
        WHERE d.meme_id = $1
          AND d.user_id <> $3
          AND NOT (d.removed_at IS NULL AND EXISTS (
            SELECT 1 FROM meme_like o
             WHERE o.meme_id = $2 AND o.user_id = d.user_id AND o.removed_at IS NULL
          ))`,
      [...pair, original.uploaderId]
    );

    moved.saves = await countChanged(
      query,
      `UPDATE meme_save d SET meme_id = $2
        WHERE d.meme_id = $1
          AND NOT (d.removed_at IS NULL AND EXISTS (
            SELECT 1 FROM meme_save o
             WHERE o.meme_id = $2 AND o.user_id = d.user_id AND o.removed_at IS NULL
          ))`,
      pair
    );

    moved.warnings = await countChanged(
      query,
      `UPDATE meme_content_warning d SET meme_id = $2
        WHERE d.meme_id = $1
          AND NOT (d.removed_at IS NULL AND EXISTS (
            SELECT 1 FROM meme_content_warning o
             WHERE o.meme_id = $2 AND o.warning = d.warning AND o.removed_at IS NULL
          ))`,
      pair
    );

    // Tags only the duplicate has, copied over as they are. The originals are deleted once
    // their votes have moved.
    const copiedTags = (
      await query<{ tagId: string }>(
        `INSERT INTO meme_tag (meme_id, tag_id, added_by, created_at, removed_at, removed_by)
         SELECT $2, d.tag_id, d.added_by, d.created_at, d.removed_at, d.removed_by
           FROM meme_tag d
          WHERE d.meme_id = $1
            AND NOT EXISTS (SELECT 1 FROM meme_tag o WHERE o.meme_id = $2 AND o.tag_id = d.tag_id)
         RETURNING tag_id AS "tagId"`,
        pair
      )
    ).map((r) => r.tagId);
    moved.tags = copiedTags.length;

    // Every vote whose voter has none on the original's tag. The history trigger only fires
    // on a changed vote, so this writes no history of its own.
    const movedVotes = await query<{ tagId: string; voterId: string }>(
      `UPDATE meme_tag_vote d SET meme_id = $2
        WHERE d.meme_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM meme_tag_vote o
             WHERE o.meme_id = $2 AND o.tag_id = d.tag_id AND o.voter_id = d.voter_id
          )
        RETURNING d.tag_id AS "tagId", d.voter_id AS "voterId"`,
      pair
    );
    moved.tagVotes = movedVotes.length;
    await query(
      `UPDATE tag_vote_history h SET meme_id = $2
         FROM unnest($3::uuid[], $4::uuid[]) AS mv (tag_id, voter_id)
        WHERE h.meme_id = $1 AND h.tag_id = mv.tag_id AND h.voter_id = mv.voter_id`,
      [...pair, movedVotes.map((v) => v.tagId), movedVotes.map((v) => v.voterId)]
    );
    await query(`DELETE FROM meme_tag WHERE meme_id = $1 AND tag_id = ANY($2::uuid[])`, [
      duplicateId,
      copiedTags,
    ]);

    const [standing] = await query<{ has: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM (
           SELECT ${VERSION_COLUMNS}
             FROM meme_transcription t
             JOIN app_user u ON u.id = t.edited_by
            WHERE t.meme_id = $1
         ) v
          WHERE ${STANDS}
       ) AS has`,
      [originalId]
    );
    moved.transcriptions = standing.has
      ? 0
      : await countChanged(query, `UPDATE meme_transcription SET meme_id = $2 WHERE meme_id = $1`, pair);

    moved.comments = await countChanged(query, `UPDATE meme_comment SET meme_id = $2 WHERE meme_id = $1`, pair);
    moved.commentRefs = await countChanged(
      query,
      `UPDATE meme_comment SET ref_meme_id = $2 WHERE ref_meme_id = $1`,
      pair
    );

    moved.reports = await countChanged(
      query,
      `UPDATE meme_report d SET meme_id = $2
        WHERE d.meme_id = $1
          AND NOT (d.status = 'open' AND EXISTS (
            SELECT 1 FROM meme_report o
             WHERE o.meme_id = $2 AND o.reporter_id = d.reporter_id AND o.status = 'open'
          ))`,
      pair
    );

    moved.views = await countChanged(query, `UPDATE meme_view SET meme_id = $2 WHERE meme_id = $1`, pair);

    moved.events = await countChanged(
      query,
      `UPDATE event
          SET meme_id = $2,
              data = data || jsonb_build_object('mergedFrom', $1::text)
        WHERE meme_id = $1`,
      pair
    );

    moved.notifications = await countChanged(
      query,
      `UPDATE notification d SET meme_id = $2
        WHERE d.meme_id = $1
          AND NOT (d.kind = 'like' AND EXISTS (
            SELECT 1 FROM notification o
             WHERE o.kind = 'like' AND o.meme_id = $2 AND o.user_id = d.user_id AND o.actor_id = d.actor_id
          ))`,
      pair
    );

    await query(
      `UPDATE meme
          SET view_count = view_count + $2,
              source_url = COALESCE(source_url, $3)
        WHERE id = $1`,
      [originalId, duplicate.viewCount, duplicate.sourceUrl]
    );
    await query(`UPDATE meme SET merged_into = $2 WHERE merged_into = $1`, pair);
    await query(
      `UPDATE meme
          SET deleted_at = now(),
              deleted_by = $3,
              delete_reason = $4,
              merged_into = $2
        WHERE id = $1`,
      [...pair, actorId, `Merged into ${original.slug}`]
    );

    await query(
      `INSERT INTO moderation_action (actor_id, action, target_type, target_id, data)
       VALUES ($1, 'meme_merge', 'meme', $2, $3)`,
      [
        actorId,
        duplicateId,
        JSON.stringify({
          originalId,
          originalSlug: original.slug,
          duplicateSlug: duplicate.slug,
          moved,
        }),
      ]
    );

    return {
      originalSlug: original.slug,
      duplicateSlug: duplicate.slug,
      moved,
    };
  });
}

// Where a merged meme lives now: the slug of the live meme its merged_into leads to, by
// uuid or slug. Null when it was not merged, or what it was merged into is gone too.
export async function getMergedInto(idOrSlug: string): Promise<string | null> {
  const column = isUuid(idOrSlug) ? 'id = $1::uuid' : isSlug(idOrSlug) ? 'slug = $1' : null;
  if (!column) {
    return null;
  }
  // Merges repoint earlier ones, so this is one hop; the walk is for safety, and bounded.
  const [row] = await db<{ slug: string }>(
    `WITH RECURSIVE chain AS (
       SELECT merged_into AS id, 1 AS depth FROM meme WHERE ${column} AND merged_into IS NOT NULL
       UNION ALL
       SELECT m.merged_into, c.depth + 1
         FROM chain c
         JOIN meme m ON m.id = c.id
        WHERE m.merged_into IS NOT NULL AND c.depth < 10
     )
     SELECT m.slug
       FROM chain c
       JOIN meme m ON m.id = c.id
      WHERE m.deleted_at IS NULL
      ORDER BY c.depth
      LIMIT 1`,
    [idOrSlug]
  );
  return row?.slug ?? null;
}
