import { z } from 'zod';
import { isAdmin } from '@/auth/role';
import { TAKEDOWN_REASONS } from '@/constants/takedowns';
import { takeDownMeme } from '@/server/accounts';
import { HttpError, route } from '@/server/route';
import { logModeration } from '@/db/queries/moderation';

// POST { reason, note }: takes a meme down for a copyright claim or similar (migration
// 018). Deletes its file from storage and leaves a notice on its page. Admins only.
export const POST = route({
  auth: 'required',
  body: z.object({
    reason: z.enum(TAKEDOWN_REASONS, 'Pick a reason.'),
    note: z
      .string()
      .trim()
      .max(2000, 'Keep the note under 2000 characters.')
      .nullable(),
  }),
  handler: async ({ user, body, params }) => {
    if (!isAdmin(user)) {
      throw new HttpError(403, 'Only admins can take content down.');
    }
    await takeDownMeme({
      memeId: params.memeId,
      reason: body.reason,
      note: body.note || null,
      adminId: user.id,
    });
    await logModeration({
      actorId: user.id,
      action: 'meme_takedown',
      targetType: 'meme',
      targetId: params.memeId,
      reason: body.note || null,
      data: {
        reason: body.reason,
        note: body.note || null,
      },
    });
    return { ok: true };
  },
});
