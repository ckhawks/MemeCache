import { db } from '@/db/db';
import { isUuid } from './ids';

export interface Transcription {
  text: string;
  editedBy: string;
  editedByUsername: string;
  createdAt: Date;
}

// Transcriptions are append-only. The newest row is the current text.
export async function getCurrentTranscription(memeId: string): Promise<Transcription | null> {
  if (!isUuid(memeId)) {
    return null;
  }
  const [row] = await db<Transcription>(
    `SELECT mt.text,
            mt.edited_by AS "editedBy",
            u.username AS "editedByUsername",
            mt.created_at AS "createdAt"
       FROM meme_transcription mt
       JOIN app_user u ON u.id = mt.edited_by
      WHERE mt.meme_id = $1
      ORDER BY mt.created_at DESC, mt.id DESC
      LIMIT 1`,
    [memeId]
  );
  return row ?? null;
}

export async function addTranscription(
  memeId: string,
  text: string,
  editedBy: string
): Promise<Transcription> {
  const [row] = await db<Transcription>(
    `WITH inserted AS (
       INSERT INTO meme_transcription (meme_id, text, edited_by)
       VALUES ($1, $2, $3)
       RETURNING text, edited_by, created_at
     )
     SELECT i.text,
            i.edited_by AS "editedBy",
            u.username AS "editedByUsername",
            i.created_at AS "createdAt"
       FROM inserted i
       JOIN app_user u ON u.id = i.edited_by`,
    [memeId, text, editedBy]
  );
  return row;
}
