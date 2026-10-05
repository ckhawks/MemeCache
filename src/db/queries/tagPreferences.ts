import { db } from '@/db/db';
import { isUuid } from './ids';

// Following and muting tags (migration 016). A member either follows a tag, mutes it, or
// neither; never both.

export type TagPreference = 'follow' | 'mute';

// True when meme `memeColumn` carries a tag that `viewerParam` muted and that stands on it
// (net counted score of at least 1, the tag page's rule). Every feed that hides muted memes
// adds `AND NOT ${mutedSql(...)}`. A null viewer has no mutes, so nothing is hidden.
export function mutedSql(memeColumn: string, viewerParam: string) {
  return `EXISTS (
    SELECT 1
      FROM tag_preference p
      JOIN meme_tag mt ON mt.tag_id = p.tag_id AND mt.meme_id = ${memeColumn}
     WHERE p.user_id = ${viewerParam}::uuid
       AND p.kind = 'mute'
       AND mt.removed_at IS NULL
       AND (SELECT COALESCE(sum(v.vote), 0)
              FROM counted_tag_vote v
             WHERE v.meme_id = mt.meme_id AND v.tag_id = mt.tag_id) >= 1
  )`;
}

// Follows, mutes, or clears. Idempotent: (user_id, tag_id) is the key, so following a muted
// tag unmutes it and the other way round.
export async function setTagPreference(userId: string, tagId: string, kind: TagPreference | null) {
  if (kind) {
    await db(
      `INSERT INTO tag_preference (user_id, tag_id, kind)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, tag_id) DO UPDATE
         SET kind = EXCLUDED.kind,
             created_at = CASE
               WHEN tag_preference.kind = EXCLUDED.kind THEN tag_preference.created_at
               ELSE now()
             END`,
      [userId, tagId, kind]
    );
  } else {
    await db(`DELETE FROM tag_preference WHERE user_id = $1 AND tag_id = $2`, [userId, tagId]);
  }
}

export interface TagWithPreference {
  id: string;
  name: string;
  // The viewer's follow or mute. Null for none, and always for visitors.
  preference: TagPreference | null;
}

// A tag by name (case-insensitively), with the viewer's follow or mute. Null when no such
// tag exists.
export async function getTagWithPreference(
  name: string,
  viewerId?: string
): Promise<TagWithPreference | null> {
  const [row] = await db<TagWithPreference>(
    `SELECT t.id,
            t.name,
            (SELECT p.kind FROM tag_preference p WHERE p.tag_id = t.id AND p.user_id = $2::uuid)
              AS preference
       FROM tag t
      WHERE lower(t.name) = lower($1)`,
    [name, isUuid(viewerId) ? viewerId : null]
  );
  return row ?? null;
}

export async function tagExists(tagId: string): Promise<boolean> {
  if (!isUuid(tagId)) {
    return false;
  }
  const [row] = await db(`SELECT 1 FROM tag WHERE id = $1`, [tagId]);
  return !!row;
}

// The viewer's follows and mutes for a set of tags, by tag id. Tags with neither are left out.
export async function getTagPreferences(
  viewerId: string | undefined,
  tagIds: string[]
): Promise<Record<string, TagPreference>> {
  if (!isUuid(viewerId) || tagIds.length === 0) {
    return {};
  }
  const rows = await db<{ tagId: string; kind: TagPreference }>(
    `SELECT tag_id AS "tagId", kind
       FROM tag_preference
      WHERE user_id = $1 AND tag_id = ANY($2::uuid[])`,
    [viewerId, tagIds]
  );
  return Object.fromEntries(rows.map((r) => [r.tagId, r.kind]));
}

export interface PreferredTag {
  id: string;
  name: string;
  kind: TagPreference;
}

// Everything the user follows or mutes, by name, for "Your tags".
export async function listTagPreferences(userId: string): Promise<PreferredTag[]> {
  if (!isUuid(userId)) {
    return [];
  }
  return db<PreferredTag>(
    `SELECT t.id, t.name, p.kind
       FROM tag_preference p
       JOIN tag t ON t.id = p.tag_id
      WHERE p.user_id = $1
      ORDER BY p.kind, lower(t.name)`,
    [userId]
  );
}
