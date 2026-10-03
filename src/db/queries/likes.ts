import { db } from '@/db/db';

// Sets the like to the requested state and returns the meme's new like count. Liking twice
// or unliking something never liked are both no-ops: (meme_id, user_id) is the primary key.
export async function setLike(memeId: string, userId: string, liked: boolean): Promise<number> {
  if (liked) {
    await db(
      `INSERT INTO meme_like (meme_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [memeId, userId]
    );
  } else {
    await db(`DELETE FROM meme_like WHERE meme_id = $1 AND user_id = $2`, [memeId, userId]);
  }

  const [row] = await db<{ count: number }>(
    `SELECT count(*)::int AS count FROM meme_like WHERE meme_id = $1`,
    [memeId]
  );
  return row.count;
}
