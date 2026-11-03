import { getComment } from '@/db/queries/comments';
import { listReactionsFor, setReaction } from '@/db/queries/reactions';
import { notify } from '@/db/queries/notifications';
import { HttpError, route } from '@/server/route';
import { requireMeme } from '@/server/require';
import { reactionSchema, REACTION_LIMIT_MESSAGE } from '@/server/reactions';

// PUT { emoji, reacted }: puts the caller's emoji on a comment or takes it back (migration
// 023), and returns the comment's reactions as they now stand. A deleted comment takes no
// new reactions, though one can still be taken back.
export const PUT = route({
  auth: 'required',
  body: reactionSchema,
  handler: async ({ user, body, params }) => {
    const meme = await requireMeme(params.memeId);
    const comment = await getComment(params.commentId);
    if (!comment || comment.memeId !== meme.id) {
      throw new HttpError(404, 'That comment does not exist.');
    }
    if (body.reacted && comment.deleted) {
      throw new HttpError(400, 'That comment was deleted.');
    }
    const result = await setReaction('comment', comment.id, user.id, body.emoji, body.reacted);
    if (result === 'limit') {
      throw new HttpError(400, REACTION_LIMIT_MESSAGE);
    }
    if (result === 'added') {
      await notify({
        recipientId: comment.authorId,
        kind: 'comment_reaction',
        actorId: user.id,
        memeId: meme.id,
        commentId: comment.id,
      });
    }
    return { reactions: await listReactionsFor('comment', comment.id, user.id) };
  },
});
