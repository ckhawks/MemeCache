import { z } from 'zod';
import { checkPassword, clearSessionCookie } from '@/auth/lib';
import { getPasswordHash } from '@/db/queries/users';
import { deleteAccount } from '@/server/accounts';
import { HttpError, route } from '@/server/route';

// POST { confirm, password }: deletes the caller's account by anonymising it (migration
// 018). `confirm` must be their username, typed out, and the password is asked for because
// this cannot be undone and a session cookie alone should not be enough.
export const POST = route({
  auth: 'required',
  body: z.object({
    confirm: z.string(),
    password: z.string(),
  }),
  handler: async ({ user, body }) => {
    if (body.confirm.trim().toLowerCase() !== user.username.toLowerCase()) {
      throw new HttpError(400, 'Type your username exactly to confirm.');
    }
    const hash = await getPasswordHash(user.id);
    if (!hash || !(await checkPassword(body.password, hash))) {
      throw new HttpError(403, 'That password is not right.');
    }

    await deleteAccount({
      userId: user.id,
      deletedBy: user.id,
    });
    await clearSessionCookie();
    return { ok: true };
  },
});
