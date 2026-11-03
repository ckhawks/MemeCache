import { isAdmin } from '@/auth/role';
import { getTrafficNumbers } from '@/db/queries/events';
import { getVisitStats } from '@/db/queries/visits';
import { getRetention, listNewMembers, listUnclickedSearches } from '@/db/queries/analytics';
import { HttpError, route } from '@/server/route';

// GET: the slow-moving half of /admin/live, the totals and the longer-view panels, polled
// once a minute. Admins only, and a 404 for anyone else.
export const GET = route({
  auth: 'required',
  handler: async ({ user }) => {
    if (!isAdmin(user)) {
      throw new HttpError(404, 'Not found.');
    }
    const [traffic, visits, retention, newMembers, unclickedSearches] = await Promise.all([
      getTrafficNumbers(),
      getVisitStats(),
      getRetention(),
      listNewMembers(20),
      listUnclickedSearches(10),
    ]);
    return {
      traffic,
      visits,
      retention,
      newMembers,
      unclickedSearches,
    };
  },
});
