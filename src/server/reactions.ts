import { z } from 'zod';
import { isReactionEmoji, REACTIONS_PER_PERSON } from '@/constants/reactions';

// The body of both reaction routes (migration 023): one emoji, on or off.
export const reactionSchema = z.object({
  emoji: z.string().max(32).refine(isReactionEmoji, 'Pick a single emoji.'),
  reacted: z.boolean('reacted must be true or false.'),
});

export const REACTION_LIMIT_MESSAGE = `You can leave up to ${REACTIONS_PER_PERSON} different reactions.`;
