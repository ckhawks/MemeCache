import { randomUUID } from 'node:crypto';
import { db } from '@/db/db';

export async function resetDatabase() {
  await db(`
    TRUNCATE meme_media_match, meme_media_hash, notification, meme_comment, meme_content_warning,
      meme_report, queue_skip, transcription_review, meme_save, meme_like, meme_tag_vote, meme_tag,
      meme_transcription, tag, meme, app_user, invite_code, username_history, meme_view, tag_preference,
      tag_vote_history, transcription_review_history, event, moderation_action, user_session, user_setting,
      user_follow
  `);
}

export async function makeUser(username: string): Promise<string> {
  const [user] = await db<{ id: string }>(
    `INSERT INTO app_user (username, email, password_hash)
     VALUES ($1, $2, 'not-a-real-hash')
     RETURNING id`,
    [username, `${username}@example.test`]
  );
  return user.id;
}

export async function makeMeme(uploaderId: string, createdAt?: string): Promise<string> {
  const id = randomUUID();
  await db(
    `INSERT INTO meme (id, uploader_id, s3_key, content_type, created_at)
     VALUES ($1, $2, $3, 'image/png', COALESCE($4::timestamptz, now()))`,
    [id, uploaderId, id, createdAt ?? null]
  );
  return id;
}
