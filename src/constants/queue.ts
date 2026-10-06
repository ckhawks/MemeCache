// Shared by the queue's queries and its page.

export type QueueTask = 'transcription' | 'tag' | 'duplicate';

export const QUEUE_TASKS: QueueTask[] = ['transcription', 'tag', 'duplicate'];

// The tasks that work on one meme at a time, whose skips are queue_skip rows. Duplicates
// work on a pair of memes (meme_match_skip).
export type MemeQueueTask = Exclude<QueueTask, 'duplicate'>;

export const MEME_QUEUE_TASKS: MemeQueueTask[] = ['transcription', 'tag'];

// How many people besides its author have to agree before a transcription or a tag is
// settled. Until then the meme keeps coming back through the queue. A duplicate pair takes
// the same number of agreeing answers from people other than the two uploaders.
export const CONFIRMATIONS_NEEDED = 2;

// Confirmed tags a meme needs before the tag queue lets it go.
export const TAGS_NEEDED = 3;

// What someone can say about a pair of memes the fingerprints matched (migration 021).
export type MatchAnswer = 'same_meme' | 'same_template' | 'different';

export const MATCH_ANSWERS: MatchAnswer[] = ['same_meme', 'same_template', 'different'];

export const MATCH_ANSWER_LABELS: Record<MatchAnswer, string> = {
  same_meme: 'Same meme',
  same_template: 'Same template',
  different: 'Different',
};
