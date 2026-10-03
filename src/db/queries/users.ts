import { db } from '@/db/db';
import { isUuid } from './ids';

// What goes into the session token.
export interface SessionUser {
  id: string;
  username: string;
  email: string;
  role: string;
}

export interface PublicUser {
  id: string;
  username: string;
}

export interface Profile {
  id: string;
  username: string;
  createdAt: Date | null;
  avatarS3Key: string | null;
}

// Usernames and emails are unique case-insensitively, and looked up the same way.

export async function getUserForLogin(
  email: string
): Promise<(SessionUser & { passwordHash: string }) | null> {
  const [user] = await db<SessionUser & { passwordHash: string }>(
    `SELECT id, username, email, role, password_hash AS "passwordHash"
       FROM app_user
      WHERE lower(email) = lower($1)`,
    [email]
  );
  return user ?? null;
}

export async function isEmailTaken(email: string): Promise<boolean> {
  const rows = await db(`SELECT 1 FROM app_user WHERE lower(email) = lower($1)`, [email]);
  return rows.length > 0;
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const rows = await db(`SELECT 1 FROM app_user WHERE lower(username) = lower($1)`, [username]);
  return rows.length > 0;
}

export async function createUser(user: {
  username: string;
  email: string;
  passwordHash: string;
}): Promise<SessionUser> {
  const [created] = await db<SessionUser>(
    `INSERT INTO app_user (username, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, username, email, role`,
    [user.username, user.email, user.passwordHash]
  );
  return created;
}

// The per-request session check: is the user still there, and what is their role now.
export async function getSessionState(
  id: string
): Promise<{ role: string; lastActive: Date | null } | null> {
  if (!isUuid(id)) {
    return null;
  }
  const [row] = await db<{ role: string; lastActive: Date | null }>(
    `SELECT role, last_active AS "lastActive" FROM app_user WHERE id = $1`,
    [id]
  );
  return row ?? null;
}

export async function touchLastActive(id: string) {
  await db(`UPDATE app_user SET last_active = now() WHERE id = $1`, [id]);
}

export async function listUsers(): Promise<PublicUser[]> {
  return db<PublicUser>(`SELECT id, username FROM app_user ORDER BY lower(username)`);
}

export async function listOnlineUsers(): Promise<PublicUser[]> {
  return db<PublicUser>(
    `SELECT id, username
       FROM app_user
      WHERE last_active >= now() - interval '15 minutes'
      ORDER BY lower(username)`
  );
}

export async function getProfile(username: string): Promise<Profile | null> {
  const [user] = await db<Profile>(
    `SELECT id,
            username,
            created_at AS "createdAt",
            avatar_s3_key AS "avatarS3Key"
       FROM app_user
      WHERE lower(username) = lower($1)`,
    [username]
  );
  return user ?? null;
}

export async function getAvatarKey(userId: string): Promise<string | null> {
  const [row] = await db<{ avatarS3Key: string | null }>(
    `SELECT avatar_s3_key AS "avatarS3Key" FROM app_user WHERE id = $1`,
    [userId]
  );
  return row?.avatarS3Key ?? null;
}

export async function setAvatarKey(userId: string, key: string) {
  await db(`UPDATE app_user SET avatar_s3_key = $1 WHERE id = $2`, [key, userId]);
}

export interface ProfileStats {
  uploads: number;
  likesReceived: number;
  tagsAdded: number;
  transcriptions: number;
  // When they joined, or their first upload for accounts created before that was recorded.
  memberSince: Date | null;
  role: string;
}

// The numbers on a profile header. Counts are subqueries so none multiplies another.
export async function getProfileStats(userId: string): Promise<ProfileStats> {
  const [row] = await db<ProfileStats>(
    `SELECT
       (SELECT count(*)::int FROM meme m WHERE m.uploader_id = u.id AND m.deleted_at IS NULL) AS uploads,
       (SELECT count(*)::int
          FROM meme_like l
          JOIN meme m ON m.id = l.meme_id
         WHERE m.uploader_id = u.id AND m.deleted_at IS NULL AND l.user_id <> u.id) AS "likesReceived",
       (SELECT count(*)::int
          FROM meme_tag mt
          JOIN meme m ON m.id = mt.meme_id
         WHERE mt.added_by = u.id AND m.deleted_at IS NULL) AS "tagsAdded",
       (SELECT count(DISTINCT t.meme_id)::int
          FROM meme_transcription t
          JOIN meme m ON m.id = t.meme_id
         WHERE t.edited_by = u.id AND m.deleted_at IS NULL) AS transcriptions,
       COALESCE(u.created_at, (SELECT min(m.created_at) FROM meme m WHERE m.uploader_id = u.id)) AS "memberSince",
       u.role
     FROM app_user u
     WHERE u.id = $1`,
    [userId]
  );
  return row;
}
