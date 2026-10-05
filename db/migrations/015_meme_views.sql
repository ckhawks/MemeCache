-- 015: view counts on memes.
--
-- A view is counted by the meme page itself, from the browser, once the meme has been on
-- screen for about a second or its video starts playing (POST /api/meme/[id]/view). Feeds do
-- not count, and neither do link previews, prefetches or bots, since none of them run the
-- page's script.
--
-- Each viewer counts once per meme per 24 hours. Logged-in viewers are told apart by user
-- id; logged-out ones by visitor_key, a random id kept in an httpOnly cookie that carries
-- nothing about the person. The uploader's own views do not count. The 24 hour check is
-- made by the insert itself (src/db/queries/views.ts), not by a constraint, so the window
-- can change later without touching the table.
--
-- Every counted view is kept as a row. meme.view_count is a running total of those rows,
-- bumped by the same statement that inserts one, so the feeds can read a meme's views as a
-- plain column instead of counting rows for every card. Pruning old rows later leaves the
-- total alone.

CREATE TABLE meme_view (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meme_id uuid NOT NULL REFERENCES meme (id) ON DELETE CASCADE,
  -- Set for a logged-in viewer. Set null if the account goes; the view still happened.
  viewer_id uuid REFERENCES app_user (id) ON DELETE SET NULL,
  -- Set for a logged-out viewer instead.
  visitor_key uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (viewer_id IS NULL OR visitor_key IS NULL)
);

ALTER TABLE meme ADD COLUMN view_count integer NOT NULL DEFAULT 0;

-- Counting and listing one meme's views, over any window.
CREATE INDEX meme_view_meme_idx ON meme_view (meme_id, created_at DESC);

-- The 24 hour check, one per kind of viewer. The first also covers the viewer_id foreign key.
CREATE INDEX meme_view_viewer_idx ON meme_view (viewer_id, meme_id, created_at DESC)
  WHERE viewer_id IS NOT NULL;
CREATE INDEX meme_view_visitor_idx ON meme_view (visitor_key, meme_id, created_at DESC)
  WHERE visitor_key IS NOT NULL;
