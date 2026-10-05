-- 013: perceptual fingerprints of each meme's media, and the memes they relate to.
--
-- The upload page warns when a meme looks like one already here, and a meme page lists the
-- other memes on the same template (same picture, different text, or that picture as one
-- panel of a bigger meme). Both need a fingerprint per meme that survives re-encoding,
-- resizing and small crops; src/server/mediaHash.ts computes it and explains how.
--
-- One row per meme, written whole in one statement, so a fingerprint is never half saved.
-- A fingerprint has a few regions (the whole image first, then the picture under a caption
-- and the panels of a multi-panel meme), stored as parallel arrays in region order. The
-- small columns (kinds, aspects, hashes) are all a duplicate check reads for every meme;
-- the thumbnails are read only for the few memes the hashes pick out.
--
-- version is the fingerprint format (FINGERPRINT_VERSION). scripts/backfill-media-hashes.mjs
-- fills rows for memes uploaded before this, and redoes rows with an older version. A meme
-- whose file could not be decoded gets a row with an error and no fingerprint, so the
-- backfill does not retry it forever; --retry-failed does.
--
-- Matches are stored rather than computed per page view: comparing a meme against all the
-- others is cheap but not free, and a stored pair is what grouping and naming templates
-- later will build on. One row per pair, the smaller id first. Rebuilt by the backfill.

CREATE TABLE meme_media_hash (
  meme_id uuid PRIMARY KEY REFERENCES meme (id) ON DELETE CASCADE,
  version smallint NOT NULL,
  -- Why there is no fingerprint (an undecodable file, ffmpeg missing). Null when there is.
  error text,
  -- Per region: 'whole', 'picture' or 'panel'.
  kinds text[],
  -- Per region: width over height.
  aspects real[],
  -- Six 64-bit perceptual hashes per region, region after region.
  hashes bigint[],
  -- One 64x64 grayscale thumbnail per region, back to back.
  thumbs bytea,
  -- The whole image as a 256x48 grayscale thumbnail.
  detail bytea,
  hashed_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((error IS NULL) = (hashes IS NOT NULL))
);

CREATE TABLE meme_media_match (
  meme_id uuid NOT NULL REFERENCES meme (id) ON DELETE CASCADE,
  other_id uuid NOT NULL REFERENCES meme (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('duplicate', 'template')),
  -- 0 to 1, higher is closer. For ordering.
  score real NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meme_id, other_id),
  CHECK (meme_id < other_id)
);

-- The primary key finds a meme's matches as the smaller id; this finds them as the larger.
CREATE INDEX meme_media_match_other_idx ON meme_media_match (other_id);
