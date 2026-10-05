import { clearSessionCookie } from '@/auth/lib';
import { revokeSession } from '@/db/queries/sessions';
import { HttpError, route } from '@/server/route';

// DELETE: logs one of the caller's sessions out (migration 018). Their own only. Logging
// out this browser's session drops the cookie too.
export const DELETE = route({
  auth: 'required',
  handler: async ({ user, params }) => {
    if (!(await revokeSession(user.id, params.sessionId))) {
      throw new HttpError(404, 'That session is already logged out.');
    }
    const current = params.sessionId === user.sessionId;
    if (current) {
      await clearSessionCookie();
    }
    return { current };
  },
});
