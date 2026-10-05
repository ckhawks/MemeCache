-- 018: account foundations. Sessions that can be logged out, a place for per-user settings,
-- deleting an account by anonymising it, and taking a meme down for a copyright claim.
--
-- Sessions. The access token used to be the whole session: a signed 7-day JWT with nothing
-- on the server, so the only way to end one early was to change the user's role. Now every
-- login makes a user_session row and the token carries its id. validateAccessToken already
-- reads the user on every request; it reads the session in the same query and rejects a
-- token whose session is missing or revoked. That is what makes "log out", "log out
-- everywhere else" and the list of devices on the edit page work.
--
--   Tokens issued before this migration have no session id and are rejected, so everyone
--   logs in once more after the deploy. The alternative, letting them run to expiry, would
--   leave up to a week of sessions that no "log out everywhere" can reach. ~15 users and a
--   login form make that a small price.
--
--   last_seen_at is written at most every 5 minutes (src/auth/lib.ts), like last_active.
--   No expiry column: a token lives 7 days from when it was issued, and it is only issued
--   during a request (login, or a rename re-issuing it), which touches last_seen_at. So a
--   session unseen for longer than the token lifetime has no live token, and the list on the
--   edit page leaves it out. Rows are pruned when the same user logs in again.
--
--   network is the address coarsened to its /24 (IPv4) or /48 (IPv6), enough to tell "home"
--   from "somewhere else" without keeping anyone's exact address.
--
-- Settings. user_setting holds one row per user per setting, with a jsonb value, so a new
-- setting needs a default in src/db/queries/settings.ts and no migration. Only choices that
-- differ from the default are stored. app_user.warning_display (migration 007) moves here:
-- the non-default values are copied (a 'blur' row and no row read the same), and the column
-- stays for now but nothing reads or writes it. Drop it in a later migration.
--
-- Deleting an account anonymises it rather than deleting rows. The owner's rule: content
-- only goes away for a takedown. So the app_user row stays, and with it the uploads, tags,
-- transcriptions, comments and votes that point at it, shown as "deleted user". What
-- identifies the person goes: the username becomes deleted-<id prefix>, the email a unique
-- address under .invalid, the password hash null (hence DROP NOT NULL), the avatar, the old
-- names in username_history, their settings, sessions, saves, tag follows and mutes, and
-- the notifications addressed to them. Invite codes they made are disabled. See
-- anonymiseUser in src/db/queries/accounts.ts.
--
--   Several foreign keys to app_user have no ON DELETE rule (meme.uploader_id,
--   meme_tag.added_by, meme_tag_vote.voter_id, meme_transcription.edited_by), so a hard
--   delete of a user who contributed anything would fail. Anonymising never deletes the
--   row, so they stay as they are.
--
--   deleted_by is the user themselves or the admin who did it; deletion_reason is the
--   admin's reason, null when the user deleted their own account.
--
-- Takedowns. A normal delete is soft (deleted_at) and keeps the file, so it can be undone.
-- A takedown, for a DMCA notice or similar, also sets deleted_at, so every feed, count and
-- search already leaves the meme out, but in addition it deletes the file from storage and
-- records why and by whom. The meme page shows a notice saying why it was removed instead of
-- a 404. The row stays for the record. takedown_note is the admin's own detail (who claimed
-- it, a reference number) and is never shown publicly.
--
-- Everything here is additive: new tables, new nullable columns, one copy and one relaxed
-- NOT NULL. The statements are written to be safe to run twice (IF NOT EXISTS, ON
-- CONFLICT), which the tests rely on to check the copy against existing rows.

CREATE TABLE IF NOT EXISTS user_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  -- As the browser sent it at login. The edit page turns it into "Firefox on Windows".
  user_agent text,
  network cidr,
  revoked_at timestamptz
);

-- The edit page's list, and revoking all of a user's other sessions.
CREATE INDEX IF NOT EXISTS user_session_user_idx ON user_session (user_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS user_setting (
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

INSERT INTO user_setting (user_id, key, value)
SELECT id, 'warning_display', to_jsonb(warning_display)
  FROM app_user
 WHERE warning_display <> 'blur'
ON CONFLICT (user_id, key) DO NOTHING;

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES app_user (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deletion_reason text;

ALTER TABLE app_user ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE meme
  ADD COLUMN IF NOT EXISTS taken_down_at timestamptz,
  ADD COLUMN IF NOT EXISTS takedown_reason text
    CHECK (takedown_reason IN ('copyright', 'privacy', 'legal', 'other')),
  ADD COLUMN IF NOT EXISTS takedown_note text,
  ADD COLUMN IF NOT EXISTS taken_down_by uuid REFERENCES app_user (id) ON DELETE SET NULL;
