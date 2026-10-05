import { recordView } from '@/db/queries/views';
import { route } from '@/server/route';
import { requireMeme } from '@/server/require';
import { isBot } from '@/server/isBot';
import { visitorKey } from '@/server/visitor';

// POST: counts a view of the meme, sent by its page once the meme has been on screen for a
// second or its video starts (useViewBeacon). Returns whether it counted; it does not for bots,
// the uploader, or a viewer already counted in the last 24 hours (recordView).
export const POST = route({
  auth: 'optional',
  handler: async ({ user, params, request }) => {
    const meme = await requireMeme(params.memeId);
    if (isBot(request.headers.get('user-agent'))) {
      return { counted: false };
    }
    if (user) {
      return { counted: await recordView(meme.id, { userId: user.id }) };
    }
    return { counted: await recordView(meme.id, { visitorKey: await visitorKey() }) };
  },
});
