import { getTagAdder, hasOthersUpvote, removeTagFromMeme } from '@/db/queries/tags';
import { isModerator } from '@/auth/role';
import { HttpError, route } from '@/server/route';
import { requireMeme } from '@/server/require';

// DELETE: takes a tag off a meme. The person who added it can, until someone else upvotes
// it; moderators always can.
export const DELETE = route({
  auth: 'required',
  handler: async ({ user, params }) => {
    const meme = await requireMeme(params.memeId);
    const adder = await getTagAdder(meme.id, params.tagId);
    if (!adder) {
      throw new HttpError(404, 'That tag is not on this meme.');
    }
    if (!isModerator(user)) {
      if (adder !== user.id) {
        throw new HttpError(403, 'Only the person who added a tag can remove it.');
      }
      if (await hasOthersUpvote(meme.id, params.tagId)) {
        throw new HttpError(403, 'Someone else has upvoted this tag, so it stays.');
      }
    }
    await removeTagFromMeme(meme.id, params.tagId);
    return { ok: true };
  },
});
