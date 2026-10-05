-- 008: members reporting memes, and moderators working through the reports.
--
-- A report names one of a fixed set of reasons (the posting rules in the FAQ, plus spam and
-- illegal content) and can carry a short note. A member has at most one open report per
-- meme: reporting again rewrites that report instead of piling up rows, so a count of open
-- reports is a count of people.
--
-- Every report row is kept. Resolving one sets its status, who resolved it and when, rather
-- than deleting it, so there is a record of what was reported and what was done about it,
-- and a member can report the same meme again after an earlier report was dismissed.
-- "actioned" means the meme was taken down (the existing soft delete, meme.deleted_at).

CREATE TABLE meme_report (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meme_id uuid NOT NULL REFERENCES meme (id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (
    reason IN ('nsfw_unlabelled', 'not_funny', 'spam', 'private_person', 'illegal', 'other')
  ),
  details text CHECK (char_length(details) <= 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
  -- Null while open. Set null rather than lost if the moderator's account goes.
  resolved_by uuid REFERENCES app_user (id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'open') = (resolved_at IS NULL))
);

-- One open report per member per meme. Resolved ones do not count against it.
CREATE UNIQUE INDEX meme_report_open_idx ON meme_report (meme_id, reporter_id) WHERE status = 'open';

-- The review page lists by status, newest first.
CREATE INDEX meme_report_status_idx ON meme_report (status, created_at DESC);

CREATE INDEX meme_report_reporter_idx ON meme_report (reporter_id);
