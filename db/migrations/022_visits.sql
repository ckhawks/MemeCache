-- 022: visits, one row per stretch of time someone has the site open.
--
-- PresenceBeacon (src/components/PresenceBeacon.tsx) posts to /api/presence when a page
-- opens and every 30 seconds while the tab is in front. Each post either continues the
-- person's open visit or starts a new one (src/db/queries/visits.ts):
--
--   open     the person's newest visit, if it was seen in the last 30 minutes. A member is
--            matched by user_id, someone logged out by visitor_key (migration 015).
--   continue last_seen_at moves to now, exit_path to the page they are on, and a page
--            opened adds one to pages.
--   start    otherwise, a new row with entry_path and exit_path both the page they are on.
--
-- So a visit's length is last_seen_at - started_at (zero for a single page with no
-- heartbeat: a bounce), and "on the site now" is a visit seen in the last 90 seconds. The
-- concurrent people at any moment are the visits whose span covers it, which is what the
-- graph on /admin/live counts. Two tabs racing can start two visits for one person; the
-- counts take distinct people, so that only costs a row.
--
-- referrer is the other site's host, on the visit's first page only. device is the user
-- agent as describeDevice() says it ("Chrome on Windows"); the raw string is not kept.
-- installed: some page of the visit ran as the installed app (display-mode standalone).
--
-- Logging in mid-visit starts a member visit; the visitor one just stops being seen.
-- user_id is set null if the account goes, like event, so the history keeps its counts.
--
-- Kept forever: at this site's size that is a few thousand rows a year.
--
-- Additive: one new table.

CREATE TABLE visit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES app_user (id) ON DELETE SET NULL,
  visitor_key uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  entry_path text NOT NULL,
  exit_path text NOT NULL,
  pages integer NOT NULL DEFAULT 0,
  referrer text,
  device text NOT NULL,
  installed boolean NOT NULL DEFAULT false,
  CHECK (user_id IS NULL OR visitor_key IS NULL)
);

-- Finding a person's open visit.
CREATE INDEX visit_user_idx ON visit (user_id, last_seen_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX visit_visitor_idx ON visit (visitor_key, last_seen_at DESC) WHERE visitor_key IS NOT NULL;

-- Who is here now, and the concurrency graph over a time range.
CREATE INDEX visit_last_seen_idx ON visit (last_seen_at DESC);
CREATE INDEX visit_started_idx ON visit (started_at DESC);
