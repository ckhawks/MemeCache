import { transaction } from '@/db/db';
import { isUuid } from './ids';

// View counts (migration 015). One row per counted view; meme.view_count is their running
// total, read by every card through CARD_COLUMNS.

// A viewer counts again once this long has passed since their last counted view of a meme.
export const VIEW_WINDOW = '24 hours';

// Exactly one of the two: a logged-in user, or a logged-out visitor's cookie id.
export type Viewer = { userId: string } | { visitorKey: string };

// Records a view and returns whether it counted. It does not when the meme is missing or
// deleted, when the viewer is its uploader, or when the same viewer already has a view of
// it inside VIEW_WINDOW.
//
// Two requests from one viewer at the same moment (a double mount, a retried beacon) would
// both pass the "no recent view" check, so each takes a lock on that viewer and meme first,
// and the second sees the first's row once it gets through.
export async function recordView(memeId: string, viewer: Viewer): Promise<boolean> {
  const viewerId = 'userId' in viewer ? viewer.userId : null;
  const visitorKey = 'visitorKey' in viewer ? viewer.visitorKey : null;
  if (!isUuid(memeId) || !isUuid(viewerId ?? visitorKey)) {
    return false;
  }

  // One column or the other, so the check can use that kind of viewer's index.
  const match = viewerId ? 'v.viewer_id = $2::uuid' : 'v.visitor_key = $3::uuid';

  return transaction(async (query) => {
    await query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `meme_view:${memeId}:${viewerId ?? visitorKey}`,
    ]);
    const rows = await query(
      `WITH counted AS (
         INSERT INTO meme_view (meme_id, viewer_id, visitor_key)
         SELECT m.id, $2::uuid, $3::uuid
           FROM meme m
          WHERE m.id = $1
            AND m.deleted_at IS NULL
            AND m.uploader_id IS DISTINCT FROM $2::uuid
            AND NOT EXISTS (
              SELECT 1
                FROM meme_view v
               WHERE v.meme_id = m.id
                 AND ${match}
                 AND v.created_at > now() - $4::interval
            )
         RETURNING meme_id
       )
       UPDATE meme SET view_count = view_count + 1
        WHERE id IN (SELECT meme_id FROM counted)
       RETURNING id`,
      [memeId, viewerId, visitorKey, VIEW_WINDOW]
    );
    return rows.length > 0;
  });
}
