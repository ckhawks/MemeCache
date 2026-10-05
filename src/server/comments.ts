import { z } from 'zod';
import { COMMENT_MAX } from '@/constants/comments';
import { getMemeRef, type MemeRef } from '@/db/queries/comments';
import { parseMemeLink } from '@/util/memeLink';
import { HttpError } from './route';

// The body of a new or edited comment (migration 014): text, a meme, or both.
export const commentSchema = z.object({
  body: z
    .string('The comment must be text.')
    .trim()
    .max(COMMENT_MAX, `Keep it under ${COMMENT_MAX} characters.`),
  // The meme replied with: its slug or id, or a link to its page. Null or absent for none.
  meme: z.string().max(300).nullish(),
});

// The attached meme, checked: it exists, and it is not the meme being commented on. Throws
// when there is neither text nor a meme.
export async function resolveCommentMeme(
  input: z.infer<typeof commentSchema>,
  onMemeId: string
): Promise<(MemeRef & { uploaderId: string }) | null> {
  const given = input.meme?.trim();
  if (!given) {
    if (!input.body) {
      throw new HttpError(400, 'Write something or attach a meme.');
    }
    return null;
  }
  const ref = await getMemeRef(parseMemeLink(given) ?? given);
  if (!ref) {
    throw new HttpError(400, 'That meme does not exist.');
  }
  if (ref.id === onMemeId) {
    throw new HttpError(400, 'That is this meme. Attach a different one.');
  }
  return ref;
}
