import { z } from 'zod';
import { setSetting } from '@/db/queries/settings';
import { route } from '@/server/route';

// POST { theme }: remembers light or dark for the caller, so it follows them to other
// devices (migration 018). The browser keeps its own copy too, for logged-out visits.
export const POST = route({
  auth: 'required',
  body: z.object({
    theme: z.enum(['light', 'dark'], 'Unknown theme.'),
  }),
  handler: async ({ user, body }) => {
    await setSetting(user.id, 'theme', body.theme);
    return { theme: body.theme };
  },
});
