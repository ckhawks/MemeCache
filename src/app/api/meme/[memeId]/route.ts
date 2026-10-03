import { isModerator } from '@/auth/role';
import { softDeleteMeme } from '@/db/queries/memes';
import { HttpError, route } from '@/server/route';
import { requireMeme } from '@/server/require';

// DELETE: soft-deletes a meme. The uploader or a moderator only.
export const DELETE = route({
  auth: 'required',
  handler: async ({ user, params }) => {
    const meme = await requireMeme(params.memeId);

    if (meme.uploaderId !== user.id && !isModerator(user)) {
      throw new HttpError(403, 'You can only delete your own memes.');
    }

    // The row and the file stay, hidden everywhere, so a takedown can hold content.
    await softDeleteMeme(meme.id);
    return { ok: true };
  },
});
