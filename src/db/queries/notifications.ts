import { db } from '@/db/db';
import { CONFIRMATIONS_NEEDED } from '@/constants/queue';

// Migration 012. Rows are written by the API routes after the action they describe has
// succeeded, and grouped when read.

export type NotificationKind =
  | 'like'
  | 'meme_tagged'
  | 'meme_transcribed'
  | 'transcription_confirmed'
  | 'transcription_rejected'
  | 'transcription_fixed'
  | 'tag_confirmed'
  | 'tag_removed';

export interface NewNotification {
  // Who it is for. Nothing is written when this is the actor.
  recipientId: string;
  kind: NotificationKind;
  actorId: string;
  memeId: string;
  transcriptionId?: string;
  tagId?: string;
}

// Writes one notification unless the recipient already has the same one: same kind, meme,
// version or tag, and person. tag_confirmed happens once per tag, whoever tipped it.
//
// A notification is a side effect. Failing to write one is logged and does not fail the
// like or vote that caused it.
export async function notify(n: NewNotification) {
  if (n.recipientId === n.actorId) {
    return;
  }
  try {
    await db(
      `INSERT INTO notification (user_id, kind, actor_id, meme_id, transcription_id, tag_id, tag_name)
       SELECT $1::uuid, $2::text, $3::uuid, $4::uuid, $5::bigint, $6::uuid,
              (SELECT name FROM tag WHERE id = $6::uuid)
        WHERE NOT EXISTS (
          SELECT 1 FROM notification x
           WHERE x.user_id = $1
             AND x.kind = $2
             AND x.meme_id = $4
             AND x.transcription_id IS NOT DISTINCT FROM $5
             AND x.tag_id IS NOT DISTINCT FROM $6
             AND (x.actor_id = $3 OR x.kind = 'tag_confirmed')
        )
       ON CONFLICT DO NOTHING`,
      [
        n.recipientId,
        n.kind,
        n.actorId,
        n.memeId,
        n.transcriptionId ?? null,
        n.tagId ?? null,
      ]
    );
  } catch (error) {
    console.error(`Could not write a ${n.kind} notification:`, error);
  }
}

// After an upvote: tells whoever added the tag once it has CONFIRMATIONS_NEEDED net votes
// from other people, counted the way the queue counts them (held users' votes do not).
export async function notifyIfTagConfirmed(memeId: string, tagId: string, actorId: string) {
  const [row] = await db<{ addedBy: string; agreement: number }>(
    `SELECT mt.added_by AS "addedBy",
            (SELECT COALESCE(sum(v.vote), 0)::int
               FROM counted_tag_vote v
              WHERE v.meme_id = mt.meme_id AND v.tag_id = mt.tag_id
                AND v.voter_id <> mt.added_by) AS agreement
       FROM meme_tag mt
      WHERE mt.meme_id = $1 AND mt.tag_id = $2`,
    [memeId, tagId]
  );
  if (row && row.agreement >= CONFIRMATIONS_NEEDED) {
    await notify({
      recipientId: row.addedBy,
      kind: 'tag_confirmed',
      actorId,
      memeId,
      tagId,
    });
  }
}

export interface NotificationActor {
  username: string;
  avatarKey: string | null;
}

// Rows about the same thing, read as one line: everyone who liked a meme, every review of
// one transcription by the same verdict, every tag someone added to a meme.
export interface NotificationGroup {
  // The newest row's id, as a string (bigint). Stable while nothing new joins the group.
  id: string;
  kind: NotificationKind;
  memeId: string;
  memeSlug: string;
  memeContentType: string;
  // When the newest row in the group happened.
  createdAt: Date;
  // Any row in the group is unread.
  unread: boolean;
  // Distinct people in the group.
  actorCount: number;
  // The most recent two, newest first.
  actors: NotificationActor[];
  // The tag kinds: the tag names involved, for meme_tagged possibly several.
  tagNames: string[];
}

// What makes two rows one group, beyond kind and meme (alias n). Reviews group per version,
// tag news per tag. Likes, tagging and transcribing group per meme.
const GROUP_DETAIL = `
  CASE
    WHEN n.kind IN ('transcription_confirmed', 'transcription_rejected', 'transcription_fixed')
      THEN n.transcription_id::text
    WHEN n.kind IN ('tag_confirmed', 'tag_removed')
      THEN lower(n.tag_name)
  END
`;

export async function listNotifications(
  userId: string,
  limit = 20
): Promise<NotificationGroup[]> {
  const rows = await db<NotificationGroup & { allActors: NotificationActor[] }>(
    `SELECT max(n.id)::text AS id,
            n.kind,
            n.meme_id AS "memeId",
            m.slug AS "memeSlug",
            m.content_type AS "memeContentType",
            max(n.created_at) AS "createdAt",
            bool_or(n.read_at IS NULL) AS unread,
            count(DISTINCT n.actor_id)::int AS "actorCount",
            json_agg(
              json_build_object('username', a.username, 'avatarKey', a.avatar_s3_key)
              ORDER BY n.created_at DESC, n.id DESC
            ) AS "allActors",
            COALESCE(
              array_agg(DISTINCT n.tag_name) FILTER (WHERE n.tag_name IS NOT NULL),
              '{}'
            ) AS "tagNames"
       FROM notification n
       JOIN meme m ON m.id = n.meme_id
       JOIN app_user a ON a.id = n.actor_id
      WHERE n.user_id = $1
        AND m.deleted_at IS NULL
      GROUP BY n.kind, n.meme_id, m.slug, m.content_type, ${GROUP_DETAIL}
      ORDER BY max(n.created_at) DESC, max(n.id) DESC
      LIMIT $2`,
    [userId, limit]
  );

  // One person can be in a group twice (two tags on the same meme). Name them once.
  return rows.map(({ allActors, ...group }) => {
    const seen = new Set<string>();
    const actors = allActors.filter((actor) => {
      if (seen.has(actor.username)) {
        return false;
      }
      seen.add(actor.username);
      return true;
    });
    return {
      ...group,
      actors: actors.slice(0, 2),
    };
  });
}

// Unread groups, so the number on the bell matches the highlighted lines in the list.
export async function countUnreadNotifications(userId: string): Promise<number> {
  const [row] = await db<{ count: number }>(
    `SELECT count(DISTINCT (n.kind, n.meme_id, ${GROUP_DETAIL}))::int AS count
       FROM notification n
       JOIN meme m ON m.id = n.meme_id
      WHERE n.user_id = $1
        AND n.read_at IS NULL
        AND m.deleted_at IS NULL`,
    [userId]
  );
  return row.count;
}

// Marks everything up to and including `throughId` (the newest row the person was shown)
// as read, so a notification that arrives while the list is open stays unread. Without
// `throughId`, everything.
export async function markNotificationsRead(userId: string, throughId?: string) {
  await db(
    `UPDATE notification
        SET read_at = now()
      WHERE user_id = $1
        AND read_at IS NULL
        AND ($2::bigint IS NULL OR id <= $2::bigint)`,
    [userId, throughId ?? null]
  );
}
