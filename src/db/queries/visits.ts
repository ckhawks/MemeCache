import { db } from '@/db/db';
import { isUuid } from './ids';

// Visits (migration 022): one row per stretch of time someone has the site open, written by
// the beacon through POST /api/presence. Read by /admin/live.

// One person, member or visitor, in SQL. A visit with neither (a deleted member) is its own
// person, so it still counts once.
const PERSON = `COALESCE(v.user_id::text, v.visitor_key::text, 'visit-' || v.id)`;

export interface PresencePing {
  userId: string | null;
  visitorKey: string | null;
  path: string;
  device: string;
  // The other site's host, on the first page of a visit only.
  referrer: string | null;
  installed: boolean;
  // True when a page was opened, false for a heartbeat from a page already open.
  view: boolean;
}

// Continues the person's visit if they were seen in the last 30 minutes, or starts one.
// Like recordEvent, a failure is logged and never fails the request.
export async function noteVisit(ping: PresencePing): Promise<void> {
  const userId = isUuid(ping.userId) ? ping.userId : null;
  const visitorKey = !userId && isUuid(ping.visitorKey) ? ping.visitorKey : null;
  if (!userId && !visitorKey) {
    return;
  }
  try {
    await db(
      `WITH open AS (
         SELECT id
           FROM visit
          WHERE (user_id = $1 OR visitor_key = $2)
            AND last_seen_at > now() - interval '30 minutes'
          ORDER BY last_seen_at DESC
          LIMIT 1
       ),
       continued AS (
         UPDATE visit
            SET last_seen_at = now(),
                exit_path = $3,
                pages = pages + $7::int,
                installed = installed OR $6
          WHERE id = (SELECT id FROM open)
          RETURNING id
       )
       INSERT INTO visit (user_id, visitor_key, entry_path, exit_path, pages, referrer, device, installed)
       SELECT $1, $2, $3, $3, $7::int, $5, $4, $6
        WHERE NOT EXISTS (SELECT 1 FROM continued)`,
      [userId, visitorKey, ping.path, ping.device, ping.referrer, ping.installed, ping.view ? 1 : 0]
    );
  } catch (error) {
    console.error('Could not record a visit:', error);
  }
}

export interface PresentPerson {
  // The member's username, or null for someone logged out.
  username: string | null;
  // The first eight characters of the visitor cookie, to tell visitors apart.
  visitor: string | null;
  path: string;
  device: string;
  referrer: string | null;
  installed: boolean;
  startedAt: Date;
  lastSeenAt: Date;
  pages: number;
}

// Everyone seen in the last 90 seconds (three missed heartbeats), newest first, one row
// per person.
export async function listPresent(): Promise<PresentPerson[]> {
  return db<PresentPerson>(
    `SELECT * FROM (
       SELECT DISTINCT ON (${PERSON})
              u.username,
              left(v.visitor_key::text, 8) AS visitor,
              v.exit_path AS path,
              v.device,
              v.referrer,
              v.installed,
              v.started_at AS "startedAt",
              v.last_seen_at AS "lastSeenAt",
              v.pages
         FROM visit v
         LEFT JOIN app_user u ON u.id = v.user_id
        WHERE v.last_seen_at > now() - interval '90 seconds'
        ORDER BY ${PERSON}, v.last_seen_at DESC
     ) present
     ORDER BY "lastSeenAt" DESC`
  );
}

export const CONCURRENCY_RANGES = {
  // Five-minute steps over a day, hourly over a week, daily over a month.
  day: { seconds: 24 * 3600, step: 300 },
  week: { seconds: 7 * 24 * 3600, step: 3600 },
  month: { seconds: 30 * 24 * 3600, step: 24 * 3600 },
} as const;

export type ConcurrencyRange = keyof typeof CONCURRENCY_RANGES;

export interface ConcurrencyPoint {
  at: Date;
  // Distinct people with the site open at some point in this step.
  people: number;
  members: number;
}

