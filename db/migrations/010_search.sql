-- 010: search.
--
-- Search (src/db/queries/search.ts) matches the words on a meme two ways: full-text search
-- for whole and partial words, and pg_trgm's similarity for typos, which full-text search
-- cannot forgive ("dissapointment" shares most of its three-letter pieces with
-- "disappointment", but no stem).
--
-- pg_trgm has been a trusted extension since Postgres 13, so the app's own role can create
-- it as long as it may create objects in the database; no superuser needed.
--
-- Each transcription version gets its text vector as a stored generated column. A version's
-- text never changes (edits are new versions), so the column is always right and costs
-- nothing to keep. Making the vectors at query time instead was most of a 400 ms search
-- over a few thousand memes. Which version is a meme's current one still has to be worked
-- out per query: that depends on reviews and on whether the author is held, which change
-- without the text changing. Doing that for every meme at once takes about 20 ms.
--
-- Both the vector and the trigram index read the text with apostrophes removed, so "don't"
-- and "dont" are the same word. search.ts uses the identical expression, which is what lets
-- the trigram index apply. Each word goes in twice, stemmed (english) and as written
-- (simple): stemming finds "disappointed" from "disappointment", the plain form finds the
-- half-typed "disappointm" that stems to nothing useful.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE meme_transcription
  ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', regexp_replace(text, '[''’]', '', 'g')), 'B')
      || setweight(to_tsvector('simple', regexp_replace(text, '[''’]', '', 'g')), 'B')
  ) STORED;

CREATE INDEX meme_transcription_search_idx ON meme_transcription USING gin (search_vector);

CREATE INDEX meme_transcription_trgm_idx
  ON meme_transcription USING gin (regexp_replace(text, '[''’]', '', 'g') gin_trgm_ops);
