import { NextResponse } from 'next/server';
import { getUserFromAccessToken } from '@/auth/lib';
import { getMeme } from '@/db/queries/memes';
import {
  addTagToMeme,
  findOrCreateTag,
  getTagAdder,
  listTagsForMeme,
  tagExists,
  voteOnTag,
} from '@/db/queries/tags';

const MAX_TAG_LENGTH = 50;

// GET: All tags on a meme with their scores, highest first. `own` and `myVote` describe
// the logged-in user, taken from the session. This used to read a userId query parameter
// that the client never sent, so `own` was always false.
export async function GET(
  request: Request,
  { params }: { params: { memeId: string } }
) {
  try {
    const user = await getUserFromAccessToken();
    const tags = await listTagsForMeme(params.memeId, user?.id);
    return NextResponse.json({ tags });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Failed to fetch tags' },
      { status: 500 }
    );
  }
}

// POST: Either add a tag to a meme or add/update a vote for an existing tag
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

    const meme = await getMeme(params.memeId);
    if (!meme) {
      return NextResponse.json({ error: 'Meme not found' }, { status: 404 });
    }

    const body = await request.json();

    // Check if the request is to add a vote (vote field provided)
    if (typeof body.vote !== 'undefined') {
      const { tagId, vote } = body;
      // Validate tagId and vote types/values
      if (!tagId || (vote !== 1 && vote !== -1)) {
        return NextResponse.json(
          { error: 'Invalid tagId or vote value. Vote must be 1 or -1.' },
          { status: 400 }
        );
      }

      const adder = await getTagAdder(meme.id, tagId);
      if (!adder) {
        return NextResponse.json(
          { error: 'That tag is not on this meme.' },
          { status: 404 }
        );
      }

      // Disallow vote if the user added the tag themselves.
      if (adder === user.id) {
        return NextResponse.json(
          { error: 'Cannot vote on a tag you added.' },
          { status: 400 }
        );
      }

      await voteOnTag(meme.id, tagId, user.id, vote);
      return NextResponse.json({ message: 'Vote recorded successfully' });
    }
    // Check if the request is to add a tag (either via tagId or tagName)
    else if (body.tagId || body.tagName) {
      let tagId = body.tagId;
      // If tagName is provided, check if the tag exists (case insensitive). Create it if not.
      if (body.tagName) {
        const tagName =
          typeof body.tagName === 'string' ? body.tagName.trim() : '';
        if (!tagName) {
          return NextResponse.json(
            { error: 'Invalid tagName' },
            { status: 400 }
          );
        }
        if (tagName.length > MAX_TAG_LENGTH) {
          return NextResponse.json(
            { error: `Tag is too long (limit ${MAX_TAG_LENGTH} characters).` },
            { status: 400 }
          );
        }
        tagId = await findOrCreateTag(tagName, user.id);
      } else if (!(await tagExists(tagId))) {
        // tagId came straight from the client, so confirm it is a real tag rather than
        // letting an arbitrary value reach the insert.
        return NextResponse.json({ error: 'Unknown tagId' }, { status: 400 });
      }

      await addTagToMeme(meme.id, tagId, user.id);
      return NextResponse.json({ message: 'Tag added successfully' });
    } else {
      return NextResponse.json(
        {
          error:
            'Missing required fields: tagId or tagName (and optionally vote)',
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
