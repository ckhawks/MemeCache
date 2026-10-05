import { z } from 'zod';
import { dismissQueueItem, QUEUE_TASKS } from '@/db/queries/queue';
import { route } from '@/server/route';
import { requireMeme } from '@/server/require';

// POST { task, memeId }: take a meme out of the viewer's queue for that task, after a skip
// or once they are done tagging it.
export const POST = route({
  auth: 'required',
  body: z.object({
    task: z.enum(QUEUE_TASKS),
    memeId: z.string(),
  }),
  handler: async ({ user, body }) => {
    const meme = await requireMeme(body.memeId);
    await dismissQueueItem(user.id, body.task, meme.id);
    return { ok: true };
  },
});
