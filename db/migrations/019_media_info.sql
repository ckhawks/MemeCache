-- 019: what a meme's file is like: its size in pixels, a video's length, and whether a video
-- has sound.
--
-- Silent short videos are what X, Reddit and others turn GIFs into, so a video with no
-- sound track is shown like a GIF: autoplaying, muted, looping, with no player controls.
-- Width and height let pages lay a meme out before the file loads, instead of measuring it
-- in the browser, and let feeds filter by shape later.
--
-- Filled on upload (ffprobe for videos, sharp for images). Rows from before this migration
-- start empty and are filled by scripts/backfill-media-info.mjs. Null means unknown, and
-- readers treat an unknown video as having sound, so nothing autoplays by mistake.

ALTER TABLE meme
  ADD COLUMN width integer,
  ADD COLUMN height integer,
  ADD COLUMN duration_ms integer,
  ADD COLUMN has_audio boolean;
