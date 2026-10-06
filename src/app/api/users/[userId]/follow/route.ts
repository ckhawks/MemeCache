import { z } from 'zod';
import { isFollowableUser, setFollow } from '@/db/queries/follows';
import { notify } from '@/db/queries/notifications';
import { HttpError, route } from '@/server/route';

// POST { following }: follows the user or unfollows them. A new follow tells them, once per
// follower (see notify).
export const POST = route({
  auth: 'required',
  body: z.object({
    following: z.boolean('following must be true or false.'),
  }),
  handler: async ({ user, body, params }) => {
    if (params.userId === user.id) {
      throw new HttpError(400, 'You cannot follow yourself.');
    }
    if (!(await isFollowableUser(params.userId))) {
      throw new HttpError(404, 'That user does not exist.');
    }
    const created = await setFollow(user.id, params.userId, body.following);
    if (created) {
      await notify({
        recipientId: params.userId,
        kind: 'follow',
        actorId: user.id,
      });
    }
    return { following: body.following };
  },
});
