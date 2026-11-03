import { listReactionsFor, setReaction } from '@/db/queries/reactions';
import { notify } from '@/db/queries/notifications';
import { HttpError, route } from '@/server/route';
import { requireMeme } from '@/server/require';
import { reactionSchema, REACTION_LIMIT_MESSAGE } from '@/server/reactions';

// PUT { emoji, reacted }: puts the caller's emoji on the meme or takes it back (migration
// 023), and returns the meme's reactions as they now stand.
export const PUT = route({
  auth: 'required',
  body: reactionSchema,
  handler: async ({ user, body, params }) => {
    const meme = await requireMeme(params.memeId);
    const result = await setReaction('meme', meme.id, user.id, body.emoji, body.reacted);
    if (result === 'limit') {
      throw new HttpError(400, REACTION_LIMIT_MESSAGE);
    }
    if (result === 'added') {
      await notify({
        recipientId: meme.uploaderId,
        kind: 'meme_reaction',
        actorId: user.id,
        memeId: meme.id,
      });
    }
    return { reactions: await listReactionsFor('meme', meme.id, user.id) };
  },
});
