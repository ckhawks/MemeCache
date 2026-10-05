import { z } from 'zod';
import { REPORT_DETAILS_MAX, REPORT_REASON_IDS } from '@/constants/reports';
import { getOwnOpenReport, reportMeme } from '@/db/queries/reports';
import { HttpError, route } from '@/server/route';
import { requireMeme } from '@/server/require';

// GET: the caller's open report on this meme, or null, so the form can show it again.
export const GET = route({
  auth: 'required',
  handler: async ({ user, params }) => {
    const meme = await requireMeme(params.memeId);
    return { report: await getOwnOpenReport(meme.id, user.id) };
  },
});

// POST { reason, details? }: reports the meme to moderators. Reporting it again while the
// first report is still open replaces that report.
export const POST = route({
  auth: 'required',
  body: z.object({
    reason: z.enum(REPORT_REASON_IDS, 'Pick a reason.'),
    details: z
      .string()
      .trim()
      .max(REPORT_DETAILS_MAX, `Keep the details under ${REPORT_DETAILS_MAX} characters.`)
      .optional(),
  }),
  handler: async ({ user, body, params }) => {
    const meme = await requireMeme(params.memeId);
    if (meme.uploaderId === user.id) {
      throw new HttpError(400, 'You cannot report your own meme. You can delete it instead.');
    }
    await reportMeme(meme.id, user.id, body.reason, body.details || null);
    return { ok: true };
  },
});
