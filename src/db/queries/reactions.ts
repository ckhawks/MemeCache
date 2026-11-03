import { db } from '@/db/db';
import { isUuid } from './ids';
import { REACTIONS_PER_PERSON } from '@/constants/reactions';

// Emoji reactions on memes and comments (migration 023). The two tables have the same shape
// and differ only in what they hang off, so every query here takes one of these.
const TARGETS = {
  meme: { table: 'meme_reaction', column: 'meme_id', type: 'uuid' },
  comment: { table: 'comment_reaction', column: 'comment_id', type: 'bigint' },
} as const;

export type ReactionTarget = keyof typeof TARGETS;

export interface ReactionSummary {
  emoji: string;
  count: number;
  // The viewer is one of them.
  mine: boolean;
  // Who, in the order they reacted, up to ten, for the tooltip.
  names: string[];
}

function validId(target: ReactionTarget, id: string) {
  return target === 'meme' ? isUuid(id) : /^\d{1,18}$/.test(id);
}

// Live reactions, one row per emoji, in the order each emoji was first used. Accounts since
// deleted are left out, like their likes. The viewer may be nobody.
const SUMMARY = (target: ReactionTarget) => `
  SELECT r.${TARGETS[target].column}::text AS "targetId",
         r.emoji,
         count(*)::int AS count,
         COALESCE(bool_or(r.user_id = $2::uuid), false) AS mine,
         (array_agg(u.username ORDER BY r.created_at, r.id))[1:10] AS names,
         min(r.created_at) AS first
    FROM ${TARGETS[target].table} r
    JOIN app_user u ON u.id = r.user_id
   WHERE r.${TARGETS[target].column} = ANY($1::${TARGETS[target].type}[])
     AND r.removed_at IS NULL
     AND u.deleted_at IS NULL
   GROUP BY r.${TARGETS[target].column}, r.emoji
   ORDER BY first, r.emoji`;

// The reactions on each of several memes or comments, keyed by id. Ids with none are absent.
export async function listReactions(
  target: ReactionTarget,
  ids: string[],
  viewerId?: string | null
): Promise<Record<string, ReactionSummary[]>> {
  const valid = ids.filter((id) => validId(target, id));
  if (valid.length === 0) {
    return {};
  }
  const rows = await db<ReactionSummary & { targetId: string }>(SUMMARY(target), [
    valid,
    isUuid(viewerId) ? viewerId : null,
  ]);
  const byTarget: Record<string, ReactionSummary[]> = {};
  for (const { targetId, emoji, count, mine, names } of rows) {
    (byTarget[targetId] ??= []).push({ emoji, count, mine, names });
  }
  return byTarget;
}

export async function listReactionsFor(
  target: ReactionTarget,
  id: string,
  viewerId?: string | null
): Promise<ReactionSummary[]> {
  return (await listReactions(target, [id], viewerId))[id] ?? [];
}

export type SetReactionResult = 'added' | 'removed' | 'unchanged' | 'limit';

// Puts the person's emoji on, or takes it back. Adding one they already have, or taking back
// one they never gave, changes nothing. A new emoji past REACTIONS_PER_PERSON is refused.
export async function setReaction(
  target: ReactionTarget,
  id: string,
  userId: string,
  emoji: string,
  reacted: boolean
): Promise<SetReactionResult> {
  const { table, column, type } = TARGETS[target];
  if (!validId(target, id)) {
    return 'unchanged';
  }
  if (!reacted) {
    const removed = await db(
      `UPDATE ${table}
          SET removed_at = now()
        WHERE ${column} = $1 AND user_id = $2 AND emoji = $3 AND removed_at IS NULL
        RETURNING id`,
      [id, userId, emoji]
    );
    return removed.length > 0 ? 'removed' : 'unchanged';
  }
  // The limit is checked by the insert itself. Two different emoji racing in at once can go
  // one over, which is harmless.
  const added = await db(
    `INSERT INTO ${table} (${column}, user_id, emoji)
     SELECT $1::${type}, $2::uuid, $3::text
      WHERE (SELECT count(*) FROM ${table}
              WHERE ${column} = $1 AND user_id = $2 AND removed_at IS NULL) < $4
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [id, userId, emoji, REACTIONS_PER_PERSON]
  );
  if (added.length > 0) {
    return 'added';
  }
  const [existing] = await db(
    `SELECT 1 FROM ${table}
      WHERE ${column} = $1 AND user_id = $2 AND emoji = $3 AND removed_at IS NULL`,
    [id, userId, emoji]
  );
  return existing ? 'unchanged' : 'limit';
}
