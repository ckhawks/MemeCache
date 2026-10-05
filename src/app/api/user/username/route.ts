import { z } from 'zod';
import { createAccessToken, setSessionCookie } from '@/auth/lib';
import { route } from '@/server/route';
import { renameOrThrow } from '@/server/rename';

// POST { username }: changes the session user's name (migration 011), once per cooldown.
export const POST = route({
  auth: 'required',
  body: z.object({
    username: z.string(),
  }),
  handler: async ({ user, body }) => {
    const username = await renameOrThrow({ userId: user.id, username: body.username });

    // The token carries the name, and the navigation bar reads it from there.
    await setSessionCookie(await createAccessToken({ ...user, username }));

    return { username };
  },
});
