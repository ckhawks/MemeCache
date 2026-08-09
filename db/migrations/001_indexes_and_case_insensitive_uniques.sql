-- 001: add the missing indexes, and make uniqueness case-insensitive where the code
-- already assumes it is.
--
-- Before this migration the database contained no explicit index at all -- only the ones
-- implied by primary keys and unique constraints. Every feed query joins Like on "memeId",
-- which meant a sequential scan over Like on every page load.
--
-- CREATE INDEX (not CONCURRENTLY) is deliberate: the largest table here is 206 rows, so
-- the lock is measured in milliseconds, and CONCURRENTLY cannot run inside the
-- transaction the migration runner wraps each file in.

-- Feed queries: LEFT JOIN "Like" l ON l."memeId" = m.id, plus the hasLiked EXISTS
-- subquery filtering on both columns. The composite serves the join too, since "memeId"
-- leads.
CREATE INDEX IF NOT EXISTS like_memeid_userid_idx ON public."Like" ("memeId", "userId");
CREATE INDEX IF NOT EXISTS like_userid_idx ON public."Like" ("userId");

-- Profile and library pages filter memes by uploader.
CREATE INDEX IF NOT EXISTS meme_uploaderuserid_idx ON public."Meme" ("uploaderUserId");

-- The transcription route selects the newest row for a meme.
CREATE INDEX IF NOT EXISTS memetranscription_meme_created_idx
  ON public."MemeTranscription" (meme_id, created_at DESC);

-- MemeTag and MemeTagVote have composite primary keys that lead with memeid, so lookups
-- by tag alone -- which is exactly what /t/[tagName] does -- have no index.
CREATE INDEX IF NOT EXISTS memetag_tagid_idx ON public."MemeTag" (tagid);
CREATE INDEX IF NOT EXISTS memetagvote_tagid_idx ON public."MemeTagVote" (tagid);

-- Uniqueness the application already believes in.
--
-- register() checks WHERE LOWER(username) = LOWER($1) and the tag-create path checks
-- WHERE LOWER(name) = LOWER($1), but the constraints backing both are case-sensitive.
-- The check-then-insert is racy, and a direct insert bypasses it entirely.
--
-- The existing case-sensitive constraints (user_unique, Tag_name_key) are left in place.
-- They are strictly implied by these, so they are redundant rather than wrong, and at
-- this table size the duplicate index costs nothing worth a riskier migration.
--
-- Verified 2026-08-09 that no case-colliding usernames or tag names exist, so these
-- cannot fail on current data.
CREATE UNIQUE INDEX IF NOT EXISTS user_username_lower_key
  ON public."User" (LOWER(username));

CREATE UNIQUE INDEX IF NOT EXISTS tag_name_lower_key
  ON public."Tag" (LOWER(name));
