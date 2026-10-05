import { getWarningAdder, removeWarning } from '@/db/queries/warnings';
import { isContentWarning } from '@/constants/contentWarnings';
import { isModerator } from '@/auth/role';
import { HttpError, route } from '@/server/route';
import { requireMeme } from '@/server/require';

// DELETE: takes a content warning off a meme. Only the person who added it, or a moderator.
export const DELETE = route({
  auth: 'required',
  handler: async ({ user, params }) => {
    const meme = await requireMeme(params.memeId);
    const warning = params.warning;
    if (!isContentWarning(warning)) {
      throw new HttpError(404, 'That warning is not on this meme.');
    }
    const adder = await getWarningAdder(meme.id, warning);
    if (adder === undefined) {
      throw new HttpError(404, 'That warning is not on this meme.');
    }
    if (adder !== user.id && !isModerator(user)) {
      throw new HttpError(403, 'Only the person who added a warning, or a moderator, can remove it.');
    }
    await removeWarning(meme.id, warning);
    return { ok: true };
  },
});
