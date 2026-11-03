-- 023: emoji reactions on memes and on comments.
--
-- Anyone logged in can put an emoji on a meme or a comment, several different ones each
-- (up to REACTIONS_PER_PERSON in src/constants/reactions.ts), and take each back. Tapping an
-- emoji someone already used adds yours to it. Any single standard emoji is allowed; the
-- check that it is one emoji lives in src/constants/reactions.ts (isReactionEmoji), since
-- Postgres has no notion of a grapheme. The CHECK here only caps the length: one emoji with
-- skin tone and joiners is at most a few dozen bytes.
--
-- Custom emoji, Discord style, are a later step. They would be a reaction whose emoji
-- names a row in a custom emoji table, so this text column is the one place that changes.
--
-- Likes stay. A reaction is a reaction, not a vote: it adds nothing to karma, the feeds or
-- trust.
--
-- Soft removal, like likes and saves since migration 017: taking a reaction back stamps
-- removed_at, and reacting with the same emoji again adds a new row. The unique index
-- allows one live row per person per emoji per meme or comment.
--
-- An uploader may react to their own meme and an author to their own comment, unlike likes:
-- a reaction says how they feel, and counts nothing.
--
-- Two new notification kinds, written once per person per meme or comment (notify() treats
-- the same person reacting again, with any emoji, as a repeat):
--   meme_reaction     someone reacted to your meme.
--   comment_reaction  someone reacted to your comment. comment_id is the comment.
--
-- Merging a duplicate meme (migration 021) moves its reactions like its likes; see
-- src/db/queries/merge.ts.
--
-- Additive: two new tables, and two more kinds allowed in notification.

CREATE TABLE meme_reaction (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meme_id uuid NOT NULL REFERENCES meme (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);

CREATE UNIQUE INDEX meme_reaction_live_key ON meme_reaction (meme_id, user_id, emoji)
  WHERE removed_at IS NULL;

-- A meme's reactions in the order they were first given, and the meme_id foreign key.
CREATE INDEX meme_reaction_meme_idx ON meme_reaction (meme_id, created_at);

CREATE INDEX meme_reaction_user_idx ON meme_reaction (user_id);

CREATE TABLE comment_reaction (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  comment_id bigint NOT NULL REFERENCES meme_comment (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);

CREATE UNIQUE INDEX comment_reaction_live_key ON comment_reaction (comment_id, user_id, emoji)
  WHERE removed_at IS NULL;

CREATE INDEX comment_reaction_comment_idx ON comment_reaction (comment_id, created_at);

CREATE INDEX comment_reaction_user_idx ON comment_reaction (user_id);

ALTER TABLE notification DROP CONSTRAINT notification_kind_check;

ALTER TABLE notification ADD CONSTRAINT notification_kind_check CHECK (kind IN (
  'like',
  'meme_tagged',
  'meme_transcribed',
  'transcription_confirmed',
  'transcription_rejected',
  'transcription_fixed',
  'tag_confirmed',
  'tag_removed',
  'comment',
  'meme_quoted',
  'follow',
  'meme_reaction',
  'comment_reaction'
));
