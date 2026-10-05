import { z } from 'zod';
import {
  addTranscription,
  getCurrentTranscription,
  getTranscriptionAuthor,
  reviewTranscription,
} from '@/db/queries/transcriptions';
import { notify } from '@/db/queries/notifications';
import { HttpError, route } from '@/server/route';
import { requireMeme } from '@/server/require';

const MAX_TRANSCRIPTION_LENGTH = 5000;

// GET: the current transcription, or null if there is none.
export const GET = route({
  auth: 'optional',
  handler: async ({ params }) => {
    const meme = await requireMeme(params.memeId);
    return { transcription: await getCurrentTranscription(meme.id) };
  },
});

// POST { text, fixes? }: saves a new version. The editor is the session user. `fixes` names
// the version this corrects (the queue's Fix), which records a reject against it: a fix
// means it was wrong or incomplete. `pending` in the reply means it waits for a confirm.
export const POST = route({
  auth: 'required',
  body: z.object({
    text: z
      // Empty is allowed: it records that the meme has no text on it.
      .string('A transcription needs text.')
      .trim()
      .max(
        MAX_TRANSCRIPTION_LENGTH,
        `Transcriptions are limited to ${MAX_TRANSCRIPTION_LENGTH} characters.`
      ),
    fixes: z.string().optional(),
  }),
  handler: async ({ user, body, params }) => {
    const meme = await requireMeme(params.memeId);
    const fixed = body.fixes ? await getTranscriptionAuthor(body.fixes) : null;
    if (body.fixes) {
      if (!fixed || fixed.memeId !== meme.id) {
        throw new HttpError(400, 'That transcription is not on this meme.');
      }
      if (fixed.editedBy !== user.id) {
        await reviewTranscription(body.fixes, user.id, -1);
      }
    }
    const transcription = await addTranscription(meme.id, body.text, user.id);
    // The fixed version's author hears it was fixed, not that it was rejected, though a
    // reject is what was recorded. The uploader hears about every new version.
    if (body.fixes && fixed) {
      await notify({
        recipientId: fixed.editedBy,
        kind: 'transcription_fixed',
        actorId: user.id,
        memeId: meme.id,
        transcriptionId: body.fixes,
      });
    }
    await notify({
      recipientId: meme.uploaderId,
      kind: 'meme_transcribed',
      actorId: user.id,
      memeId: meme.id,
      transcriptionId: transcription.id,
    });
    return { transcription, pending: transcription.pending };
  },
});
