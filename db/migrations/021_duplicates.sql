-- 021: merging a meme uploaded twice into the first copy, and members judging the pairs the
-- media fingerprints found (migration 013).
--
-- Exact copies. The upload now fingerprints a still image before storing it and refuses one
-- that is the very same picture as a live meme (src/server/mediaHash.ts, isExactCopy). That
-- needs nothing new here: the stored pair kinds stay 'duplicate' and 'template'.
--
-- Merging. A moderator merges a duplicate into its original (mergeMemes in
-- src/db/queries/merge.ts): its likes, saves, comments, tags and their votes, content
-- warnings, reports, views, events and notifications move over, keeping one row where both
-- memes had one for the same person, and its transcriptions too when the original has no
-- text standing. The duplicate is soft deleted with merged_into
-- pointing at the original, so /meme/<its slug> redirects there for good. merged_into is
-- only ever set on a deleted meme. If the original is merged on later, every meme merged
-- into it is repointed to the new original, so a redirect is always one hop.
--
-- Judging pairs. The queue's Duplicates tab shows a stored pair side by side and asks
-- whether it is the same meme, the same template, or different. meme_match_answer is one
-- current answer per person per pair, like transcription_review; every new answer and every
-- change is copied to meme_match_answer_history by a trigger, like migration 017's history
-- tables. A pair is settled the way the queue settles a tag or a transcription, worked out
-- when read rather than stored, so a hold or its lifting takes effect by itself:
--
--   community  an answer given by CONFIRMATIONS_NEEDED (2) people that more people gave
--              than any other answer. Only counted answers: not from either meme's
--              uploader, and not from a held user (user_trust, migration 005).
--   moderator  a moderator answering on /admin/duplicates (decisive) settles the pair on
--              their own, and the newest such answer wins over the community's.
--
-- A settled 'same_meme' pair waits on /admin/duplicates for a moderator to merge it or say
-- it is not a duplicate. 'same_template' pairs stay in the meme page's Same template strip
-- (and are what template grouping will build on); 'different' pairs leave it. Answers name
-- the two memes rather than the meme_media_match row, so a rebuild of the matches never
-- loses them. Smaller id first, like meme_media_match.
--
-- meme_match_skip: a pair the person skipped in the queue. A pair has nothing new happen to
-- it, so unlike queue_skip a skip lasts.
--
-- Additive: a nullable column with a check every existing row passes (all null), an index,
-- three new tables, and a trigger on one of them.

ALTER TABLE meme
  ADD COLUMN merged_into uuid REFERENCES meme (id) ON DELETE SET NULL,
  ADD CONSTRAINT meme_merged_into_check
    CHECK (merged_into IS NULL OR (deleted_at IS NOT NULL AND merged_into <> id));

-- Repointing earlier merges, and the merged_into foreign key.
CREATE INDEX meme_merged_into_idx ON meme (merged_into) WHERE merged_into IS NOT NULL;

CREATE TABLE meme_match_answer (
  meme_id uuid NOT NULL REFERENCES meme (id) ON DELETE CASCADE,
  other_id uuid NOT NULL REFERENCES meme (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  answer text NOT NULL CHECK (answer IN ('same_meme', 'same_template', 'different')),
  -- A moderator's call on /admin/duplicates, which settles the pair alone.
  decisive boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meme_id, other_id, user_id),
  CHECK (meme_id < other_id)
);

CREATE INDEX meme_match_answer_other_idx ON meme_match_answer (other_id);
CREATE INDEX meme_match_answer_user_idx ON meme_match_answer (user_id);

CREATE TABLE meme_match_answer_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meme_id uuid NOT NULL REFERENCES meme (id) ON DELETE CASCADE,
  other_id uuid NOT NULL REFERENCES meme (id) ON DELETE CASCADE,
  -- Set null if the account goes: the answer was given, the person is no longer named.
  user_id uuid REFERENCES app_user (id) ON DELETE SET NULL,
  answer text NOT NULL CHECK (answer IN ('same_meme', 'same_template', 'different')),
  decisive boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX meme_match_answer_history_pair_idx
  ON meme_match_answer_history (meme_id, other_id, created_at);
CREATE INDEX meme_match_answer_history_other_idx ON meme_match_answer_history (other_id);
CREATE INDEX meme_match_answer_history_user_idx ON meme_match_answer_history (user_id, created_at);

-- A new answer, or a change of answer or of decisive. Re-sending the same one is no change.
CREATE FUNCTION record_meme_match_answer_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.answer IS DISTINCT FROM OLD.answer OR NEW.decisive IS DISTINCT FROM OLD.decisive THEN
    INSERT INTO meme_match_answer_history (meme_id, other_id, user_id, answer, decisive)
    VALUES (NEW.meme_id, NEW.other_id, NEW.user_id, NEW.answer, NEW.decisive);
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER meme_match_answer_history
  AFTER INSERT OR UPDATE ON meme_match_answer
  FOR EACH ROW EXECUTE FUNCTION record_meme_match_answer_history();

CREATE TABLE meme_match_skip (
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  meme_id uuid NOT NULL REFERENCES meme (id) ON DELETE CASCADE,
  other_id uuid NOT NULL REFERENCES meme (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, meme_id, other_id),
  CHECK (meme_id < other_id)
);

CREATE INDEX meme_match_skip_meme_idx ON meme_match_skip (meme_id);
CREATE INDEX meme_match_skip_other_idx ON meme_match_skip (other_id);
