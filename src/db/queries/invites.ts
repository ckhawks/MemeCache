import { randomInt } from 'node:crypto';
import { db } from '@/db/db';
import { isUuid } from './ids';
import type { SessionUser } from './users';

// Invite codes (migration 009). Registration needs one; admins make them at /admin/invites.

export type InviteStatus = 'active' | 'disabled' | 'expired' | 'used-up';

export interface InviteCode {
  id: string;
  code: string;
  note: string | null;
  // Null: no limit.
  maxUses: number | null;
  uses: number;
  expiresAt: Date | null;
  disabledAt: Date | null;
  createdAt: Date;
  // Username of the admin who made it.
  createdBy: string | null;
  status: InviteStatus;
  // Usernames that signed up with it, oldest first.
  usedBy: string[];
}

// Why a code can or cannot be used right now, for a table aliased c. Disabled wins over
// expired, which wins over used up: that is the order an admin would want to read them.
const STATUS = `CASE
  WHEN c.disabled_at IS NOT NULL THEN 'disabled'
  WHEN c.expires_at IS NOT NULL AND c.expires_at <= now() THEN 'expired'
  WHEN c.max_uses IS NOT NULL AND c.uses >= c.max_uses THEN 'used-up'
  ELSE 'active'
END`;

// Digits and uppercase letters minus 0 O 1 I, the slug alphabet from migration 004 without
// its lowercase half: codes match case-insensitively, so lowercase would only add letters
// that read the same. 32^8 is about a trillion.
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateInviteCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export async function listInviteCodes(): Promise<InviteCode[]> {
  return db<InviteCode>(
    `SELECT c.id,
            c.code,
            c.note,
            c.max_uses AS "maxUses",
            c.uses,
            c.expires_at AS "expiresAt",
            c.disabled_at AS "disabledAt",
            c.created_at AS "createdAt",
            creator.username AS "createdBy",
            ${STATUS} AS status,
            COALESCE(
              (SELECT json_agg(u.username ORDER BY u.created_at)
                 FROM app_user u
                WHERE u.invited_by_code_id = c.id),
              '[]'
            ) AS "usedBy"
       FROM invite_code c
       LEFT JOIN app_user creator ON creator.id = c.created_by
      ORDER BY c.created_at DESC`
  );
}

// Null when the code is already taken (case-insensitively).
export async function createInviteCode(invite: {
  code: string;
  note: string | null;
  maxUses: number | null;
  expiresAt: Date | null;
  createdBy: string;
}): Promise<{ id: string; code: string } | null> {
  const [created] = await db<{ id: string; code: string }>(
    `INSERT INTO invite_code (code, note, max_uses, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ((lower(code))) DO NOTHING
     RETURNING id, code`,
    [invite.code, invite.note, invite.maxUses, invite.expiresAt, invite.createdBy]
  );
  return created ?? null;
}

// Disabling keeps the row, so the accounts that used the code still show where they came
// from. It can be turned back on.
export async function setInviteCodeDisabled(id: string, disabled: boolean): Promise<boolean> {
  if (!isUuid(id)) {
    return false;
  }
  const rows = await db(
    `UPDATE invite_code
        SET disabled_at = CASE WHEN $2 THEN COALESCE(disabled_at, now()) END
      WHERE id = $1
      RETURNING id`,
    [id, disabled]
  );
  return rows.length > 0;
}

export type InviteCheck = InviteStatus | 'unknown';

// The environment's ACCESS_CODE counts only while no invite code exists at all, disabled
// ones included. It keeps a deploy of migration 009 working until an admin makes the first
// code, and stops counting the moment one exists, so the old shared code cannot outlive it.
const FALLBACK_ALLOWED = `$2::text <> '' AND $1 = $2 AND NOT EXISTS (SELECT 1 FROM invite_code)`;

// Read-only: what registration would make of a code, for its error message. Whether the
// signup really gets a use is decided by createInvitedUser, which can still lose a race
// for the last one.
export async function checkInviteCode(code: string, fallbackCode?: string): Promise<InviteCheck> {
  const [row] = await db<{ status: InviteCheck }>(
    `SELECT COALESCE(
       (SELECT ${STATUS} FROM invite_code c WHERE lower(c.code) = lower($1)),
       CASE WHEN ${FALLBACK_ALLOWED} THEN 'active' ELSE 'unknown' END
     ) AS status`,
    [code, fallbackCode ?? '']
  );
  return row.status;
}

// Creates the account and takes one use of its code in a single statement, so both happen
// or neither does. The UPDATE only matches a code that is usable right now; two signups
// racing for a code's last use both wait on its row lock, and Postgres re-checks the WHERE
// for the second one after the first commits, so it finds the code used up. Null when the
// code was not usable. A taken username or email throws (the unique indexes), which also
// rolls the use back.
export async function createInvitedUser(
  user: {
    username: string;
    email: string;
    passwordHash: string;
  },
  code: string,
  fallbackCode?: string
): Promise<SessionUser | null> {
  const [created] = await db<SessionUser>(
    `WITH claimed AS (
       UPDATE invite_code c
          SET uses = c.uses + 1
        WHERE lower(c.code) = lower($1)
          AND ${STATUS} = 'active'
        RETURNING c.id
     )
     INSERT INTO app_user (username, email, password_hash, invited_by_code_id)
     SELECT $3, $4, $5, (SELECT id FROM claimed)
      WHERE EXISTS (SELECT 1 FROM claimed)
         OR (${FALLBACK_ALLOWED})
     RETURNING id, username, email, role`,
    [code, fallbackCode ?? '', user.username, user.email, user.passwordHash]
  );
  return created ?? null;
}
