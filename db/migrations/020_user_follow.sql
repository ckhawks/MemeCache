-- 020: following other members, for Explore's "For you" and a follower count on profiles.
--
-- One row per member per person they follow. The key is (follower_id, followee_id), so
-- following twice is the same row; unfollowing deletes it. Nobody follows themselves.
--
--   For you   memes uploaded by people the viewer follows join the first part of the feed,
--             next to memes with a followed tag (migration 016), with the person named on
--             the card as the reason. The viewer's own uploads are never in that part.
--   Profiles  show how many followers someone has. Who they are is not listed anywhere.
--
-- Deleting an account (migration 018) deletes its follows in both directions, along with the
-- follow notifications it caused (anonymiseUser in src/db/queries/accounts.ts).
--
-- A new notification kind, 'follow': someone followed you. It is about a person, not a meme,
-- so notification.meme_id may now be null, and a check keeps it null for exactly that kind.
-- notify() writes one per follower, ever: unfollowing and following again is not news twice.
--
-- Everything here is additive: a new table and index, a relaxed NOT NULL, a kind added to
-- the kind check, and a check every existing row already passes.

CREATE TABLE user_follow (
  follower_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);

-- Follower counts on profiles.
CREATE INDEX user_follow_followee_idx ON user_follow (followee_id);

ALTER TABLE notification ALTER COLUMN meme_id DROP NOT NULL;

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
  'follow'
));

-- Every kind but follow is about a meme.
ALTER TABLE notification ADD CONSTRAINT notification_meme_check
  CHECK ((kind = 'follow') = (meme_id IS NULL));
