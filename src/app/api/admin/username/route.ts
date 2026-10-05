import { z } from 'zod';
import { isAdmin } from '@/auth/role';
import { HttpError, route } from '@/server/route';
import { renameOrThrow } from '@/server/rename';

// POST { userId, username }: renames someone else (migration 011). Admins only. No
// cooldown and it does not start theirs, but the old-name reservation still applies.
export const POST = route({
  auth: 'required',
  body: z.object({
    userId: z.uuid(),
    username: z.string(),
  }),
  handler: async ({ user, body }) => {
    if (!isAdmin(user)) {
      throw new HttpError(403, 'Only admins can change this.');
    }
    // Their own name goes through the edit page like everyone else's.
    if (body.userId === user.id) {
      throw new HttpError(400, 'Change your own username from your edit profile page.');
    }
    const username = await renameOrThrow({
      userId: body.userId,
      username: body.username,
      byAdmin: true,
    });
    return { username };
  },
});
