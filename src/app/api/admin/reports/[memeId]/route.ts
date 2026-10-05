import { z } from 'zod';
import { isModerator } from '@/auth/role';
import { softDeleteMeme } from '@/db/queries/memes';
import { logModeration } from '@/db/queries/moderation';
import { resolveReports } from '@/db/queries/reports';
import { HttpError, route } from '@/server/route';

// POST { action, note? }: closes every open report on a meme. "dismiss" leaves the meme up;
// "delete" soft-deletes it and records the reports as actioned. Moderators and admins only.
// Both go in the moderation log, and a delete also logs the meme's deletion with the note as
// its reason.
export const POST = route({
  auth: 'required',
  body: z.object({
    action: z.enum(['dismiss', 'delete'], 'Pick dismiss or delete.'),
    note: z.string().trim().max(500, 'Keep the note under 500 characters.').optional(),
  }),
  handler: async ({ user, body, params }) => {
    if (!isModerator(user)) {
      throw new HttpError(403, 'Only moderators can resolve reports.');
    }
    // Resolving first means two moderators acting at once cannot both go through: the
    // second finds nothing open.
    const status = body.action === 'delete' ? 'actioned' : 'dismissed';
    const note = body.note || null;
    const resolved = await resolveReports(params.memeId, user.id, status, note);
    if (resolved === 0) {
      throw new HttpError(404, 'That meme has no open reports. Someone may have resolved them already.');
    }
    await logModeration({
      actorId: user.id,
      action: 'report_resolve',
      targetType: 'meme',
      targetId: params.memeId,
      reason: note,
      data: {
        status,
        reports: resolved,
      },
    });
    if (body.action === 'delete') {
      const deleted = await softDeleteMeme(params.memeId, { deletedBy: user.id, reason: note ?? 'Reported' });
      if (deleted) {
        await logModeration({
          actorId: user.id,
          action: 'meme_delete',
          targetType: 'meme',
          targetId: params.memeId,
          reason: note ?? 'Reported',
          data: {
            fromReports: true,
          },
        });
      }
    }
    return { resolved };
  },
});
