import { z } from 'zod';
import { setLike } from '@/db/queries/likes';
import { notify } from '@/db/queries/notifications';
import { route } from '@/server/route';
import { requireMeme } from '@/server/require';

// POST { liked }: sets the caller's like on a meme and returns the new count.
export const POST = route({
  auth: 'required',
  body: z.object({
    liked: z.boolean('liked must be true or false.'),
  }),
  handler: async ({ user, body, params }) => {
    const meme = await requireMeme(params.memeId);
    const likeCount = await setLike(meme.id, user.id, body.liked);
    if (body.liked) {
      await notify({
        recipientId: meme.uploaderId,
        kind: 'like',
        actorId: user.id,
        memeId: meme.id,
      });
    }
    return { likeCount };
  },
});
