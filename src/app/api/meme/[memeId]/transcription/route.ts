import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import { getUserFromAccessToken } from '@/auth/lib';

const MAX_TRANSCRIPTION_LENGTH = 5000;

// GET: Fetch the most recent transcription for this meme
export async function GET(
  request: Request,
  { params }: { params: { memeId: string } }
) {
  try {
    const transcriptionData = await db(
      `SELECT 
        mt.text as transcription,
        u.username as "edited_by_username",
        mt.edited_by as "edited_by"
      FROM "MemeTranscription" mt
      LEFT JOIN "User" u ON u.id = mt.edited_by
      WHERE mt.meme_id = $1
      GROUP BY mt.text, u.username, mt.edited_by, mt.created_at
      ORDER BY mt.created_at DESC 
      LIMIT 1`,
      [params.memeId]
    );

    if (!transcriptionData || transcriptionData.length === 0) {
      return NextResponse.json({ text: '' });
    }

    return NextResponse.json({
      text: transcriptionData[0].transcription,
      editedBy: transcriptionData[0].edited_by,
      editedByUsername: transcriptionData[0].edited_by_username,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Failed to fetch transcription' },
      { status: 500 }
    );
  }
}

// POST: Create a new transcription entry for this meme with auth
export async function POST(
  request: Request,
  { params }: { params: { memeId: string } }
) {
  try {
    // Authenticate the user
    const user = await getUserFromAccessToken();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const text = typeof body.text === 'string' ? body.text.trim() : '';

    if (!text) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    if (text.length > MAX_TRANSCRIPTION_LENGTH) {
      return NextResponse.json(
        {
          error: `Transcription is too long (limit ${MAX_TRANSCRIPTION_LENGTH} characters).`,
        },
        { status: 400 }
      );
    }

    // The editor is the session user. The client used to send edited_by and the server
    // only checked it matched -- there was never a reason to accept it at all.
    const editedBy = user.id;

    const result = await db(
      `INSERT INTO "MemeTranscription" (meme_id, text, edited_by) VALUES ($1, $2, $3) RETURNING *`,
      [params.memeId, text, editedBy]
    );

    // Fetch the username for the edited_by user
    const userInfo = await db(`SELECT username FROM "User" WHERE id = $1`, [
      editedBy,
    ]);

    const editedByUsername =
      userInfo && userInfo[0] ? userInfo[0].username : null;

    return NextResponse.json({
      message: 'Transcription updated successfully',
      transcription: { ...result[0], editedByUsername: editedByUsername },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Failed to update transcription' },
      { status: 500 }
    );
  }
}
