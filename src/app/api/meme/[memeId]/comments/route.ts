import { addComment } from '@/db/queries/comments';
import { notify } from '@/db/queries/notifications';
import { route } from '@/server/route';
import { requireMeme } from '@/server/require';
import { commentSchema, resolveCommentMeme } from '@/server/comments';

// POST { body, meme? }: comments on a meme, with text, another meme, or both. Returns the
// comment as the list shows it.
export const POST = route({
  auth: 'required',
  body: commentSchema,
  handler: async ({ user, body, params }) => {
    const meme = await requireMeme(params.memeId);
    const ref = await resolveCommentMeme(body, meme.id);
    const comment = await addComment({
      memeId: meme.id,
      authorId: user.id,
      body: body.body,
      refMemeId: ref?.id ?? null,
    });
    await notify({
      recipientId: meme.uploaderId,
      kind: 'comment',
      actorId: user.id,
      memeId: meme.id,
      commentId: comment.id,
    });
    // The uploader already hears about the comment itself.
    if (ref && ref.uploaderId !== meme.uploaderId) {
      await notify({
        recipientId: ref.uploaderId,
        kind: 'meme_quoted',
        actorId: user.id,
        memeId: meme.id,
        commentId: comment.id,
      });
    }
    return { comment };
  },
});
