import { z } from 'zod';
import { isModerator } from '@/auth/role';
import { getMeme } from '@/db/queries/memes';
import { MergeError, mergeMemes } from '@/db/queries/merge';
import { HttpError, route } from '@/server/route';
import { requireMeme } from '@/server/require';

// "https://memecache.me/meme/AbC2345?x=1" or "/meme/AbC2345" or "AbC2345": the last part of
// the path, so a pasted link works as well as a slug.
function slugFrom(value: string): string {
  const path = value.trim().split(/[?#]/)[0].replace(/\/+$/, '');
  return path.slice(path.lastIndexOf('/') + 1);
}

// POST { into }: merges this meme into another one, its original, given by id, slug or link
// (mergeMemes in src/db/queries/merge.ts). This meme is deleted and its page redirects to
// the original from then on. Moderators and admins only; logged in the moderation log.
export const POST = route({
  auth: 'required',
  body: z.object({
    into: z.string('Pick the original.').trim().min(1, 'Pick the original.').max(500),
  }),
  handler: async ({ user, body, params }) => {
    if (!isModerator(user)) {
      throw new HttpError(403, 'Only moderators can merge memes.');
    }
    const duplicate = await requireMeme(params.memeId);
    const original = await getMeme(slugFrom(body.into));
    if (!original) {
      throw new HttpError(404, 'There is no live meme at that link.');
    }
    if (original.id === duplicate.id) {
      throw new HttpError(400, 'Pick a different meme: this one cannot be its own original.');
    }
    try {
      const result = await mergeMemes(duplicate.id, original.id, user.id);
      return { slug: result.originalSlug };
    } catch (error) {
      if (error instanceof MergeError) {
        throw new HttpError(409, error.message);
      }
      throw error;
    }
  },
});
