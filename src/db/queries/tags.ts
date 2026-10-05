import { db } from '@/db/db';
import { isUuid } from './ids';
import { warningsSql } from './warnings';
import type { ContentWarning } from '@/constants/contentWarnings';

export interface MemeTag {
  id: string;
  name: string;
  // Net of all votes, including the automatic +1 from whoever added it.
  score: number;
  addedBy: string;
  // The viewer added this tag to this meme.
  own: boolean;
  // The viewer's vote: 1, -1, or 0 for none.
  myVote: number;
  // The viewer added it and nobody else has upvoted it yet, so they may take it back.
  removable: boolean;
}

// Someone besides the adder has upvoted this tag on this meme (alias mt). From then on the
// tag is not only the adder's, and removing it would throw away that vote.
const OTHERS_UPVOTED = `EXISTS (
  SELECT 1 FROM meme_tag_vote v
   WHERE v.meme_id = mt.meme_id AND v.tag_id = mt.tag_id
     AND v.voter_id <> mt.added_by AND v.vote = 1
)`;

export async function listTagsForMeme(memeId: string, viewerId?: string): Promise<MemeTag[]> {
  if (!isUuid(memeId)) {
    return [];
  }
  const viewer = isUuid(viewerId) ? viewerId : null;

  // Scores leave out held users' votes (counted_tag_vote), so a held user's tag starts at
  // 0 rather than their own +1, and stays hidden from everyone else until someone upvotes it.
  return db<MemeTag>(
    `SELECT id, name, score, "addedBy", own, "myVote", own AND NOT "othersUpvoted" AS removable FROM (
     SELECT t.id,
            t.name,
            (SELECT COALESCE(sum(v.vote), 0)::int
               FROM counted_tag_vote v
              WHERE v.meme_id = mt.meme_id AND v.tag_id = mt.tag_id) AS score,
            mt.added_by AS "addedBy",
            COALESCE(mt.added_by = $2::uuid, false) AS own,
            COALESCE(
              (SELECT v.vote::int
                 FROM meme_tag_vote v
                WHERE v.meme_id = mt.meme_id AND v.tag_id = mt.tag_id AND v.voter_id = $2::uuid),
              0
            ) AS "myVote",
            (SELECT held FROM user_trust WHERE user_id = mt.added_by) AS "adderHeld",
            ${OTHERS_UPVOTED} AS "othersUpvoted"
       FROM meme_tag mt
       JOIN tag t ON t.id = mt.tag_id
      WHERE mt.meme_id = $1
     ) tags
     WHERE score >= 1 OR NOT "adderHeld" OR own
     ORDER BY score DESC, name`,
    [memeId, viewer]
  );
}

// Tag names are unique case-insensitively. Returns the existing tag's id if there is one.
export async function findOrCreateTag(name: string, createdBy: string): Promise<string> {
  await db(
    `INSERT INTO tag (name, created_by)
     VALUES ($1, $2)
     ON CONFLICT ((lower(name))) DO NOTHING`,
    [name, createdBy]
  );
  const [tag] = await db<{ id: string }>(`SELECT id FROM tag WHERE lower(name) = lower($1)`, [
    name,
  ]);
  return tag.id;
}

// Who added this tag to this meme, or null if the meme does not carry it.
export async function getTagAdder(memeId: string, tagId: string): Promise<string | null> {
  if (!isUuid(memeId) || !isUuid(tagId)) {
    return null;
  }
  const [row] = await db<{ addedBy: string }>(
    `SELECT added_by AS "addedBy" FROM meme_tag WHERE meme_id = $1 AND tag_id = $2`,
    [memeId, tagId]
  );
  return row?.addedBy ?? null;
}

export async function voteOnTag(memeId: string, tagId: string, voterId: string, vote: 1 | -1) {
  await db(
    `INSERT INTO meme_tag_vote (meme_id, tag_id, voter_id, vote)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (meme_id, tag_id, voter_id) DO UPDATE SET vote = EXCLUDED.vote`,
    [memeId, tagId, voterId, vote]
  );
}

// One row per (meme, tag). The first person to add it is its adder and gets an automatic
// upvote. Anyone adding it again is upvoting it. Returns true when the tag was new on this
// meme, false when this was an upvote.
export async function addTagToMeme(memeId: string, tagId: string, userId: string): Promise<boolean> {
  const inserted = await db(
    `INSERT INTO meme_tag (meme_id, tag_id, added_by)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING
     RETURNING tag_id`,
    [memeId, tagId, userId]
  );
  await voteOnTag(memeId, tagId, userId, 1);
  return inserted.length > 0;
}

export interface TagSuggestion {
  id: string;
  name: string;
  // Memes where the tag stands (net score of at least 1), the same rule as the tag page.
  uses: number;
}

