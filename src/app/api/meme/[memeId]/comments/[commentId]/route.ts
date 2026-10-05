import { isModerator } from '@/auth/role';
import { deleteComment, editComment, getComment, isCommentEditable } from '@/db/queries/comments';
import { notify } from '@/db/queries/notifications';
import { HttpError, route } from '@/server/route';
import { requireMeme } from '@/server/require';
import { commentSchema, resolveCommentMeme } from '@/server/comments';
import { COMMENT_EDIT_MINUTES } from '@/constants/comments';

const TOO_LATE = `Comments can only be edited for ${COMMENT_EDIT_MINUTES} minutes after posting.`;

async function requireComment(memeId: string, commentId: string) {
  const comment = await getComment(commentId);
  if (!comment || comment.memeId !== memeId) {
    throw new HttpError(404, 'That comment does not exist.');
  }
  return comment;
}

// PUT { body, meme? }: the author rewrites their comment, within COMMENT_EDIT_MINUTES of
// posting it. Returns the comment as the list shows it.
export const PUT = route({
  auth: 'required',
  body: commentSchema,
  handler: async ({ user, body, params }) => {
    const meme = await requireMeme(params.memeId);
    const before = await requireComment(meme.id, params.commentId);
    if (before.authorId !== user.id) {
      throw new HttpError(403, 'Only the person who wrote a comment can edit it.');
    }
    if (before.deleted) {
      throw new HttpError(400, 'That comment was deleted.');
    }
    if (!(await isCommentEditable(before.id))) {
      throw new HttpError(403, TOO_LATE);
    }
    const ref = await resolveCommentMeme(body, meme.id);
    // Checked again in the update itself, in case the window closed in between.
    if (!(await editComment(before.id, user.id, body.body, ref?.id ?? null))) {
      throw new HttpError(403, TOO_LATE);
    }
    // A meme the edit attached is news to its uploader. One told already is not told again.
    if (ref && ref.uploaderId !== meme.uploaderId) {
      await notify({
        recipientId: ref.uploaderId,
        kind: 'meme_quoted',
        actorId: user.id,
        memeId: meme.id,
        commentId: before.id,
      });
    }
    return { comment: await getComment(before.id) };
  },
});

// DELETE: deletes a comment, leaving "deleted" in its place. Its author can, and moderators
// can delete anyone's.
export const DELETE = route({
  auth: 'required',
  handler: async ({ user, params }) => {
    const meme = await requireMeme(params.memeId);
    const comment = await requireComment(meme.id, params.commentId);
    if (comment.authorId !== user.id && !isModerator(user)) {
      throw new HttpError(403, 'Only the person who wrote a comment, or a moderator, can delete it.');
    }
    await deleteComment(comment.id, user.id);
    return { comment: await getComment(comment.id) };
  },
});
