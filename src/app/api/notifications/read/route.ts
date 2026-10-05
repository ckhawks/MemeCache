import { z } from 'zod';
import { markNotificationsRead } from '@/db/queries/notifications';
import { route } from '@/server/route';

// POST { throughId? }: marks the caller's notifications read, up to and including the
// newest one they were shown.
export const POST = route({
  auth: 'required',
  body: z.object({
    throughId: z.string().regex(/^\d+$/, 'throughId must be a notification id.').optional(),
  }),
  handler: async ({ user, body }) => {
    await markNotificationsRead(user.id, body.throughId);
    return { ok: true };
  },
});