// Autocomplete for the tag field. Names starting with the query come first, then names
// containing it, each most-used first. An empty query returns the most-used tags.
export async function searchTags(query: string, limit = 8): Promise<TagSuggestion[]> {
  // The query is matched literally, so LIKE's own wildcards are escaped.
  const pattern = query.trim().toLowerCase().replace(/[\\%_]/g, (c) => '\\' + c);
  return db<TagSuggestion>(
    `SELECT t.id,
            t.name,
            (SELECT count(*)::int
               FROM meme_tag mt
               JOIN meme m ON m.id = mt.meme_id
              WHERE mt.tag_id = t.id
                AND m.deleted_at IS NULL
                AND (SELECT COALESCE(sum(v.vote), 0)
                       FROM counted_tag_vote v
                      WHERE v.meme_id = mt.meme_id AND v.tag_id = mt.tag_id) >= 1) AS uses
       FROM tag t
      WHERE lower(t.name) LIKE '%' || $1 || '%'
      ORDER BY lower(t.name) LIKE $1 || '%' DESC, uses DESC, lower(t.name)
      LIMIT $2`,
    [pattern, limit]
  );
}

export async function hasOthersUpvote(memeId: string, tagId: string): Promise<boolean> {
  const [row] = await db<{ upvoted: boolean }>(
    `SELECT ${OTHERS_UPVOTED} AS upvoted
       FROM meme_tag mt
      WHERE mt.meme_id = $1 AND mt.tag_id = $2`,
    [memeId, tagId]
  );
  return row?.upvoted ?? false;
}

// Takes a tag off a meme, with its votes. A tag left on no meme at all goes too, so a typo
// does not linger in the suggestions.
export async function removeTagFromMeme(memeId: string, tagId: string) {
  await db(`DELETE FROM meme_tag WHERE meme_id = $1 AND tag_id = $2`, [memeId, tagId]);
  await db(
    `DELETE FROM tag t
      WHERE t.id = $1
        AND NOT EXISTS (SELECT 1 FROM meme_tag mt WHERE mt.tag_id = t.id)`,
    [tagId]
  );
}

export interface TagRow {
  id: string;
  name: string;
  // Memes where the tag stands (net score of at least 1), as on its tag page.
  uses: number;
  memes: { id: string; slug: string; contentType: string; warnings: ContentWarning[] }[];
}

// The browse page: tags in a seeded shuffle (the same seed gives the same order on every
// page), each with its most-liked memes. Only tags on at least `minMemes` memes, so a row
// is never one lonely thumbnail.
export async function listTagRows(options: {
  seed: string;
  page?: number;
  tagsPerPage?: number;
  memesPerTag?: number;
  minMemes?: number;
}): Promise<{ rows: TagRow[]; nextPage: number | null }> {
  const tagsPerPage = options.tagsPerPage ?? 8;
  const page = Math.max(0, Math.floor(options.page ?? 0));
  const rows = await db<TagRow>(
    `WITH standing AS (
       SELECT mt.tag_id, m.id, m.slug, m.content_type, m.created_at,
              (SELECT count(*) FROM meme_like l WHERE l.meme_id = m.id) AS likes
         FROM meme_tag mt
         JOIN meme m ON m.id = mt.meme_id
        WHERE m.deleted_at IS NULL
          AND (SELECT COALESCE(sum(v.vote), 0)
                 FROM counted_tag_vote v
                WHERE v.meme_id = mt.meme_id AND v.tag_id = mt.tag_id) >= 1
     ),
     picked AS (
       SELECT t.id, t.name, count(*)::int AS uses
         FROM tag t
         JOIN standing s ON s.tag_id = t.id
        GROUP BY t.id
       HAVING count(*) >= $2
        ORDER BY md5(t.id::text || $1), t.id
        LIMIT $3 OFFSET $4
     )
     SELECT p.id,
            p.name,
            p.uses,
            (SELECT json_agg(json_build_object(
                      'id', r.id,
                      'slug', r.slug,
                      'contentType', r.content_type,
                      'warnings', ${warningsSql('r.id')}
                    ))
               FROM (
                 SELECT s.id, s.slug, s.content_type
                   FROM standing s
                  WHERE s.tag_id = p.id
                  ORDER BY s.likes DESC, s.created_at DESC
                  LIMIT $5
               ) r) AS memes
       FROM picked p
      ORDER BY md5(p.id::text || $1), p.id`,
    [
      options.seed,
      options.minMemes ?? 2,
      tagsPerPage + 1,
      page * tagsPerPage,
      options.memesPerTag ?? 6,
    ]
  );
  const hasMore = rows.length > tagsPerPage;
  return { rows: rows.slice(0, tagsPerPage), nextPage: hasMore ? page + 1 : null };
}
