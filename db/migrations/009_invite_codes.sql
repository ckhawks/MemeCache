-- 009: invite codes, replacing the single shared ACCESS_CODE.
--
-- Registration used to check one code from the environment. Anyone who had it could sign
-- up, there was no way to tell who came in through whom, and the only way to stop it was
-- to change it for everybody. Now admins hand out codes from /admin/invites. Each code can
-- have a use limit, an expiry and a note saying who or what it is for, and can be disabled.
-- A "global" code is just one with a high limit or none.
--
-- uses is a counter rather than a count of app_user rows so registration can claim a use
-- with one conditional UPDATE: the row lock makes concurrent signups queue up on it, so a
-- code cannot go past max_uses.
--
-- Codes match case-insensitively, like usernames. Generated ones are uppercase only for
-- that reason; custom ones keep the case the admin typed.
--
-- Until the first code exists, registration still accepts ACCESS_CODE from the
-- environment, so deploying this changes nothing until an admin creates a code. See
-- src/auth/actions.ts.

CREATE TABLE invite_code (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  -- Who or what the code is for. Only admins see it.
  note text,
  -- Null: no limit.
  max_uses integer CHECK (max_uses > 0),
  uses integer NOT NULL DEFAULT 0 CHECK (uses >= 0),
  expires_at timestamptz,
  disabled_at timestamptz,
  created_by uuid REFERENCES app_user (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- The claim in registration already never goes past the limit. This is the backstop.
  CHECK (max_uses IS NULL OR uses <= max_uses)
);

CREATE UNIQUE INDEX invite_code_code_key ON invite_code (lower(code));

-- Which code each account signed up with. Null for accounts from before this migration
-- and for ones that came in on ACCESS_CODE.
ALTER TABLE app_user
  ADD COLUMN invited_by_code_id uuid REFERENCES invite_code (id) ON DELETE SET NULL;

CREATE INDEX app_user_invited_by_code_id_idx ON app_user (invited_by_code_id)
  WHERE invited_by_code_id IS NOT NULL;
