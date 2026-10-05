import { z } from 'zod';
import { isModerator } from '@/auth/role';
import { softDeleteMeme } from '@/db/queries/memes';
import { logModeration } from '@/db/queries/moderation';
import { HttpError, route } from '@/server/route';
import { requireMeme } from '@/server/require';

// Optional, so a plain DELETE with no body still works.
const deleteBody = z
  .object({
    reason: z.string().trim().max(500, 'Keep the reason under 500 characters.').optional(),
  })
  .optional();

// DELETE { reason? }: soft-deletes a meme. The uploader or a moderator only. A moderator
// deleting someone else's meme is written to the moderation log, with the reason if given.
export const DELETE = route({
  auth: 'required',
  handler: async ({ user, params, request }) => {
    const meme = await requireMeme(params.memeId);

    const asModerator = meme.uploaderId !== user.id;
    if (asModerator && !isModerator(user)) {
      throw new HttpError(403, 'You can only delete your own memes.');
    }

    const text = await request.text();
    let raw: unknown = undefined;
    try {
      raw = text ? JSON.parse(text) : undefined;
    } catch {
      throw new HttpError(400, 'The request body must be JSON.');
    }
    const parsed = deleteBody.safeParse(raw);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request.');
    }
    const reason = parsed.data?.reason || null;

    // The row and the file stay, hidden everywhere, so a takedown can hold content.
    const deleted = await softDeleteMeme(meme.id, { deletedBy: user.id, reason });
    if (deleted && asModerator) {
      await logModeration({
        actorId: user.id,
        action: 'meme_delete',
        targetType: 'meme',
        targetId: meme.id,
        reason,
        data: {
          uploaderId: meme.uploaderId,
          uploaderUsername: meme.username,
        },
      });
    }
    return { ok: true };
  },
});
