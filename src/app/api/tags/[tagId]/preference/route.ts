import { z } from 'zod';
import { setTagPreference, tagExists } from '@/db/queries/tagPreferences';
import { HttpError, route } from '@/server/route';

// POST { preference }: follow the tag, mute it, or (null) neither. One replaces the other.
export const POST = route({
  auth: 'required',
  body: z.object({
    preference: z.enum(['follow', 'mute'], 'preference must be follow, mute or null.').nullable(),
  }),
  handler: async ({ user, body, params }) => {
    if (!(await tagExists(params.tagId))) {
      throw new HttpError(404, 'That tag does not exist.');
    }
    await setTagPreference(user.id, params.tagId, body.preference);
    return { preference: body.preference };
  },
});
