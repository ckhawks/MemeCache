import { db } from '@/db/db';

// The longer-view panels on /admin/live, built from rows the site already keeps: accounts,
// the event table (migration 017), visits (migration 022), memes and likes. Nothing here
// writes.

// A member counts as active on a day with a daily 'active' event or a visit.
const MEMBER_ACTIVITY = `
  SELECT user_id, created_at AS at FROM event WHERE kind = 'active' AND user_id IS NOT NULL
  UNION ALL
  SELECT user_id, started_at FROM visit WHERE user_id IS NOT NULL`;

export const RETENTION_WEEKS = 6;

export interface RetentionCohort {
  // Monday of the signup week (UTC).
  week: Date;
  size: number;
  // One per week after signup, 1 to RETENTION_WEEKS. Null when that week has not finished
  // for everyone in the cohort, or started before activity was recorded at all, so a blank
  // means "cannot say" rather than "nobody".
  active: (number | null)[];
}

// Of the members who signed up each week, how many were active in each following week.
// Week n is the 7 days starting n weeks after the person's own signup. Accounts since
// deleted stay in, since leaving is part of the answer.
export async function getRetention(): Promise<RetentionCohort[]> {
  const rows = await db<{ week: Date; k: number; size: number; eligible: number; active: number }>(
    `WITH activity AS (${MEMBER_ACTIVITY}),
     tracking AS (
       SELECT min(created_at) AS since FROM event WHERE kind = 'active'
     ),
     members AS (
       SELECT u.id,
              u.created_at,
              -- Week n can be read only once it has finished and began after tracking did.
              u.created_at >= (SELECT since FROM tracking) - interval '7 days' AS tracked
         FROM app_user u
        WHERE u.created_at IS NOT NULL
     )
     SELECT date_trunc('week', m.created_at) AS week,
            w.k,
            count(*)::int AS size,
            count(*) FILTER (
              WHERE m.tracked
                AND m.created_at + (w.k + 1) * interval '7 days' <= now()
            )::int AS eligible,
            count(*) FILTER (
              WHERE m.tracked
                AND m.created_at + (w.k + 1) * interval '7 days' <= now()
                AND EXISTS (
                  SELECT 1 FROM activity a
                   WHERE a.user_id = m.id
                     AND a.at >= m.created_at + w.k * interval '7 days'
                     AND a.at < m.created_at + (w.k + 1) * interval '7 days'
                )
            )::int AS active
       FROM members m
      CROSS JOIN generate_series(1, $1::int) AS w(k)
      GROUP BY 1, 2
      ORDER BY 1 DESC, 2`,
    [RETENTION_WEEKS]
  );
  const cohorts = new Map<string, RetentionCohort>();
  for (const row of rows) {
    const key = new Date(row.week).toISOString();
    let cohort = cohorts.get(key);
    if (!cohort) {
      cohort = { week: row.week, size: row.size, active: [] };
      cohorts.set(key, cohort);
    }
    // Every member of the cohort must be readable, or the share would mislead.
    cohort.active[row.k - 1] = row.eligible === row.size ? row.active : null;
  }
  return [...cohorts.values()];
}

export interface NewMember {
  username: string;
  // Null for the oldest accounts, made before signup dates were kept.
  joinedAt: Date | null;
  // When they first did each thing, or null if they have not yet.
  firstVisitAt: Date | null;
  firstUploadAt: Date | null;
  firstLikeAt: Date | null;
  firstSendAt: Date | null;
  firstSearchAt: Date | null;
  uploads: number;
  visits: number;
  lastSeenAt: Date | null;
}

// The newest members and how far each has got: the first time they uploaded, liked, sent
// (Send, share or copy link) and searched. Deleted accounts are left out.
export async function listNewMembers(limit = 20): Promise<NewMember[]> {
  return db<NewMember>(
    `SELECT u.username,
            u.created_at AS "joinedAt",
            (SELECT min(started_at) FROM visit WHERE user_id = u.id) AS "firstVisitAt",
            (SELECT min(created_at) FROM meme WHERE uploader_id = u.id) AS "firstUploadAt",
            (SELECT min(created_at) FROM meme_like WHERE user_id = u.id) AS "firstLikeAt",
            (SELECT min(created_at) FROM event
              WHERE user_id = u.id AND kind IN ('meme_send', 'share', 'meme_copy_link')) AS "firstSendAt",
            (SELECT min(created_at) FROM event WHERE user_id = u.id AND kind = 'search') AS "firstSearchAt",
            (SELECT count(*)::int FROM meme WHERE uploader_id = u.id AND deleted_at IS NULL) AS uploads,
            (SELECT count(*)::int FROM visit WHERE user_id = u.id) AS visits,
            GREATEST(u.last_active, (SELECT max(last_seen_at) FROM visit WHERE user_id = u.id)) AS "lastSeenAt"
       FROM app_user u
      WHERE u.deleted_at IS NULL
      ORDER BY u.created_at DESC NULLS LAST
      LIMIT $1`,
    [limit]
  );
}

export interface UnclickedSearch {
  query: string;
  // Searches for it that found something and were followed by no result being opened.
  count: number;
  // The result count the last time.
  results: number;
}

// Searches that found something but where nothing found was opened within 10 minutes, by
// the same person, last 30 days, most repeated first. Next to the searches that find
// nothing on /admin, these are the ones where the results were the wrong ones.
export async function listUnclickedSearches(limit = 10): Promise<UnclickedSearch[]> {
  return db<UnclickedSearch>(
    `SELECT lower(trim(s.data->>'query')) AS query,
            count(*)::int AS count,
            (array_agg((s.data->>'results')::int ORDER BY s.created_at DESC))[1] AS results
       FROM event s
      WHERE s.kind = 'search'
        AND s.created_at > now() - interval '30 days'
        AND (s.data->>'results')::int > 0
        AND trim(s.data->>'query') <> ''
        AND NOT EXISTS (
          SELECT 1 FROM event c
           WHERE c.kind = 'search_click'
             AND c.created_at >= s.created_at
             AND c.created_at < s.created_at + interval '10 minutes'
             AND (c.user_id = s.user_id OR c.visitor_key = s.visitor_key)
        )
      GROUP BY 1
      ORDER BY count DESC, query
      LIMIT $1`,
    [limit]
  );
}
