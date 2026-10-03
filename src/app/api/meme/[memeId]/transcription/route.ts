import { z } from 'zod';
import { addTranscription, getCurrentTranscription } from '@/db/queries/transcriptions';
import { route } from '@/server/route';
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

// POST { text }: saves a new version. The editor is the session user.
export const POST = route({
  auth: 'required',
  body: z.object({
    text: z
      .string('A transcription needs text.')
      .trim()
      .min(1, 'A transcription needs text.')
      .max(
        MAX_TRANSCRIPTION_LENGTH,
        `Transcriptions are limited to ${MAX_TRANSCRIPTION_LENGTH} characters.`
      ),
  }),
  handler: async ({ user, body, params }) => {
    const meme = await requireMeme(params.memeId);
    return { transcription: await addTranscription(meme.id, body.text, user.id) };
  },
});
