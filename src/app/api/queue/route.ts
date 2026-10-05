import { countQueue, nextQueueItem, QUEUE_TASKS, QueueTask } from '@/db/queries/queue';
import { HttpError, route } from '@/server/route';

// GET ?task=: the viewer's next item for that task, and how many each task has left.
export const GET = route({
  auth: 'required',
  handler: async ({ user, request }) => {
    const task = new URL(request.url).searchParams.get('task') as QueueTask;
    if (!QUEUE_TASKS.includes(task)) {
      throw new HttpError(400, 'Unknown queue task.');
    }
    const [item, counts] = await Promise.all([nextQueueItem(task, user.id), countQueue(user.id)]);
    return { item, counts };
  },
});
