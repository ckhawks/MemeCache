import { z } from 'zod';
import { setWarningDisplay } from '@/db/queries/warnings';
import { WARNING_DISPLAYS } from '@/constants/contentWarnings';
import { route } from '@/server/route';

// POST { display }: how the caller wants memes with content warnings shown.
export const POST = route({
  auth: 'required',
  body: z.object({
    display: z.enum(WARNING_DISPLAYS, 'Unknown setting.'),
  }),
  handler: async ({ user, body }) => {
    await setWarningDisplay(user.id, body.display);
    return { display: body.display };
  },
});
