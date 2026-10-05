-- 005: the review queue, and holding back people whose tags and transcriptions keep being
-- judged wrong.
--
-- Every action is a row. Transcriptions were already append-only (each edit is a new
-- version); this adds a verdict per reviewer on each version, and the queue's skips. A skip
-- hides a meme from that person only until something new happens on it (a new version, a
-- new tag), and is dated so that can be checked. Tag votes were already rows in
-- meme_tag_vote.
--
-- Trust is derived, never stored, like karma: a user is held when at least 10 of their
-- contributions have been judged by someone else and under half were approved. Approvals
-- are upvotes on tags they added and confirms of their transcriptions; rejections are the
-- downvotes and rejects. A held user's votes and reviews stop counting, and their own work
-- needs someone else to vouch for it before it shows. Because it is a view, a hold lifts by
-- itself once their record recovers. trust_override lets an admin pin either way.
--
-- One level only: whether a user is held is judged from everyone's votes, including held
-- users'. Feeding holds back into that judgement would make it recursive.

CREATE TABLE transcription_review (
  transcription_id bigint NOT NULL REFERENCES meme_transcription (id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  -- 1 confirms the text is right and complete, -1 rejects it.
  verdict smallint NOT NULL CHECK (verdict IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (transcription_id, reviewer_id)
);

CREATE INDEX transcription_review_reviewer_idx ON transcription_review (reviewer_id);

CREATE TABLE queue_skip (
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  meme_id uuid NOT NULL REFERENCES meme (id) ON DELETE CASCADE,
  task text NOT NULL CHECK (task IN ('transcription', 'tag')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task, meme_id)
);

-- Null: decided by the record. 'trusted' or 'held': an admin's call, which wins.
ALTER TABLE app_user
  ADD COLUMN trust_override text CHECK (trust_override IN ('trusted', 'held'));

CREATE VIEW user_trust AS
WITH judgement AS (
  SELECT mt.added_by AS user_id, v.vote AS verdict
    FROM meme_tag_vote v
    JOIN meme_tag mt ON mt.meme_id = v.meme_id AND mt.tag_id = v.tag_id
   WHERE v.voter_id <> mt.added_by
  UNION ALL
  SELECT t.edited_by, r.verdict
    FROM transcription_review r
    JOIN meme_transcription t ON t.id = r.transcription_id
   WHERE r.reviewer_id <> t.edited_by
),
totals AS (
  SELECT user_id,
         count(*) FILTER (WHERE verdict = 1)::int AS approved,
         count(*) FILTER (WHERE verdict = -1)::int AS rejected
    FROM judgement
   GROUP BY user_id
)
SELECT u.id AS user_id,
       COALESCE(t.approved, 0) AS approved,
       COALESCE(t.rejected, 0) AS rejected,
       u.trust_override,
       CASE
         WHEN u.trust_override = 'held' THEN true
         WHEN u.trust_override = 'trusted' THEN false
         ELSE COALESCE(t.approved + t.rejected >= 10 AND t.approved < t.rejected, false)
       END AS held
  FROM app_user u
  LEFT JOIN totals t ON t.user_id = u.id;

-- What scores and karma read instead of the raw tables: everything but held users' input.
CREATE VIEW counted_tag_vote AS
SELECT v.*
  FROM meme_tag_vote v
 WHERE v.voter_id NOT IN (SELECT user_id FROM user_trust WHERE held);

CREATE VIEW counted_transcription_review AS
SELECT r.*
  FROM transcription_review r
 WHERE r.reviewer_id NOT IN (SELECT user_id FROM user_trust WHERE held);
