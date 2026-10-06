import { z } from 'zod';
import { isModerator } from '@/auth/role';
import { answerMatch, getMatchPair } from '@/db/queries/duplicates';
import { logModeration } from '@/db/queries/moderation';
import { MATCH_ANSWERS } from '@/constants/queue';
import { HttpError, route } from '@/server/route';

// POST { memeId, otherId, answer }: a moderator settles a pair on /admin/duplicates without
// waiting for the queue. Also how a pair settled as the same meme is turned down ("not a
// duplicate"): the moderator's answer wins over the community's.
export const POST = route({
  auth: 'required',
  body: z.object({
    memeId: z.string(),
    otherId: z.string(),
    answer: z.enum(MATCH_ANSWERS),
  }),
  handler: async ({ user, body }) => {
    if (!isModerator(user)) {
      throw new HttpError(403, 'Only moderators can settle duplicates.');
    }
    const pair = await getMatchPair(body.memeId, body.otherId);
    if (!pair) {
      throw new HttpError(404, 'Those two memes are not a pair to check.');
    }
    await answerMatch(pair.memeId, pair.otherId, user.id, body.answer, true);
    await logModeration({
      actorId: user.id,
      action: 'duplicate_answer',
      targetType: 'meme',
      targetId: pair.memeId,
      data: {
        otherId: pair.otherId,
        answer: body.answer,
      },
    });
    return { ok: true };
  },
});
