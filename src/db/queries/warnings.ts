import { db } from '@/db/db';
import { isUuid } from './ids';
import {
  WARNING_DISPLAYS,
  type ContentWarning,
  type WarningDisplay,
} from '@/constants/contentWarnings';

// Content warnings on memes (migration 007). Feeds get them through warningsSql in each
// row; the meme page lists them with who added each one.

// A meme's warnings as a text array, in a fixed order, empty when it has none. `memeId` is
// a SQL expression, so a feed can select it per row.
export function warningsSql(memeId: string) {
  return `(
    SELECT COALESCE(array_agg(w_w.warning ORDER BY w_w.warning), '{}')
      FROM meme_content_warning w_w
     WHERE w_w.meme_id = ${memeId}
  )`;
}

export interface MemeWarning {
  warning: ContentWarning;
  // Null when the account that added it is gone.
  addedByUsername: string | null;
  // The viewer added it, so they may take it off.
  own: boolean;
}

export async function listWarningsForMeme(
  memeId: string,
  viewerId?: string
): Promise<MemeWarning[]> {
  return db<MemeWarning>(
    `SELECT w.warning,
            u.username AS "addedByUsername",
            COALESCE(w.added_by = $2::uuid, false) AS own
       FROM meme_content_warning w
       LEFT JOIN app_user u ON u.id = w.added_by
      WHERE w.meme_id = $1
      ORDER BY w.warning`,
    [memeId, isUuid(viewerId) ? viewerId : null]
  );
}

// Adds warnings to a meme. Idempotent: one already there keeps whoever added it first.
export async function addWarnings(memeId: string, warnings: ContentWarning[], userId: string) {
  if (warnings.length === 0) {
    return;
  }
  await db(
    `INSERT INTO meme_content_warning (meme_id, warning, added_by)
     SELECT $1, unnest($2::text[]), $3
     ON CONFLICT DO NOTHING`,
    [memeId, warnings, userId]
  );
}

// Who added a warning: undefined when the meme does not carry it, null when their account
// is gone.
export async function getWarningAdder(
  memeId: string,
  warning: ContentWarning
): Promise<string | null | undefined> {
  const [row] = await db<{ addedBy: string | null }>(
    `SELECT added_by AS "addedBy"
       FROM meme_content_warning
      WHERE meme_id = $1 AND warning = $2`,
    [memeId, warning]
  );
  return row ? row.addedBy : undefined;
}

export async function removeWarning(memeId: string, warning: ContentWarning) {
  await db(`DELETE FROM meme_content_warning WHERE meme_id = $1 AND warning = $2`, [
    memeId,
    warning,
  ]);
}

export async function getWarningDisplay(userId: string): Promise<WarningDisplay> {
  if (!isUuid(userId)) {
    return 'blur';
  }
  const [row] = await db<{ display: WarningDisplay }>(
    `SELECT warning_display AS display FROM app_user WHERE id = $1`,
    [userId]
  );
  return row && WARNING_DISPLAYS.includes(row.display) ? row.display : 'blur';
}

export async function setWarningDisplay(userId: string, display: WarningDisplay) {
  await db(`UPDATE app_user SET warning_display = $2 WHERE id = $1`, [userId, display]);
}
