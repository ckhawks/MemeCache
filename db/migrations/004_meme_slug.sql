-- 004: short public slugs for meme URLs, /meme/h7Kq2xN instead of a 36-character uuid.
--
-- 7 characters from a 56-character alphabet: digits 2-9 and letters in both cases, minus
-- the ones people misread or mistype when copying a link by eye: 0 O o 1 l I. 56^7 is about
-- 1.7 trillion, so a collision is negligible at this size; the unique index catches one
-- anyway, failing the insert rather than handing out a shared URL.
--
-- The uuid stays the primary key and the API and media URLs keep using it. Old /meme/<uuid>
-- links redirect to the slug.

CREATE FUNCTION new_meme_slug() RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT string_agg(
           substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz',
                  1 + floor(random() * 56)::int, 1),
           '')
    FROM generate_series(1, 7)
$$;

ALTER TABLE meme ADD COLUMN slug text;
UPDATE meme SET slug = new_meme_slug();
ALTER TABLE meme ALTER COLUMN slug SET NOT NULL;
ALTER TABLE meme ALTER COLUMN slug SET DEFAULT new_meme_slug();
CREATE UNIQUE INDEX meme_slug_key ON meme (slug);
