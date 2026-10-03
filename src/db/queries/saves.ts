import { db } from '@/db/db';

// Saves a meme to the user's Library, or removes it. Idempotent either way:
// (meme_id, user_id) is the primary key.
export async function setSave(memeId: string, userId: string, saved: boolean) {
  if (saved) {
    await db(
      `INSERT INTO meme_save (meme_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [memeId, userId]
    );
  } else {
    await db(`DELETE FROM meme_save WHERE meme_id = $1 AND user_id = $2`, [memeId, userId]);
  }
}
