import { isIP } from 'node:net';
import { db } from '@/db/db';
import { recordActive } from './events';
import { isUuid } from './ids';

// Login sessions (migration 018). Each login is a user_session row and the access token
// carries its id; validateAccessToken in src/auth/lib.ts rejects a token whose session is
// gone or revoked.

// How long a token lives. Kept here rather than in src/auth/lib.ts so this module needs no
// Next imports; lib re-exports it.
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

// How stale last_seen_at (and app_user.last_active) may get before it is worth a write.
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

// A session not seen for this long has no live token (see the migration), so the list
// leaves it out. The token lifetime plus the touch interval, since last_seen_at can lag the
// moment a token was issued by up to that much.
const SESSION_LISTED_SECONDS = SESSION_TTL_SECONDS + SESSION_TOUCH_INTERVAL_MS / 1000;

// The address with how much of it to keep: /24 for IPv4, /48 for IPv6. Null when there is no
// usable address (no proxy header in development, or something malformed).
export function coarseNetwork(ip: string | null | undefined): string | null {
  if (!ip) {
    return null;
  }
  let address = ip.trim();
  // An IPv4 address carried in IPv6 form, which Node reports for dual-stack sockets.
  if (address.toLowerCase().startsWith('::ffff:') && isIP(address.slice(7)) === 4) {
    address = address.slice(7);
  }
  // Postgres does the masking (network() in createSession); this says how much to keep.
  const family = isIP(address);
  if (family === 4) {
    return `${address}/24`;
  }
  if (family === 6) {
    return `${address}/48`;
  }
  return null;
}

export async function createSession(options: {
  userId: string;
  userAgent: string | null;
  ip: string | null;
}): Promise<string> {
  // Clear out this user's sessions that are long over, so the table does not grow forever.
  await db(
    `DELETE FROM user_session
      WHERE user_id = $1
        AND (revoked_at < now() - interval '30 days'
             OR last_seen_at < now() - make_interval(secs => $2) - interval '30 days')`,
    [options.userId, SESSION_LISTED_SECONDS]
  );
  const network = coarseNetwork(options.ip);
  const [row] = await db<{ id: string }>(
    `INSERT INTO user_session (user_id, user_agent, network)
     VALUES ($1, $2, network($3::inet))
     RETURNING id`,
    [
      options.userId,
      options.userAgent?.slice(0, 512) ?? null,
      network,
    ]
  );
  return row.id;
}

export interface SessionCheck {
  role: string;
  username: string;
  lastActive: Date | null;
  lastSeenAt: Date;
}

// The per-request check behind every logged-in page: the session exists, belongs to this
// user, is not revoked, and the account is not deleted. Null otherwise.
export async function checkSession(userId: string, sessionId: string): Promise<SessionCheck | null> {
  if (!isUuid(userId) || !isUuid(sessionId)) {
    return null;
  }
  const [row] = await db<SessionCheck>(
    `SELECT u.role,
            u.username,
            u.last_active AS "lastActive",
            s.last_seen_at AS "lastSeenAt"
       FROM user_session s
       JOIN app_user u ON u.id = s.user_id
      WHERE s.id = $2
        AND s.user_id = $1
        AND s.revoked_at IS NULL
        AND u.deleted_at IS NULL`,
    [userId, sessionId]
  );
  return row ?? null;
}

// Records that the session (and its user) was just seen, if the last record is stale.
// Returns whether it wrote.
export async function touchSession(userId: string, sessionId: string, check: SessionCheck) {
  const now = Date.now();
  const stale = (at: Date | null) => !at || now - new Date(at).getTime() > SESSION_TOUCH_INTERVAL_MS;
  if (!stale(check.lastSeenAt) && !stale(check.lastActive)) {
    return false;
  }
  await db(
    `WITH seen AS (
       UPDATE user_session SET last_seen_at = now() WHERE id = $2
     )
     UPDATE app_user SET last_active = now() WHERE id = $1`,
    [userId, sessionId]
  );
  // last_active is overwritten each time, so the day is also noted in the event table,
  // which is what "active users per day or week" is counted from (migration 017).
  await recordActive(userId);
  return true;
}

export interface SessionListing {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  userAgent: string | null;
  network: string | null;
}

// The sessions that may still have a live token, most recently used first.
export async function listSessions(userId: string): Promise<SessionListing[]> {
  if (!isUuid(userId)) {
    return [];
  }
  return db<SessionListing>(
    `SELECT id,
            created_at AS "createdAt",
            last_seen_at AS "lastSeenAt",
            user_agent AS "userAgent",
            network::text AS network
       FROM user_session
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND last_seen_at > now() - make_interval(secs => $2)
      ORDER BY last_seen_at DESC, created_at DESC`,
    [userId, SESSION_LISTED_SECONDS]
  );
}

// Logs one session out. Only the user's own: false when it is not theirs or already over.
export async function revokeSession(userId: string, sessionId: string): Promise<boolean> {
  if (!isUuid(userId) || !isUuid(sessionId)) {
    return false;
  }
  const rows = await db(
    `UPDATE user_session
        SET revoked_at = now()
      WHERE id = $2 AND user_id = $1 AND revoked_at IS NULL
      RETURNING id`,
    [userId, sessionId]
  );
  return rows.length > 0;
}

// "Log out everywhere else", and what a password change would do. Pass no session to log
// out everywhere. Returns how many were revoked.
export async function revokeOtherSessions(userId: string, keepSessionId?: string): Promise<number> {
  const rows = await db(
    `UPDATE user_session
        SET revoked_at = now()
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND ($2::uuid IS NULL OR id <> $2::uuid)
      RETURNING id`,
    [userId, isUuid(keepSessionId) ? keepSessionId : null]
  );
  return rows.length;
}
