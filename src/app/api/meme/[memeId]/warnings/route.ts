import { z } from 'zod';
import { addWarnings, listWarningsForMeme } from '@/db/queries/warnings';
import { CONTENT_WARNINGS } from '@/constants/contentWarnings';
import { route } from '@/server/route';
import { requireMeme } from '@/server/require';

// GET: the meme's content warnings, with who added each. `own` describes the caller.
export const GET = route({
  auth: 'optional',
  handler: async ({ user, params }) => {
    const meme = await requireMeme(params.memeId);
    return { warnings: await listWarningsForMeme(meme.id, user?.id) };
  },
});

// POST { warning }: labels the meme. Any member can, since an extra warning costs little.
// Adding one that is already there changes nothing.
export const POST = route({
  auth: 'required',
  body: z.object({
    warning: z.enum(CONTENT_WARNINGS, 'Unknown content warning.'),
  }),
  handler: async ({ user, body, params }) => {
    const meme = await requireMeme(params.memeId);
    await addWarnings(meme.id, [body.warning], user.id);
    return { ok: true };
  },
});
