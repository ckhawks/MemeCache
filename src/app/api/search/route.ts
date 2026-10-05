import { getMemeRef, searchMemeRefs } from '@/db/queries/comments';
import { route } from '@/server/route';
import { parseMemeLink } from '@/util/memeLink';

// GET ?q=: a few memes as thumbnails, for the comment box's picker. A link to a meme page
// gives that meme. The /search page is the full search.
export const GET = route({
  auth: 'optional',
  handler: async ({ request }) => {
    const q = new URL(request.url).searchParams.get('q') ?? '';
    const slug = parseMemeLink(q);
    if (slug) {
      const ref = await getMemeRef(slug);
      if (!ref) {
        return { memes: [] };
      }
      return {
        memes: [
          {
            id: ref.id,
            slug: ref.slug,
            contentType: ref.contentType,
            username: ref.username,
            warnings: ref.warnings,
          },
        ],
      };
    }
    return { memes: await searchMemeRefs(q) };
  },
});
