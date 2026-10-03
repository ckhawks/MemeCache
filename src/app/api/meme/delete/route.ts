import { NextResponse } from 'next/server';
import { getUserFromAccessToken } from '@/auth/lib';
import { isModerator } from '@/auth/role';
import { getMeme, softDeleteMeme } from '@/db/queries/memes';

// change this to be a server action

export async function POST(request: Request) {
  try {
    const user = await getUserFromAccessToken();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const memeId = formData.get('memeId');

    if (!memeId) {
      return NextResponse.json(
        { error: 'No memeId provided' },
        { status: 400 }
      );
    }

    const meme = await getMeme(memeId.toString());

    if (!meme) {
      return NextResponse.json(
        { error: 'Could not find meme by provided memeId' },
        { status: 404 }
      );
    }

    // The meme has to actually belong to the caller. Checking only that the caller is
    // who they claim to be let any logged-in user delete anyone else's meme.
    if (meme.uploaderId !== user.id && !isModerator(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Soft delete: the row and the file stay. Deleting the file first and the row second
    // used to lose the file whenever the row delete then failed.
    await softDeleteMeme(meme.id);

    return NextResponse.json(
      {
        message: 'Deleted meme successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting meme:', error);
    return NextResponse.json(
      { error: 'Failed to delete meme' },
      { status: 500 }
    );
  }
}
