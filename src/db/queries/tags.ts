import { db } from '@/db/db';
import { isUuid } from './ids';

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
}

export async function listTagsForMeme(memeId: string, viewerId?: string): Promise<MemeTag[]> {
  if (!isUuid(memeId)) {
    return [];
  }
  const viewer = isUuid(viewerId) ? viewerId : null;

  return db<MemeTag>(
    `SELECT t.id,
            t.name,
            (SELECT COALESCE(sum(v.vote), 0)::int
               FROM meme_tag_vote v
              WHERE v.meme_id = mt.meme_id AND v.tag_id = mt.tag_id) AS score,
            mt.added_by AS "addedBy",
            COALESCE(mt.added_by = $2::uuid, false) AS own,
            COALESCE(
              (SELECT v.vote::int
                 FROM meme_tag_vote v
                WHERE v.meme_id = mt.meme_id AND v.tag_id = mt.tag_id AND v.voter_id = $2::uuid),
              0
            ) AS "myVote"
       FROM meme_tag mt
       JOIN tag t ON t.id = mt.tag_id
      WHERE mt.meme_id = $1
      ORDER BY score DESC, t.name`,
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

export async function tagExists(id: string): Promise<boolean> {
  if (!isUuid(id)) {
    return false;
  }
  const rows = await db(`SELECT 1 FROM tag WHERE id = $1`, [id]);
  return rows.length === 1;
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
// upvote. Anyone adding it again is upvoting it.
export async function addTagToMeme(memeId: string, tagId: string, userId: string) {
  await db(
    `INSERT INTO meme_tag (meme_id, tag_id, added_by)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [memeId, tagId, userId]
  );
  await voteOnTag(memeId, tagId, userId, 1);
}
