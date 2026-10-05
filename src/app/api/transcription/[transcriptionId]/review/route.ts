import { z } from 'zod';
import { getTranscriptionAuthor, reviewTranscription } from '@/db/queries/transcriptions';
import { HttpError, route } from '@/server/route';

// POST { verdict }: 1 confirms this version of a meme's text, -1 rejects it. Not on your
// own: that would be voting for yourself.
export const POST = route({
  auth: 'required',
  body: z.object({
    verdict: z.union([z.literal(1), z.literal(-1)]),
  }),
  handler: async ({ user, body, params }) => {
    const version = await getTranscriptionAuthor(params.transcriptionId);
    if (!version) {
      throw new HttpError(404, 'That transcription does not exist.');
    }
    if (version.editedBy === user.id) {
      throw new HttpError(403, 'You cannot review your own transcription.');
    }
    await reviewTranscription(params.transcriptionId, user.id, body.verdict);
    return { ok: true };
  },
});
