import { db } from '@/db/db';
import { isSlug, isUuid } from './ids';
import type { TakedownReason } from '@/constants/takedowns';

// Takedowns (migration 018): removing a meme for a copyright claim or similar. Unlike a
// normal delete, which hides the meme and keeps its file so it can be undone, a takedown
// deletes the file from storage and records why. It also sets deleted_at, so every feed,
// count, search and tag page leaves the meme out exactly as they do for a deleted one. The
// reasons and their public notices are in src/constants/takedowns.ts.

export interface Takedown {
  id: string;
  slug: string;
  takenDownAt: Date;
  reason: TakedownReason;
}

// A taken-down meme by uuid or slug, for the notice on its page. Null when the meme exists
// and is live, was only deleted, or never existed.
export async function getTakedown(idOrSlug: string): Promise<Takedown | null> {
  const column = isUuid(idOrSlug) ? 'id = $1::uuid' : isSlug(idOrSlug) ? 'slug = $1' : null;
  if (!column) {
    return null;
  }
  const [row] = await db<Takedown>(
    `SELECT id,
            slug,
            taken_down_at AS "takenDownAt",
            takedown_reason AS reason
       FROM meme
      WHERE ${column}
        AND taken_down_at IS NOT NULL`,
    [idOrSlug]
  );
  return row ?? null;
}

// Marks a meme taken down and returns the storage key whose file the caller must delete.
// Works on a meme that was already deleted (a takedown can arrive after the uploader
// deleted it). Taking down a meme twice keeps the first record and still returns the key,
// so a file deletion that failed the first time can be retried. Null when there is no such
// meme.
export async function markTakenDown(options: {
  memeId: string;
  reason: TakedownReason;
  note: string | null;
  adminId: string;
}): Promise<{ s3Key: string } | null> {
  if (!isUuid(options.memeId)) {
    return null;
  }
  const [row] = await db<{ s3Key: string }>(
    `UPDATE meme
        SET taken_down_at = COALESCE(taken_down_at, now()),
            takedown_reason = COALESCE(takedown_reason, $2),
            takedown_note = COALESCE(takedown_note, $3),
            taken_down_by = COALESCE(taken_down_by, $4),
            deleted_at = COALESCE(deleted_at, now())
      WHERE id = $1
      RETURNING s3_key AS "s3Key"`,
    [options.memeId, options.reason, options.note, options.adminId]
  );
  return row ?? null;
}
