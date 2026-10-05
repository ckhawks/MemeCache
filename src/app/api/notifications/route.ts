import { listNotifications } from '@/db/queries/notifications';
import { route } from '@/server/route';

// GET: the caller's latest notifications, grouped, for the bell's popover. Reading them
// does not mark them read; the popover posts to ./read once it has shown them.
export const GET = route({
  auth: 'required',
  handler: async ({ user }) => {
    return { notifications: await listNotifications(user.id, 8) };
  },
});
