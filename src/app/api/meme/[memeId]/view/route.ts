import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { isUuid } from '@/db/queries/ids';
import { recordView } from '@/db/queries/views';
import { route } from '@/server/route';
import { requireMeme } from '@/server/require';
import { isBot } from '@/server/isBot';

// The logged-out viewer's id: random, nothing else in it, only ever read here.
const VISITOR_COOKIE = 'visitor';
const VISITOR_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

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

    const cookieStore = await cookies();
    let visitorKey = cookieStore.get(VISITOR_COOKIE)?.value;
    if (!isUuid(visitorKey)) {
      visitorKey = randomUUID();
      cookieStore.set(VISITOR_COOKIE, visitorKey, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: VISITOR_COOKIE_MAX_AGE,
      });
    }
    return { counted: await recordView(meme.id, { visitorKey }) };
  },
});
