import { z } from 'zod';
import { isAdmin } from '@/auth/role';
import { setTrustOverride } from '@/db/queries/users';
import { logModeration } from '@/db/queries/moderation';
import { HttpError, route } from '@/server/route';

// POST { userId, override }: pins a user as trusted or held, or null to go back to their
// record (migration 005). Admins only. Logged with what it was before.
export const POST = route({
  auth: 'required',
  body: z.object({
    userId: z.uuid(),
    override: z.enum(['trusted', 'held']).nullable(),
  }),
  handler: async ({ user, body }) => {
    if (!isAdmin(user)) {
      throw new HttpError(403, 'Only admins can change this.');
    }
    const previous = await setTrustOverride(body.userId, body.override);
    if (previous === undefined) {
      throw new HttpError(404, 'That user does not exist.');
    }
    await logModeration({
      actorId: user.id,
      action: 'trust_override',
      targetType: 'user',
      targetId: body.userId,
      data: {
        from: previous,
        to: body.override,
      },
    });
    return { ok: true };
  },
});
