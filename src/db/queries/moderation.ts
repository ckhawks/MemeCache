import { db } from '@/db/db';

// The moderation log (migration 017): one row per thing a moderator or admin did with
// those powers. Written by the API routes right after the action succeeds; read at
// /admin/log.

export type ModerationActionKind =
  | 'meme_delete'
  | 'report_resolve'
  | 'trust_override'
  | 'user_rename'
  | 'invite_create'
  | 'invite_disable'
  | 'invite_enable'
  | 'tag_remove'
  | 'comment_delete'
  | 'warning_remove';

export type ModerationTargetType = 'meme' | 'comment' | 'user' | 'invite';

export interface NewModerationAction {
  actorId: string;
  action: ModerationActionKind;
  targetType: ModerationTargetType;
  targetId: string;
  reason?: string | null;
  data?: Record<string, unknown>;
}

// Unlike an event, a failure here is not swallowed: the log is the record of what was done,
// and a gap in it should show up as an error rather than pass quietly.
export async function logModeration(action: NewModerationAction) {
  await db(
    `INSERT INTO moderation_action (actor_id, action, target_type, target_id, reason, data)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      action.actorId,
      action.action,
      action.targetType,
      action.targetId,
      action.reason ?? null,
      JSON.stringify(action.data ?? {}),
    ]
  );
}

export interface ModerationLogRow {
  // bigint, as a string.
  id: string;
  action: ModerationActionKind;
  targetType: ModerationTargetType;
  targetId: string;
  reason: string | null;
  data: Record<string, unknown>;
  createdAt: Date;
  // Null when the account is gone.
  actorUsername: string | null;
  // The meme it was about (the target, or the meme a comment was on): its slug to link to,
  // and whether it is deleted now. Null and false when there is none.
  memeSlug: string | null;
  memeDeleted: boolean;
  // For a user target: their current name.
  targetUsername: string | null;
}

// Newest first, `limit` at a time. `before` is the last id of the previous page.
export async function listModerationActions(
  options: { before?: string | null; limit?: number } = {}
): Promise<{ rows: ModerationLogRow[]; nextBefore: string | null }> {
  const limit = options.limit ?? 100;
  const before = options.before && /^\d+$/.test(options.before) ? options.before : null;
  const rows = await db<ModerationLogRow>(
    `SELECT a.id::text AS id,
            a.action,
            a.target_type AS "targetType",
            a.target_id AS "targetId",
            a.reason,
            a.data,
            a.created_at AS "createdAt",
            actor.username AS "actorUsername",
            m.slug AS "memeSlug",
            m.deleted_at IS NOT NULL AS "memeDeleted",
            target.username AS "targetUsername"
       FROM moderation_action a
       LEFT JOIN app_user actor ON actor.id = a.actor_id
       LEFT JOIN meme m
         ON m.id::text = CASE WHEN a.target_type = 'meme' THEN a.target_id ELSE a.data->>'memeId' END
       LEFT JOIN app_user target
         ON a.target_type = 'user'
        AND target.id::text = a.target_id
      WHERE $1::bigint IS NULL OR a.id < $1::bigint
      ORDER BY a.id DESC
      LIMIT $2`,
    [before, limit + 1]
  );
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return { rows: page, nextBefore: hasMore ? page[page.length - 1].id : null };
}
