import { z } from 'zod';
import { isAdmin } from '@/auth/role';
import { setInviteCodeDisabled } from '@/db/queries/invites';
import { logModeration } from '@/db/queries/moderation';
import { HttpError, route } from '@/server/route';

// POST { disabled }: turns an invite code off, or back on. Admins only. Goes in the
// moderation log.
export const POST = route({
  auth: 'required',
  body: z.object({
    disabled: z.boolean(),
  }),
  handler: async ({ user, body, params }) => {
    if (!isAdmin(user)) {
      throw new HttpError(403, 'Only admins can change invite codes.');
    }
    if (!(await setInviteCodeDisabled(params.inviteId, body.disabled))) {
      throw new HttpError(404, 'That invite code does not exist.');
    }
    await logModeration({
      actorId: user.id,
      action: body.disabled ? 'invite_disable' : 'invite_enable',
      targetType: 'invite',
      targetId: params.inviteId,
    });
    return { ok: true };
  },
});
