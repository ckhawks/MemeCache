import { z } from 'zod';
import { answerMatch, getMatchPair, skipMatch } from '@/db/queries/duplicates';
import { MATCH_ANSWERS } from '@/constants/queue';
import { HttpError, route } from '@/server/route';

// POST { memeId, otherId, answer }: the viewer's answer on a pair in the queue's Duplicates
// tab, or 'skip' to stop being asked about it. Not on a pair with a meme of their own: that
// would be judging their own upload.
export const POST = route({
  auth: 'required',
  body: z.object({
    memeId: z.string(),
    otherId: z.string(),
    answer: z.enum([...MATCH_ANSWERS, 'skip']),
  }),
  handler: async ({ user, body }) => {
    const pair = await getMatchPair(body.memeId, body.otherId);
    if (!pair) {
      throw new HttpError(404, 'Those two memes are not a pair to check.');
    }
    if (body.answer === 'skip') {
      await skipMatch(user.id, pair.memeId, pair.otherId);
      return { ok: true };
    }
    if (pair.uploaderIds.includes(user.id)) {
      throw new HttpError(403, 'You cannot judge a pair with your own meme in it.');
    }
    await answerMatch(pair.memeId, pair.otherId, user.id, body.answer);
    return { ok: true };
  },
});
