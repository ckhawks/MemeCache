-- 003: saved memes, which is what Library was always meant to show.
--
-- Library used to list your own uploads, the same feed as your profile. The old caches
-- never added anything: one per user, every meme in its uploader's cache, no way to add
-- someone else's meme (checked against the 2026-08-09 backup before migration 002 dropped
-- them).
--
-- A save is private, unlike a like. If named collections come back, they can hang off this
-- table (a collection_id) rather than replace it.

CREATE TABLE meme_save (
  meme_id uuid NOT NULL REFERENCES meme (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meme_id, user_id)
);

-- Library lists one user's saves.
CREATE INDEX meme_save_user_idx ON meme_save (user_id, created_at DESC);
