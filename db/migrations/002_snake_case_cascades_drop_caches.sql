-- 002: one naming convention, deliberate cascades, and the dead tables gone.
--
-- Rebuilds every table rather than renaming in place. Renames leave the old constraint,
-- index and sequence names behind ("like_pk", "Like_id_seq", "MemeTagVote_memeid_fkey"),
-- and at 193 memes a copy costs nothing.
--
-- What changes:
--   * Unquoted snake_case everywhere. "User" and "Like" become app_user and meme_like,
--     because user and like are reserved words and would still need quoting.
--   * timestamptz instead of timestamp. Every existing value is a UTC wall-clock time:
--     rows written by now() on Neon (UTC) and rows written from JS toISOString() agree to
--     the millisecond. So they convert AT TIME ZONE 'UTC', regardless of the server zone.
--   * Cascades decided on purpose. Deleting a meme takes its likes, tags, votes and
--     transcriptions with it. Deleting a user is refused while they have content (memes,
--     tags, votes, transcriptions), except likes, which go with them.
--   * One like per user per meme, enforced: (meme_id, user_id) is the primary key.
--   * One row per (meme, tag). A second person adding the same tag votes on it instead.
--     Votes reference that row, so removing a tag from a meme removes its votes.
--   * tag.created_by backfilled from whoever first added the tag to a meme.
--   * Gone: Cache and MemeCache (one cache per user, one per meme, no behavior), and
--     RefreshToken (issued, never redeemed). Also the unused deletedAt on Like and User.
--   * meme.deleted_at stays and becomes the delete mechanism: memes are soft-deleted so a
--     takedown can hold content (TODO.md Phase 7).
--   * New ids use gen_random_uuid() (v4). Existing user ids stay v1.
--
-- Checked against production before writing: no duplicate likes, no tag added to a meme
-- by two people, no orphaned votes, no null transcription references, emails unique
-- case-insensitively.

CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'user',
  avatar_s3_key text,
  -- Null for the 14 accounts created before the column was filled in.
  created_at timestamptz DEFAULT now(),
  last_active timestamptz
);

CREATE UNIQUE INDEX app_user_username_lower_key ON app_user (lower(username));
CREATE UNIQUE INDEX app_user_email_lower_key ON app_user (lower(email));

INSERT INTO app_user (id, username, email, password_hash, role, avatar_s3_key, created_at, last_active)
SELECT id,
       username,
       email,
       "passwordHash",
       role,
       "avatarS3Key",
       "createdAt" AT TIME ZONE 'UTC',
       "lastActive" AT TIME ZONE 'UTC'
  FROM "User";

CREATE TABLE meme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id uuid NOT NULL REFERENCES app_user (id),
  s3_key text NOT NULL,
  content_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Feeds page newest first by (created_at, id) and skip deleted memes.
CREATE INDEX meme_feed_idx ON meme (created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX meme_uploader_feed_idx ON meme (uploader_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

INSERT INTO meme (id, uploader_id, s3_key, content_type, created_at, deleted_at)
SELECT id,
       "uploaderUserId",
       "s3Key",
       "contentType",
       "createdAt" AT TIME ZONE 'UTC',
       "deletedAt" AT TIME ZONE 'UTC'
  FROM "Meme";

CREATE TABLE meme_like (
  meme_id uuid NOT NULL REFERENCES meme (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meme_id, user_id)
);

CREATE INDEX meme_like_user_idx ON meme_like (user_id);

INSERT INTO meme_like (meme_id, user_id, created_at)
SELECT "memeId",
       "userId",
       "createdAt" AT TIME ZONE 'UTC'
  FROM "Like"
 WHERE "deletedAt" IS NULL;

CREATE TABLE tag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid REFERENCES app_user (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tag (id, name, created_by, created_at)
SELECT t.id,
       t.name,
       COALESCE(
         t.createdby,
         (SELECT mt.addedby
            FROM "MemeTag" mt
           WHERE mt.tagid = t.id
           ORDER BY mt.createdat
           LIMIT 1)
       ),
       COALESCE(t.createdat AT TIME ZONE 'UTC', now())
  FROM "Tag" t;

CREATE TABLE meme_tag (
  meme_id uuid NOT NULL REFERENCES meme (id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tag (id) ON DELETE CASCADE,
  added_by uuid NOT NULL REFERENCES app_user (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meme_id, tag_id)
);

CREATE INDEX meme_tag_tag_idx ON meme_tag (tag_id);
CREATE INDEX meme_tag_added_by_idx ON meme_tag (added_by);

INSERT INTO meme_tag (meme_id, tag_id, added_by, created_at)
SELECT memeid,
       tagid,
       addedby,
       COALESCE(createdat AT TIME ZONE 'UTC', now())
  FROM "MemeTag";

CREATE TABLE meme_tag_vote (
  meme_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  voter_id uuid NOT NULL REFERENCES app_user (id),
  vote smallint NOT NULL CHECK (vote IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meme_id, tag_id, voter_id),
  FOREIGN KEY (meme_id, tag_id) REFERENCES meme_tag (meme_id, tag_id) ON DELETE CASCADE
);

CREATE INDEX meme_tag_vote_voter_idx ON meme_tag_vote (voter_id);

INSERT INTO meme_tag_vote (meme_id, tag_id, voter_id, vote, created_at)
SELECT memeid,
       tagid,
       voterid,
       vote,
       COALESCE(createdat AT TIME ZONE 'UTC', now())
  FROM "MemeTagVote";

-- Append-only: an edit is a new row, the newest row is the current text.
CREATE TABLE meme_transcription (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  meme_id uuid NOT NULL REFERENCES meme (id) ON DELETE CASCADE,
  text text NOT NULL,
  edited_by uuid NOT NULL REFERENCES app_user (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX meme_transcription_meme_idx ON meme_transcription (meme_id, created_at DESC, id DESC);
CREATE INDEX meme_transcription_edited_by_idx ON meme_transcription (edited_by);

INSERT INTO meme_transcription (id, meme_id, text, edited_by, created_at)
SELECT id,
       meme_id,
       text,
       edited_by,
       COALESCE(created_at AT TIME ZONE 'UTC', now())
  FROM "MemeTranscription";

SELECT setval(
  pg_get_serial_sequence('meme_transcription', 'id'),
  GREATEST((SELECT max(id) FROM meme_transcription), 1)
);

DROP TABLE "MemeTagVote";
DROP TABLE "MemeTag";
DROP TABLE "MemeTranscription";
DROP TABLE "Like";
DROP TABLE "MemeCache";
DROP TABLE "Cache";
DROP TABLE "Tag";
DROP TABLE "Meme";
DROP TABLE "RefreshToken";
DROP TABLE "User";

-- Created last: migration 001 gave the old "Tag" table an index with this name.
CREATE UNIQUE INDEX tag_name_lower_key ON tag (lower(name));
