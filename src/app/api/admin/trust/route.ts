import { z } from 'zod';
import { isAdmin } from '@/auth/role';
import { setTrustOverride } from '@/db/queries/users';
import { HttpError, route } from '@/server/route';

// POST { userId, override }: pins a user as trusted or held, or null to go back to their
// record (migration 005). Admins only.
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
    await setTrustOverride(body.userId, body.override);
    return { ok: true };
  },
});
