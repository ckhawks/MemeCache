import { db } from '@/db/db';
import { isUuid } from './ids';
import type { EventKind } from '@/constants/events';

// Behaviour (migration 017): one row per thing someone did that leaves no other trace.
// src/constants/events.ts lists the kinds.

export interface NewEvent {
  kind: EventKind;
  // The logged-in actor, or for a logged-out one the visitor cookie. Neither for a bot.
  userId?: string | null;
  visitorKey?: string | null;
  memeId?: string | null;
  data?: Record<string, unknown>;
}

// Records an event. Like a notification, it is a side effect: failing to write one is
// logged and never fails the request that caused it, so callers await it without a try.
export async function recordEvent(event: NewEvent): Promise<void> {
  try {
    const userId = isUuid(event.userId) ? event.userId : null;
    await db(
      `INSERT INTO event (kind, user_id, visitor_key, meme_id, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        event.kind,
        userId,
        // One or the other: a logged-in user is never also counted as a visitor.
        !userId && isUuid(event.visitorKey) ? event.visitorKey : null,
        isUuid(event.memeId) ? event.memeId : null,
        JSON.stringify(event.data ?? {}),
      ]
    );
  } catch (error) {
    console.error(`Could not record a ${event.kind} event:`, error);
  }
}

// Notes that the user was active today, at most once per UTC day (the unique index in
// migration 017 refuses a second). Called with the last_active update, so it costs a write
// only when last_active goes stale anyway.
export async function recordActive(userId: string): Promise<void> {
  if (!isUuid(userId)) {
    return;
  }
  try {
    await db(
      `INSERT INTO event (kind, user_id)
       VALUES ('active', $1)
       ON CONFLICT DO NOTHING`,
      [userId]
    );
  } catch (error) {
    console.error('Could not record an active event:', error);
  }
}

export interface ActivityNumbers {
  // Distinct members active in the window.
  activeWeek: number;
  activeMonth: number;
  sendsWeek: number;
  sharesWeek: number;
  copiesWeek: number;
  downloadsWeek: number;
  searchesWeek: number;
}

// The numbers at the top of /admin. Active members count both the daily active rows and
// last_active, so the figures are right from the day this shipped rather than only once a
// month of rows has built up.
export async function getActivityNumbers(): Promise<ActivityNumbers> {
  const [row] = await db<ActivityNumbers>(
    `WITH active AS (
       SELECT user_id, created_at AS at FROM event WHERE kind = 'active' AND user_id IS NOT NULL
       UNION ALL
       SELECT id, last_active FROM app_user WHERE last_active IS NOT NULL
     ),
     week AS (
       SELECT kind, count(*)::int AS n
         FROM event
        WHERE created_at > now() - interval '7 days'
          AND kind IN ('meme_send', 'share', 'meme_copy_link', 'meme_download', 'search')
        GROUP BY kind
     )
     SELECT
       (SELECT count(DISTINCT user_id)::int FROM active WHERE at > now() - interval '7 days') AS "activeWeek",
       (SELECT count(DISTINCT user_id)::int FROM active WHERE at > now() - interval '30 days') AS "activeMonth",
       COALESCE((SELECT n FROM week WHERE kind = 'meme_send'), 0) AS "sendsWeek",
       COALESCE((SELECT n FROM week WHERE kind = 'share'), 0) AS "sharesWeek",
       COALESCE((SELECT n FROM week WHERE kind = 'meme_copy_link'), 0) AS "copiesWeek",
       COALESCE((SELECT n FROM week WHERE kind = 'meme_download'), 0) AS "downloadsWeek",
       COALESCE((SELECT n FROM week WHERE kind = 'search'), 0) AS "searchesWeek"`
  );
  return row;
}

export interface FailedSearch {
  query: string;
  count: number;
}

// The searches that found nothing in the last 7 days, most repeated first. Queries are
// compared lowercased and trimmed, so "Cat " and "cat" are one.
export async function listFailedSearches(limit = 10): Promise<FailedSearch[]> {
  return db<FailedSearch>(
    `SELECT lower(trim(data->>'query')) AS query, count(*)::int AS count
       FROM event
      WHERE kind = 'search'
        AND created_at > now() - interval '7 days'
        AND (data->>'results')::int = 0
        AND trim(data->>'query') <> ''
      GROUP BY 1
      ORDER BY count DESC, query
      LIMIT $1`,
    [limit]
  );
}
