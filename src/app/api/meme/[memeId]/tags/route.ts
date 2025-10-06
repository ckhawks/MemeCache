import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import { getUserFromAccessToken } from '@/auth/lib';

// GET: Retrieve all tags with scores and metadata for a meme ordered by score DESC
export async function GET(
  request: Request,
  { params }: { params: { memeId: string } }
) {
  try {
    const url = new URL(request.url);
    const currentUserId = url.searchParams.get('userId');
    let tagsData;
    if (currentUserId) {
      tagsData = await db(
        `SELECT 
             t.id,
             t.name,
             COALESCE(SUM(v.vote), 0) AS score,
             COUNT(DISTINCT mt.addedBy) AS contributors,
             CASE 
               WHEN EXISTS (
                 SELECT 1 FROM "MemeTag" mt2 
                 WHERE mt2.memeId = $1 AND mt2.tagId = t.id AND mt2.addedBy = $2
               ) THEN true 
               ELSE false 
             END AS own
           FROM "Tag" t
           JOIN "MemeTag" mt ON mt.tagId = t.id
           LEFT JOIN "MemeTagVote" v ON v.tagId = t.id AND v.memeId = mt.memeId
           WHERE mt.memeId = $1
           GROUP BY t.id
           ORDER BY score DESC, contributors DESC`,
        [params.memeId, currentUserId]
      );
    } else {
      tagsData = await db(
        `SELECT 
             t.id,
             t.name,
             COALESCE(SUM(v.vote), 0) AS score,
             COUNT(DISTINCT mt.addedBy) AS contributors,
             false AS own
           FROM "Tag" t
           JOIN "MemeTag" mt ON mt.tagId = t.id
           LEFT JOIN "MemeTagVote" v ON v.tagId = t.id AND v.memeId = mt.memeId
           WHERE mt.memeId = $1
           GROUP BY t.id
           ORDER BY score DESC, contributors DESC`,
        [params.memeId]
      );
    }

    return NextResponse.json({ tags: tagsData });
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

      // Disallow vote if the user added the tag themselves.
      const selfTag = await db(
        `SELECT 1 FROM "MemeTag" WHERE memeId = $1 AND tagId = $2 AND addedBy = $3`,
        [params.memeId, tagId, user.id]
      );
      if (selfTag.length > 0) {
        return NextResponse.json(
          { error: 'Cannot vote on a tag you added.' },
          { status: 400 }
        );
      }

      // Insert vote into MemeTagVote table.
      // Using ON CONFLICT to update vote if the user has already voted.
      await db(
        `INSERT INTO "MemeTagVote" (memeId, tagId, voterId, vote)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (memeId, tagId, voterId)
           DO UPDATE SET vote = $4`,
        [params.memeId, tagId, user.id, vote]
      );
      return NextResponse.json({ message: 'Vote recorded successfully' });
    }
    // Check if the request is to add a tag (either via tagId or tagName)
    else if (body.tagId || body.tagName) {
      let tagId = body.tagId;
      // If tagName is provided, check if the tag exists (case insensitive). Create it if not.
      if (body.tagName) {
        const tagName = body.tagName.trim();
        if (!tagName) {
          return NextResponse.json(
            { error: 'Invalid tagName' },
            { status: 400 }
          );
        }
        const existingTags = await db(
          `SELECT id FROM "Tag" WHERE LOWER(name) = LOWER($1)`,
          [tagName]
        );
        if (existingTags.length > 0) {
          tagId = existingTags[0].id;
        } else {
          // Create the new tag and get its id
          const createdTag = await db(
            `INSERT INTO "Tag" (name)
               VALUES ($1)
               RETURNING id`,
            [tagName]
          );
          tagId = createdTag[0].id;
        }
      }

      // Insert into MemeTag table.
      await db(
        `INSERT INTO "MemeTag" (memeId, tagId, addedBy)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
        [params.memeId, tagId, user.id]
      );
      // Automatically add a +1 vote when the tag is added.
      await db(
        `INSERT INTO "MemeTagVote" (memeId, tagId, voterId, vote)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (memeId, tagId, voterId)
         DO UPDATE SET vote = 1`,
        [params.memeId, tagId, user.id]
      );
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
