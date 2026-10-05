-- 006: where an imported meme came from.
--
-- The upload page can fetch a post's media from a link (X, Instagram, TikTok, YouTube,
-- Reddit). The link is kept, normalized by src/server/mediaImport.ts so the same post
-- shared two ways (x.com and twitter.com, youtu.be and /shorts/) reads as one URL. Null for
-- memes uploaded from a file.
--
-- Not unique: the upload page warns when a post was already imported and links to it, but
-- someone can still import it again on purpose (a better crop, a different clip).

ALTER TABLE meme ADD COLUMN source_url text;

-- The duplicate check looks a link up before downloading anything.
CREATE INDEX meme_source_url_idx ON meme (source_url) WHERE source_url IS NOT NULL;
