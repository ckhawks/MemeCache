-- 011: changing your username, and remembering what it used to be.
--
-- Every change is a row. The history does three jobs:
--
--   cooldown     one change per 30 days, timed from the user's last row (not counting
--                renames an admin made for them).
--   reservation  an old name stays blocked for everyone else for 90 days, so nobody can
--                pick it up and pass as the person who just left it. The user it belonged
--                to can always take it back.
--   redirects    /me/<old name> sends visitors to the profile it now belongs to, for as long
--                as nobody currently holds that name.
--
-- The 30 and 90 day windows are constants in src/db/queries/usernames.ts, not stored here.
-- Rows go with the user when the account is deleted, which also frees their old names.

CREATE TABLE username_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  old_username text NOT NULL,
  new_username text NOT NULL,
  -- An admin renamed them. Does not start their cooldown.
  by_admin boolean NOT NULL DEFAULT false,
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- The cooldown and the profile's name history.
CREATE INDEX username_history_user_idx ON username_history (user_id, changed_at);

-- Redirect and reservation lookups, which match case-insensitively like app_user does.
CREATE INDEX username_history_old_lower_idx ON username_history (lower(old_username));
