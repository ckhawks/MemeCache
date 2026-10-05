import { z } from 'zod';
import { isAdmin } from '@/auth/role';
import { deleteAccount } from '@/server/accounts';
import { HttpError, route } from '@/server/route';
import { logModeration } from '@/db/queries/moderation';

// POST { userId, reason }: deletes someone's account by anonymising it, the same way they
// could themselves (migration 018). Admins only, never their own account (that goes
// through the edit page), and the reason is recorded on the account.
export const POST = route({
  auth: 'required',
  body: z.object({
    userId: z.uuid(),
    reason: z
      .string()
      .trim()
      .min(1, 'Please give a reason.')
      .max(1000, 'Keep the reason under 1000 characters.'),
  }),
  handler: async ({ user, body }) => {
    if (!isAdmin(user)) {
      throw new HttpError(403, 'Only admins can delete accounts.');
    }
    if (body.userId === user.id) {
      throw new HttpError(400, 'Delete your own account from your edit profile page.');
    }
    const username = await deleteAccount({
      userId: body.userId,
      deletedBy: user.id,
      reason: body.reason,
    });
    await logModeration({
      actorId: user.id,
      action: 'user_delete',
      targetType: 'user',
      targetId: body.userId,
      reason: body.reason,
    });
    return { username };
  },
});