// People on the site per step over the range, oldest first, the current step last. Steps
// line up on whole multiples of the step (in UTC), so the last one is partial.
export async function getConcurrency(range: ConcurrencyRange): Promise<ConcurrencyPoint[]> {
  const { seconds, step } = CONCURRENCY_RANGES[range];
  return db<ConcurrencyPoint>(
    `WITH steps AS (
       SELECT generate_series(
                to_timestamp(floor(extract(epoch FROM now()) / $2::int) * $2::int) - make_interval(secs => $1::int - $2::int),
                to_timestamp(floor(extract(epoch FROM now()) / $2::int) * $2::int),
                make_interval(secs => $2::int)
              ) AS at
     )
     SELECT s.at,
            count(DISTINCT ${PERSON}) FILTER (WHERE v.id IS NOT NULL)::int AS people,
            count(DISTINCT v.user_id)::int AS members
       FROM steps s
       LEFT JOIN visit v
         ON v.started_at < s.at + make_interval(secs => $2::int)
        AND v.last_seen_at >= s.at
      GROUP BY s.at
      ORDER BY s.at`,
    [seconds, step]
  );
}

export interface VisitStats {
  visits: number;
  people: number;
  // Seconds, the middle visit. Null with no visits.
  medianSeconds: number | null;
  medianPages: number | null;
  // Shares of visits, 0 to 1.
  bounceShare: number;
  installedShare: number;
  returningShare: number;
  // The most people on the site in any five minutes of the last 7 days.
  peakWeek: number;
  peakWeekAt: Date | null;
  topEntries: { path: string; visits: number }[];
  topExits: { path: string; visits: number }[];
}

// How visits went over the last 30 days. A bounce is one page and under ten seconds; a
// returning visit is anything after the person's first visit ever.
export async function getVisitStats(): Promise<VisitStats> {
  const [[totals], [peak], topEntries, topExits] = await Promise.all([
    db<Pick<VisitStats, 'visits' | 'people' | 'medianSeconds' | 'medianPages' | 'bounceShare' | 'installedShare' | 'returningShare'>>(
      `WITH numbered AS (
         SELECT v.*,
                ${PERSON} AS person,
                row_number() OVER (PARTITION BY ${PERSON} ORDER BY v.started_at) AS nth
           FROM visit v
       )
       SELECT count(*)::int AS visits,
              count(DISTINCT person)::int AS people,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM last_seen_at - started_at))::float AS "medianSeconds",
              percentile_cont(0.5) WITHIN GROUP (ORDER BY pages)::float AS "medianPages",
              COALESCE(avg((pages <= 1 AND last_seen_at - started_at < interval '10 seconds')::int), 0)::float AS "bounceShare",
              COALESCE(avg(installed::int), 0)::float AS "installedShare",
              COALESCE(avg((nth > 1)::int), 0)::float AS "returningShare"
         FROM numbered
        WHERE started_at > now() - interval '30 days'`
    ),
    db<{ peakWeek: number; peakWeekAt: Date | null }>(
      `WITH steps AS (
         SELECT generate_series(
                  date_trunc('hour', now()) - interval '7 days',
                  now(),
                  interval '5 minutes'
                ) AS at
       ),
       counts AS (
         SELECT s.at, count(DISTINCT ${PERSON})::int AS people
           FROM steps s
           JOIN visit v
             ON v.started_at < s.at + interval '5 minutes'
            AND v.last_seen_at >= s.at
          GROUP BY s.at
       )
       SELECT COALESCE(max(people), 0)::int AS "peakWeek",
              (SELECT at FROM counts ORDER BY people DESC, at DESC LIMIT 1) AS "peakWeekAt"
         FROM counts`
    ),
    db<{ path: string; visits: number }>(
      `SELECT entry_path AS path, count(*)::int AS visits
         FROM visit
        WHERE started_at > now() - interval '30 days'
        GROUP BY 1
        ORDER BY visits DESC, path
        LIMIT 8`
    ),
    db<{ path: string; visits: number }>(
      `SELECT exit_path AS path, count(*)::int AS visits
         FROM visit
        WHERE started_at > now() - interval '30 days'
        GROUP BY 1
        ORDER BY visits DESC, path
        LIMIT 8`
    ),
  ]);
  return {
    ...totals,
    ...peak,
    topEntries,
    topExits,
  };
}
