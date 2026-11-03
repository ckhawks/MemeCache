import { isAdmin } from '@/auth/role';
import { listRecentActivity } from '@/db/queries/events';
import { getConcurrency, listPresent, type ConcurrencyRange } from '@/db/queries/visits';
import { HttpError, route } from '@/server/route';

const RANGES: ConcurrencyRange[] = ['day', 'week', 'month'];

// GET ?pageViews=1&range=day|week|month: the fast-moving half of /admin/live (who is here,
// the feed, the graph), polled every few seconds. The slower panels are GET
// /api/admin/live/summary. Admins only, and a 404 for anyone else.
export const GET = route({
  auth: 'required',
  handler: async ({ user, request }) => {
    if (!isAdmin(user)) {
      throw new HttpError(404, 'Not found.');
    }
    const params = new URL(request.url).searchParams;
    const range = RANGES.find((r) => r === params.get('range')) ?? 'day';
    const [present, activity, concurrency] = await Promise.all([
      listPresent(),
      listRecentActivity({ limit: 60, pageViews: params.get('pageViews') === '1' }),
      getConcurrency(range),
    ]);
    return {
      now: Date.now(),
      present,
      activity,
      concurrency,
    };
  },
});
