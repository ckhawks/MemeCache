import { db } from '@/db/db';

// Sets the like to the requested state and returns the meme's new like count. Liking twice
// or unliking something never liked are both no-ops.
//
// An unlike keeps the row and stamps removed_at (migration 017); liking again adds a new
// row, so each like keeps its own dates. The unique index over live rows allows one live
// like per person per meme, and every count reads live rows only. The like route stops
// uploaders liking their own memes; the count leaves out any from before that rule.
export async function setLike(memeId: string, userId: string, liked: boolean): Promise<number> {
  if (liked) {
    await db(
      `INSERT INTO meme_like (meme_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [memeId, userId]
    );
  } else {
    await db(
      `UPDATE meme_like
          SET removed_at = now()
        WHERE meme_id = $1 AND user_id = $2 AND removed_at IS NULL`,
      [memeId, userId]
    );
  }

  const [row] = await db<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM meme_like l
       JOIN meme m ON m.id = l.meme_id
      WHERE l.meme_id = $1 AND l.removed_at IS NULL AND l.user_id <> m.uploader_id`,
    [memeId]
  );
  return row.count;
}
