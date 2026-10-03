import { NextResponse } from 'next/server';
import { getUserFromAccessToken } from '@/auth/lib';
import { getMeme } from '@/db/queries/memes';
import {
  addTranscription,
  getCurrentTranscription,
} from '@/db/queries/transcriptions';

const MAX_TRANSCRIPTION_LENGTH = 5000;

// GET: Fetch the most recent transcription for this meme
export async function GET(
  request: Request,
  { params }: { params: { memeId: string } }
) {
  try {
    const transcription = await getCurrentTranscription(params.memeId);

    if (!transcription) {
      return NextResponse.json({ text: '' });
    }

    return NextResponse.json(transcription);
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

    const meme = await getMeme(params.memeId);
    if (!meme) {
      return NextResponse.json({ error: 'Meme not found' }, { status: 404 });
    }

    // The editor is the session user. The client used to send edited_by and the server
    // only checked it matched -- there was never a reason to accept it at all.
    const transcription = await addTranscription(meme.id, text, user.id);

    return NextResponse.json({
      message: 'Transcription updated successfully',
      transcription,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Failed to update transcription' },
      { status: 500 }
    );
  }
}
