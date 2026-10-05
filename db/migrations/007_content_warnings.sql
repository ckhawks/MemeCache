-- 007: content warnings on memes, and how each user wants warned memes shown.
--
-- NSFW is allowed as long as it is labelled. A warning is a fixed type (NSFW, gore,
-- flashing lights, spoiler) rather than a tag: tags are open-ended and voted on, while a
-- warning has to be easy to add, cannot be voted away, and changes how the meme is shown
-- (blurred until someone chooses to look). The types live in one constant,
-- src/constants/contentWarnings.ts. There is no CHECK on the column, so adding a type is a
-- code change and needs no migration; the API refuses anything not in that list.
--
-- Every warning is a row naming who added it, like tags. The uploader can set them on
-- upload and any member can add one afterwards, since being over-cautious costs little.
-- Removing deletes the row; only whoever added it, or a moderator, can. added_by is kept
-- nullable and set null when that account goes, so a warning outlives the person who added
-- it instead of a deleted account quietly unlabelling a meme.

CREATE TABLE meme_content_warning (
  meme_id uuid NOT NULL REFERENCES meme (id) ON DELETE CASCADE,
  warning text NOT NULL,
  added_by uuid REFERENCES app_user (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meme_id, warning)
);

-- How a member sees warned memes: 'blur' until clicked, 'hover' to show while the pointer
-- is over it (touch screens have no hover, so there it is a tap like 'blur'), or 'show' to
-- never blur. Visitors who are not logged in always get 'blur'.
ALTER TABLE app_user
  ADD COLUMN warning_display text NOT NULL DEFAULT 'blur'
    CHECK (warning_display IN ('blur', 'hover', 'show'));
