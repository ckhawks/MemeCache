import { z } from 'zod';
import { CLIENT_EVENT_KINDS } from '@/constants/events';
import { recordEvent } from '@/db/queries/events';
import { getMeme } from '@/db/queries/memes';
import { route } from '@/server/route';
import { isBot } from '@/server/isBot';
import { visitorKey } from '@/server/visitor';

// POST { kind, memeId?, query?, position? }: records something the browser saw happen and
// the server did not (src/constants/events.ts), sent by track() in src/util/track.ts. memeId
// may be a uuid or a slug. Answers ok whether or not it was recorded: bots and memes that do
// not exist are dropped quietly, since nothing on the page depends on it.
export const POST = route({
  auth: 'optional',
  body: z.object({
    kind: z.enum(CLIENT_EVENT_KINDS, 'Unknown event.'),
    memeId: z.string().max(64).optional(),
    query: z.string().max(200).optional(),
    position: z.int().min(0).max(10_000).optional(),
  }),
  handler: async ({ user, body, request }) => {
    if (isBot(request.headers.get('user-agent'))) {
      return { ok: true };
    }
    const meme = body.memeId ? await getMeme(body.memeId) : null;
    if (body.memeId && !meme) {
      return { ok: true };
    }
    const data: Record<string, unknown> = {};
    if (body.query !== undefined) {
      data.query = body.query;
    }
    if (body.position !== undefined) {
      data.position = body.position;
    }
    await recordEvent({
      kind: body.kind,
      userId: user?.id,
      visitorKey: user ? null : await visitorKey(),
      memeId: meme?.id,
      data,
    });
    return { ok: true };
  },
});
