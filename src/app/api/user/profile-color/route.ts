import { z } from 'zod';
import { setSetting } from '@/db/queries/settings';
import { PROFILE_COLORS } from '@/constants/profileColors';
import { route } from '@/server/route';

// POST { color }: the tint on the caller's profile page, one of the palette or null for none.
export const POST = route({
  auth: 'required',
  body: z.object({
    color: z.enum(PROFILE_COLORS, 'Unknown color.').nullable(),
  }),
  handler: async ({ user, body }) => {
    await setSetting(user.id, 'profile_color', body.color);
    return { color: body.color };
  },
});
