import { db } from '@/db/db';
import { isUuid } from './ids';
import { isUsernameReserved } from './usernames';
import { isDeletedUsername } from '@/auth/username';

// What goes into the session token, apart from the session's own id.
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
  // Set when the account was deleted (anonymised, migration 018). The profile is a tombstone.
  deletedAt: Date | null;
}

// Usernames and emails are unique case-insensitively, and looked up the same way.

// A deleted account has no password and is never returned, so it cannot log in.
export async function getUserForLogin(
  email: string
): Promise<(SessionUser & { passwordHash: string }) | null> {
  const [user] = await db<SessionUser & { passwordHash: string }>(
    `SELECT id, username, email, role, password_hash AS "passwordHash"
       FROM app_user
      WHERE lower(email) = lower($1)
        AND deleted_at IS NULL
        AND password_hash IS NOT NULL`,
    [email]
  );
  return user ?? null;
}

// For confirming it is really them before something drastic, like deleting the account.
export async function getPasswordHash(userId: string): Promise<string | null> {
  if (!isUuid(userId)) {
    return null;
  }
  const [row] = await db<{ passwordHash: string | null }>(
    `SELECT password_hash AS "passwordHash" FROM app_user WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  return row?.passwordHash ?? null;
}

export async function isEmailTaken(email: string): Promise<boolean> {
  const rows = await db(`SELECT 1 FROM app_user WHERE lower(email) = lower($1)`, [email]);
  return rows.length > 0;
}

// In use, or given up recently by someone who has a while to take it back (migration 011).
// Names that look like a deleted account's (migration 018) are never available.
export async function isUsernameTaken(username: string): Promise<boolean> {
  if (isDeletedUsername(username)) {
    return true;
  }
  const rows = await db(`SELECT 1 FROM app_user WHERE lower(username) = lower($1)`, [username]);
  return rows.length > 0 || (await isUsernameReserved(username));
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

// Is the user still there, and what are their role and name now. The name can change after
// the token was issued (migration 011). The per-request check is checkSession in
// sessions.ts, which also looks at the session row.
export async function getSessionState(
  id: string
): Promise<{ role: string; username: string; lastActive: Date | null } | null> {
  if (!isUuid(id)) {
    return null;
  }
  const [row] = await db<{ role: string; username: string; lastActive: Date | null }>(
    `SELECT role, username, last_active AS "lastActive" FROM app_user WHERE id = $1`,
    [id]
  );
  return row ?? null;
}

export async function listUsers(): Promise<PublicUser[]> {
  return db<PublicUser>(`SELECT id, username FROM app_user ORDER BY lower(username)`);
}

export interface OnlineUser extends PublicUser {
  avatarKey: string | null;
  karma: number;
}

export async function listOnlineUsers(): Promise<OnlineUser[]> {
  return db<OnlineUser>(
    `SELECT u.id, u.username, u.avatar_s3_key AS "avatarKey", ${karmaSql('u.id')} AS karma
       FROM app_user u
      WHERE u.last_active >= now() - interval '15 minutes'
      ORDER BY lower(u.username)`
  );
}

export async function getProfile(username: string): Promise<Profile | null> {
  const [user] = await db<Profile>(
    `SELECT id,
            username,
            created_at AS "createdAt",
            avatar_s3_key AS "avatarS3Key",
            deleted_at AS "deletedAt"
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

// Karma: what other people have given a user's contributions, never counting their own,
// and never held users' votes (the counted_* views). Can go negative. Two parts:
//   post karma      likes on their memes
//   curation karma  net votes on tags they added, plus confirms minus rejects of their
//                   transcriptions
// docs/xp-levels.md has the full design. `userId` is a SQL expression (a column or
// parameter), so feeds can select it per row. Inner aliases are prefixed so they never
// shadow the caller's (a feed's `m.uploader_id`).
export function postKarmaSql(userId: string) {
  return `(
    SELECT count(*)::int
      FROM meme_like k_l
      JOIN meme k_m ON k_m.id = k_l.meme_id
     WHERE k_m.uploader_id = ${userId} AND k_m.deleted_at IS NULL AND k_l.user_id <> ${userId}
  )`;
}

export function curationKarmaSql(userId: string) {
  return `(
    (SELECT COALESCE(sum(k_v.vote), 0)::int
       FROM counted_tag_vote k_v
       JOIN meme_tag k_mt ON k_mt.meme_id = k_v.meme_id AND k_mt.tag_id = k_v.tag_id
       JOIN meme k_m ON k_m.id = k_mt.meme_id
      WHERE k_mt.added_by = ${userId} AND k_m.deleted_at IS NULL AND k_v.voter_id <> ${userId})
  + (SELECT COALESCE(sum(k_r.verdict), 0)::int
       FROM counted_transcription_review k_r
       JOIN meme_transcription k_t ON k_t.id = k_r.transcription_id
       JOIN meme k_m ON k_m.id = k_t.meme_id
      WHERE k_t.edited_by = ${userId} AND k_m.deleted_at IS NULL AND k_r.reviewer_id <> ${userId})
  )`;
}

export function karmaSql(userId: string) {
  return `(${postKarmaSql(userId)} + ${curationKarmaSql(userId)})`;
}

export async function getKarma(userId: string): Promise<number> {
  if (!isUuid(userId)) {
    return 0;
  }
  const [row] = await db<{ karma: number }>(`SELECT ${karmaSql('$1::uuid')} AS karma`, [userId]);
  return Number(row.karma);
}

export interface KarmaBreakdown {
  post: number;
  curation: number;
}

export async function getKarmaBreakdown(userId: string): Promise<KarmaBreakdown> {
  if (!isUuid(userId)) {
    return { post: 0, curation: 0 };
  }
  const [row] = await db<KarmaBreakdown>(
    `SELECT ${postKarmaSql('$1::uuid')} AS post, ${curationKarmaSql('$1::uuid')} AS curation`,
    [userId]
  );
  return row;
}

export interface Trust {
  approved: number;
  rejected: number;
  override: 'trusted' | 'held' | null;
  held: boolean;
}

// See migration 005: held users' votes do not count and their work waits for a vouch.
export async function getTrust(userId: string): Promise<Trust> {
  const [row] = await db<Trust>(
    `SELECT approved, rejected, trust_override AS override, held
       FROM user_trust
      WHERE user_id = $1`,
    [userId]
  );
  return row ?? { approved: 0, rejected: 0, override: null, held: false };
}

export async function setTrustOverride(userId: string, override: 'trusted' | 'held' | null) {
  await db(`UPDATE app_user SET trust_override = $2 WHERE id = $1`, [userId, override]);
}
