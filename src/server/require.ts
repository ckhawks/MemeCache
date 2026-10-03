import { getMeme, MemeCard } from '@/db/queries/memes';
import { HttpError } from './route';

// For route handlers: the meme, or a 404 the route() wrapper turns into JSON.
export async function requireMeme(id: string, viewerId?: string): Promise<MemeCard> {
  const meme = await getMeme(id, viewerId);
  if (!meme) {
    throw new HttpError(404, 'That meme does not exist.');
  }
  return meme;
}
