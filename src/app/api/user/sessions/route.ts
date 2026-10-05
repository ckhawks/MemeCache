import { z } from 'zod';
import { revokeOtherSessions } from '@/db/queries/sessions';
import { HttpError, route } from '@/server/route';

// DELETE { keep }: "Log out everywhere else". Ends every session of the caller's but this
// one (migration 018). `keep` must be this session's id: the list the button sat under was
// rendered for this session, and a stale or copied page should not log out the wrong set.
export const DELETE = route({
  auth: 'required',
  body: z.object({
    keep: z.string(),
  }),
  handler: async ({ user, body }) => {
    if (body.keep !== user.sessionId) {
      throw new HttpError(400, 'That list is out of date. Reload the page and try again.');
    }
    const revoked = await revokeOtherSessions(user.id, user.sessionId);
    return { revoked };
  },
});
