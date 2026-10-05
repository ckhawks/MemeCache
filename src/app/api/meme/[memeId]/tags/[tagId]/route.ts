import { getTagAdder, getTagName, hasOthersUpvote, removeTagFromMeme } from '@/db/queries/tags';
import { notify } from '@/db/queries/notifications';
import { logModeration } from '@/db/queries/moderation';
import { isModerator } from '@/auth/role';
import { HttpError, route } from '@/server/route';
import { requireMeme } from '@/server/require';

// DELETE: takes a tag off a meme. The person who added it can, until someone else upvotes
// it; moderators always can, and a moderator taking off someone else's tag goes in the
// moderation log. The row and its votes are kept (removeTagFromMeme).
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
    if (!(await removeTagFromMeme(meme.id, params.tagId, user.id))) {
      throw new HttpError(404, 'That tag is not on this meme.');
    }
    // Taking back your own tag tells nobody.
    await notify({
      recipientId: adder,
      kind: 'tag_removed',
      actorId: user.id,
      memeId: meme.id,
      tagId: params.tagId,
    });
    if (adder !== user.id) {
      await logModeration({
        actorId: user.id,
        action: 'tag_remove',
        targetType: 'meme',
        targetId: meme.id,
        data: {
          tagId: params.tagId,
          tagName: await getTagName(params.tagId),
          addedBy: adder,
        },
      });
    }
    return { ok: true };
  },
});
