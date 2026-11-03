// Emoji reactions on memes and comments (migration 023).

// The row offered first when adding a reaction. The full picker is one tap further.
export const QUICK_REACTIONS = [
  '😂',
  '💀',
  '🔥',
  '❤️',
  '😭',
  '👍',
  '🤔',
  '😮',
];

// How many different emoji one person may leave on one meme or one comment.
export const REACTIONS_PER_PERSON = 10;

// A keycap: a digit, # or *, then the keycap mark, with or without the emoji selector.
const KEYCAP = /^[0-9#*]️?⃣$/u;

// Something drawn as an emoji, or a flag's letters.
const PICTOGRAPHIC = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

// Letters, digits and spaces, which an emoji never holds outside a keycap.
const TEXT = /[\p{L}\p{N}\s]/u;

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;

// Exactly one emoji, as the picker or a keyboard would produce: skin tones, joined families
// and flags included, text and several emoji in a row not. The route checks with this; the
// database only caps the length.
export function isReactionEmoji(value: string): boolean {
  if (!value || value.length > 32) {
    return false;
  }
  if (segmenter && [...segmenter.segment(value)].length !== 1) {
    return false;
  }
  if (KEYCAP.test(value)) {
    return true;
  }
  return PICTOGRAPHIC.test(value) && !TEXT.test(value);
}
