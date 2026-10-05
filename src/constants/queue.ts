// Shared by the queue's queries and its page.

export type QueueTask = 'transcription' | 'tag';

export const QUEUE_TASKS: QueueTask[] = ['transcription', 'tag'];

// How many people besides its author have to agree before a transcription or a tag is
// settled. Until then the meme keeps coming back through the queue.
export const CONFIRMATIONS_NEEDED = 2;

// Confirmed tags a meme needs before the tag queue lets it go.
export const TAGS_NEEDED = 3;
