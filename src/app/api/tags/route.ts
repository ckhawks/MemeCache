import { searchTags } from '@/db/queries/tags';
import { route } from '@/server/route';

const MAX_QUERY_LENGTH = 50;

// GET ?q=: tag suggestions for the tag field. No q gives the most-used tags.
export const GET = route({
  auth: 'optional',
  handler: async ({ request }) => {
    const q = (new URL(request.url).searchParams.get('q') ?? '').slice(0, MAX_QUERY_LENGTH);
    return { tags: await searchTags(q) };
  },
});
