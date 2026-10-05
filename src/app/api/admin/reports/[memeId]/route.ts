import { z } from 'zod';
import { isModerator } from '@/auth/role';
import { softDeleteMeme } from '@/db/queries/memes';
import { resolveReports } from '@/db/queries/reports';
import { HttpError, route } from '@/server/route';

// POST { action, note? }: closes every open report on a meme. "dismiss" leaves the meme up;
// "delete" soft-deletes it and records the reports as actioned. Moderators and admins only.
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
    const resolved = await resolveReports(
      params.memeId,
      user.id,
      body.action === 'delete' ? 'actioned' : 'dismissed',
      body.note || null
    );
    if (resolved === 0) {
      throw new HttpError(404, 'That meme has no open reports. Someone may have resolved them already.');
    }
    if (body.action === 'delete') {
      await softDeleteMeme(params.memeId);
    }
    return { resolved };
  },
});
