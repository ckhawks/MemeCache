-- 014: comments on memes, and notifications about them.
--
-- Comments are flat: each one belongs to a meme, never to another comment, and nobody votes
-- on them. A meme page is a place to react to a meme, not to hold a discussion, so a list in
-- the order things were said is enough.
--
-- A comment is text, another meme ("reply with a meme"), or both. The meme is a reference to
-- a row in meme, not a copy, so it shows its current content warnings and goes away when that
-- meme is deleted. There is deliberately no CHECK that a comment has one or the other: the
-- referenced meme's row can disappear (ON DELETE SET NULL, when its uploader's account is
-- deleted), which would leave an empty comment that such a CHECK would refuse, blocking the
-- delete. The API requires one or the other when writing.
--
-- Deleting is soft. The row and its text stay, for moderators and for the record of what was
-- said, and the page shows "deleted" in its place so the comments around it still read in
-- order. deleted_by tells an author's own delete from a moderator's.
--
-- Editing is allowed for the author within ten minutes of posting (a constant in
-- src/constants/comments.ts, checked in the UPDATE itself). edited_at marks it "edited".

CREATE TABLE meme_comment (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meme_id uuid NOT NULL REFERENCES meme (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  -- Empty when the comment is only a meme. Same cap as the API's.
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 1000),
  -- The meme replied with, if any.
  ref_meme_id uuid REFERENCES meme (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  -- Set null rather than lost if that account goes; deleted_at still says it was deleted.
  deleted_by uuid REFERENCES app_user (id) ON DELETE SET NULL
);

-- A meme's comments, oldest first, and the count on feed cards.
CREATE INDEX meme_comment_meme_idx ON meme_comment (meme_id, created_at, id);

CREATE INDEX meme_comment_author_idx ON meme_comment (author_id);

-- So deleting a meme does not scan every comment for references to it.
CREATE INDEX meme_comment_ref_idx ON meme_comment (ref_meme_id) WHERE ref_meme_id IS NOT NULL;

-- Two new notification kinds:
--   comment      someone commented on your meme.
--   meme_quoted  someone replied with your meme in a comment on another meme. meme_id is the
--                meme they commented on, which is where the notification links.
-- Both name the comment, so each new comment is news even from someone who commented before
-- (notify() treats a row with the same comment as a repeat), and a notification about a
-- comment that was since deleted can be left out when reading.
ALTER TABLE notification
  ADD COLUMN comment_id bigint REFERENCES meme_comment (id) ON DELETE CASCADE;

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
  'meme_quoted'
));
