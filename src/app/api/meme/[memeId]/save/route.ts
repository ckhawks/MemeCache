import { z } from 'zod';
import { setSave } from '@/db/queries/saves';
import { route } from '@/server/route';
import { requireMeme } from '@/server/require';

// POST { saved }: adds the meme to the caller's Library, or removes it.
export const POST = route({
  auth: 'required',
  body: z.object({
    saved: z.boolean('saved must be true or false.'),
  }),
  handler: async ({ user, body, params }) => {
    const meme = await requireMeme(params.memeId);
    await setSave(meme.id, user.id, body.saved);
    return { saved: body.saved };
  },
});
