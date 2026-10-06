import { countQueue, nextQueueItem, QUEUE_TASKS, QueueTask } from '@/db/queries/queue';
import { nextDuplicatePair } from '@/db/queries/duplicates';
import { HttpError, route } from '@/server/route';

// GET ?task=: the viewer's next item for that task, and how many each task has left. The
// duplicate task answers with a pair of memes instead of an item.
export const GET = route({
  auth: 'required',
  handler: async ({ user, request }) => {
    const task = new URL(request.url).searchParams.get('task') as QueueTask;
    if (!QUEUE_TASKS.includes(task)) {
      throw new HttpError(400, 'Unknown queue task.');
    }
    if (task === 'duplicate') {
      const [pair, counts] = await Promise.all([nextDuplicatePair(user.id), countQueue(user.id)]);
      return { item: null, pair, counts };
    }
    const [item, counts] = await Promise.all([nextQueueItem(task, user.id), countQueue(user.id)]);
    return { item, pair: null, counts };
  },
});
