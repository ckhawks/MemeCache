import { transaction } from '@/db/db';
import { isUuid } from './ids';
import { DELETED_USERNAME_PREFIX } from '@/auth/username';

// Deleting an account (migration 018). Nothing is hard-deleted: the app_user row stays so
// everything that points at it (uploads, tags, transcriptions, comments, votes) stays too,
// shown as "deleted user". What identifies the person is removed or replaced, and the
// account can never log in again.

export type AnonymiseResult =
  | { ok: true; username: string; avatarKey: string | null }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'already-deleted' };

// Anonymises a user. `deletedBy` is the user themselves or the admin doing it; `reason` is
// the admin's, null for someone deleting their own account.
//
// Returns the placeholder name and the avatar key the user had, so the caller can delete
// the avatar file once this has committed (storage is not transactional, so it goes after).
export async function anonymiseUser(options: {
  userId: string;
  deletedBy: string;
  reason?: string | null;
}): Promise<AnonymiseResult> {
  if (!isUuid(options.userId)) {
    return { ok: false, reason: 'not-found' };
  }
  return transaction(async (query) => {
    const [user] = await query<{ deletedAt: Date | null; avatarKey: string | null }>(
      `SELECT deleted_at AS "deletedAt", avatar_s3_key AS "avatarKey"
         FROM app_user
        WHERE id = $1
          FOR UPDATE`,
      [options.userId]
    );
    if (!user) {
      return { ok: false, reason: 'not-found' } as const;
    }
    if (user.deletedAt) {
      return { ok: false, reason: 'already-deleted' } as const;
    }

    // deleted-<first 8 hex digits of the id>. The id is unique, but 8 digits of it might
    // not be, so on the rare clash the whole id is used. Nobody else can pick a name with
    // this prefix (usernameProblem, isUsernameTaken), so it stays theirs for good.
    const hex = options.userId.replace(/-/g, '');
    let username = DELETED_USERNAME_PREFIX + hex.slice(0, 8);
    const clash = await query(
      `SELECT 1 FROM app_user WHERE lower(username) = lower($1) AND id <> $2`,
      [username, options.userId]
    );
    if (clash.length > 0) {
      username = DELETED_USERNAME_PREFIX + hex;
    }

    // The email is replaced with one that is unique (the id is in it) and can never be
    // delivered (.invalid is reserved for that, RFC 2606). The role goes back to user and
    // the trust override is cleared: a deleted account holds no powers.
    await query(
      `UPDATE app_user
          SET username = $2,
              email = $3,
              password_hash = NULL,
              avatar_s3_key = NULL,
              role = 'user',
              trust_override = NULL,
              last_active = NULL,
              deleted_at = now(),
              deleted_by = $4,
              deletion_reason = $5
        WHERE id = $1`,
      [
        options.userId,
        username,
        `${hex}@deleted.invalid`,
        options.deletedBy,
        options.reason ?? null,
      ]
    );

    // Their old names would tie the placeholder back to who they were, so the history goes.
    // That also frees those names straight away rather than holding them for 90 days.
    await query(`DELETE FROM username_history WHERE user_id = $1`, [options.userId]);

    // Logged out everywhere.
    await query(
      `UPDATE user_session SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [options.userId]
    );

    // What was only ever theirs: settings, saves (private), tag follows and mutes, queue
    // skips, and notifications addressed to them. Notifications about what they did to
    // others stay, and show "deleted user".
    await query(`DELETE FROM user_setting WHERE user_id = $1`, [options.userId]);
    await query(`DELETE FROM meme_save WHERE user_id = $1`, [options.userId]);
    await query(`DELETE FROM tag_preference WHERE user_id = $1`, [options.userId]);
    await query(`DELETE FROM queue_skip WHERE user_id = $1`, [options.userId]);
    await query(`DELETE FROM notification WHERE user_id = $1`, [options.userId]);

    // Which memes they looked at. The views still count; they are no longer theirs.
    await query(`UPDATE meme_view SET viewer_id = NULL WHERE viewer_id = $1`, [options.userId]);

    // Codes they handed out stop working. Accounts that already came in on them stay.
    await query(
      `UPDATE invite_code SET disabled_at = now() WHERE created_by = $1 AND disabled_at IS NULL`,
      [options.userId]
    );

    return { ok: true, username, avatarKey: user.avatarKey } as const;
  });
}
