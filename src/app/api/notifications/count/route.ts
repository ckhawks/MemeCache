import { countUnreadNotifications } from '@/db/queries/notifications';
import { route } from '@/server/route';

// GET: the number on the bell, polled while the tab is visible. Zero when logged out, so a
// session that expires between polls empties the bell instead of erroring.
export const GET = route({
  auth: 'optional',
  handler: async ({ user }) => {
    return { unread: user ? await countUnreadNotifications(user.id) : 0 };
  },
});
