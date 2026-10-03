import { z } from 'zod';
import { getTagAdder, voteOnTag } from '@/db/queries/tags';
import { HttpError, route } from '@/server/route';
import { requireMeme } from '@/server/require';

// POST { vote: 1 | -1 }: sets the caller's vote on a tag on a meme.
export const POST = route({
  auth: 'required',
  body: z.object({
    vote: z.union([z.literal(1), z.literal(-1)], 'A vote is 1 or -1.'),
  }),
  handler: async ({ user, body, params }) => {
    const meme = await requireMeme(params.memeId);

    const adder = await getTagAdder(meme.id, params.tagId);
    if (!adder) {
      throw new HttpError(404, 'That tag is not on this meme.');
    }
    // Adding a tag already counts as a +1 from whoever added it.
    if (adder === user.id) {
      throw new HttpError(400, 'You cannot vote on a tag you added.');
    }

    await voteOnTag(meme.id, params.tagId, user.id, body.vote);
    return { ok: true };
  },
});
