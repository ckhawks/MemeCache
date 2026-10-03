import { z } from 'zod';
import { addTagToMeme, findOrCreateTag, listTagsForMeme } from '@/db/queries/tags';
import { route } from '@/server/route';
import { requireMeme } from '@/server/require';

const MAX_TAG_LENGTH = 50;

// GET: all tags on a meme, highest score first. `own` and `myVote` describe the caller.
export const GET = route({
  auth: 'optional',
  handler: async ({ user, params }) => {
    const meme = await requireMeme(params.memeId);
    return { tags: await listTagsForMeme(meme.id, user?.id) };
  },
});

// POST { name }: adds a tag, creating it if no tag has that name (case-insensitively).
// Adding a tag someone else already put on the meme counts as upvoting it.
export const POST = route({
  auth: 'required',
  body: z.object({
    name: z
      .string('A tag needs a name.')
      .trim()
      .min(1, 'A tag needs a name.')
      .max(MAX_TAG_LENGTH, `Tags are limited to ${MAX_TAG_LENGTH} characters.`),
  }),
  handler: async ({ user, body, params }) => {
    const meme = await requireMeme(params.memeId);
    const tagId = await findOrCreateTag(body.name, user.id);
    await addTagToMeme(meme.id, tagId, user.id);
    return { ok: true };
  },
});
