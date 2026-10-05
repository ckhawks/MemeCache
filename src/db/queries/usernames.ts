import { db, transaction } from '@/db/db';
import { isUuid } from './ids';

// Username changes (migration 011). Every change is a row in username_history, which
// drives the cooldown, keeps old names from being taken by someone else for a while, and
// sends old profile links to where the person is now.

// One change per this many days. Renames an admin makes for someone do not count.
export const USERNAME_COOLDOWN_DAYS = 30;

// How long an old name stays blocked for everyone but the person who gave it up.
export const USERNAME_RESERVED_DAYS = 90;

export interface UsernameCooldown {
  lastChangedAt: Date | null;
  // When the next change is allowed, or null when it is allowed now.
  availableAt: Date | null;
  // The database's clock, so the page and the countdown start from the same moment.
  now: Date;
}

export async function getUsernameCooldown(userId: string): Promise<UsernameCooldown> {
  const [row] = await db<UsernameCooldown>(
    `SELECT last."lastChangedAt",
            CASE WHEN last."lastChangedAt" + make_interval(days => $2) > now()
                 THEN last."lastChangedAt" + make_interval(days => $2)
            END AS "availableAt",
            now() AS now
       FROM (SELECT max(changed_at) AS "lastChangedAt"
               FROM username_history
              WHERE user_id = $1 AND NOT by_admin) last`,
    [userId, USERNAME_COOLDOWN_DAYS]
  );
  return row;
}

export interface UsernameChange {
  oldUsername: string;
  newUsername: string;
  changedAt: Date;
}

// Newest first.
export async function listUsernameHistory(userId: string): Promise<UsernameChange[]> {
  return db<UsernameChange>(
    `SELECT old_username AS "oldUsername",
            new_username AS "newUsername",
            changed_at AS "changedAt"
       FROM username_history
      WHERE user_id = $1
      ORDER BY changed_at DESC, id DESC`,
    [userId]
  );
}

// Who used to go by `username`, as their current name: the most recent person to give it
// up. Only meaningful when nobody holds the name now, so callers look up the current owner
// first. Not limited to the reservation window: an old link keeps working until someone
// else takes the name.
export async function findRenamedUsername(username: string): Promise<string | null> {
  const [row] = await db<{ username: string }>(
    `SELECT u.username
       FROM username_history h
       JOIN app_user u ON u.id = h.user_id
      WHERE lower(h.old_username) = lower($1)
      ORDER BY h.changed_at DESC, h.id DESC
      LIMIT 1`,
    [username]
  );
  return row?.username ?? null;
}

// SQL for "someone other than `userId` gave this name up recently". `userId` and `name`
// are SQL expressions (parameters). Registration passes a null user, so every recent
// owner counts.
function reservedSql(name: string, userId: string) {
  return `SELECT changed_at + make_interval(days => ${USERNAME_RESERVED_DAYS}) AS "reservedUntil"
            FROM username_history
           WHERE lower(old_username) = lower(${name})
             AND user_id IS DISTINCT FROM ${userId}
             AND changed_at > now() - make_interval(days => ${USERNAME_RESERVED_DAYS})
           ORDER BY changed_at DESC
           LIMIT 1`;
}

// Whether a name is held for someone who recently gave it up. Registration checks this
// alongside names in use.
export async function isUsernameReserved(username: string): Promise<boolean> {
  const rows = await db(reservedSql('$1', 'NULL::uuid'), [username]);
  return rows.length > 0;
}

export type RenameResult =
  | { ok: true; username: string; previous: string }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'same' }
  | { ok: false; reason: 'taken' }
  | { ok: false; reason: 'reserved'; until: Date }
  | { ok: false; reason: 'cooldown'; until: Date };

// Changes a user's name. `username` must already have passed usernameProblem().
//
// Two renames that touch the same name (one leaving it, one taking it, or two taking it)
// would otherwise both pass their checks before either commits. So the transaction takes
// an advisory lock per name involved, old and new, in a fixed order so two renames cannot
// deadlock. Whichever runs second sees the first one's row. The user's own row is locked
// too, so two changes from the same person cannot both slip under the cooldown.
export async function renameUser(options: {
  userId: string;
  username: string;
  // An admin renaming someone: no cooldown, and it does not start one.
  byAdmin?: boolean;
}): Promise<RenameResult> {
  if (!isUuid(options.userId)) {
    return { ok: false, reason: 'not-found' };
  }
  try {
    return await transaction(async (query) => {
      const [user] = await query<{ username: string }>(
        `SELECT username FROM app_user WHERE id = $1 FOR UPDATE`,
        [options.userId]
      );
      if (!user) {
        return { ok: false, reason: 'not-found' } as const;
      }
      if (user.username === options.username) {
        return { ok: false, reason: 'same' } as const;
      }

      const names = [...new Set([user.username.toLowerCase(), options.username.toLowerCase()])].sort();
      for (const name of names) {
        await query(`SELECT pg_advisory_xact_lock(hashtext('username:' || $1))`, [name]);
      }

      if (!options.byAdmin) {
        const [cooldown] = await query<{ until: Date | null }>(
          `SELECT max(changed_at) + make_interval(days => $2) AS until
             FROM username_history
            WHERE user_id = $1 AND NOT by_admin
           HAVING max(changed_at) + make_interval(days => $2) > now()`,
          [options.userId, USERNAME_COOLDOWN_DAYS]
        );
        if (cooldown?.until) {
          return { ok: false, reason: 'cooldown', until: cooldown.until } as const;
        }
      }

      // A change of case only (bob to Bob) keeps the same name as far as anyone else is
      // concerned, so it skips these.
      if (user.username.toLowerCase() !== options.username.toLowerCase()) {
        const taken = await query(
          `SELECT 1 FROM app_user WHERE lower(username) = lower($1) AND id <> $2`,
          [options.username, options.userId]
        );
        if (taken.length > 0) {
          return { ok: false, reason: 'taken' } as const;
        }
        const [reserved] = await query<{ reservedUntil: Date }>(reservedSql('$1', '$2::uuid'), [
          options.username,
          options.userId,
        ]);
        if (reserved) {
          return { ok: false, reason: 'reserved', until: reserved.reservedUntil } as const;
        }
      }

      await query(`UPDATE app_user SET username = $1 WHERE id = $2`, [options.username, options.userId]);
      await query(
        `INSERT INTO username_history (user_id, old_username, new_username, by_admin)
         VALUES ($1, $2, $3, $4)`,
        [options.userId, user.username, options.username, options.byAdmin ?? false]
      );
      return { ok: true, username: options.username, previous: user.username } as const;
    });
  } catch (error) {
    // Registration does not take the name locks, so a sign-up can still win the name
    // between the check and the update. The unique index on lower(username) catches it.
    if ((error as { code?: string }).code === '23505') {
      return { ok: false, reason: 'taken' };
    }
    throw error;
  }
}
