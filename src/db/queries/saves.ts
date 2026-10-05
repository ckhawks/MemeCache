import { db } from '@/db/db';

// Saves a meme to the user's Library, or removes it. Idempotent either way. Like likes
// (migration 017), removing stamps removed_at and saving again adds a new row.
export async function setSave(memeId: string, userId: string, saved: boolean) {
  if (saved) {
    await db(
      `INSERT INTO meme_save (meme_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [memeId, userId]
    );
  } else {
    await db(
      `UPDATE meme_save
          SET removed_at = now()
        WHERE meme_id = $1 AND user_id = $2 AND removed_at IS NULL`,
      [memeId, userId]
    );
  }
}
