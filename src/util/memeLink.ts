import { isSlug } from '@/db/queries/ids';

// The slug in a link to a meme page, as copied from the address bar or the Send button:
// "https://memecache.me/meme/Xm7Kq2N" or "/meme/Xm7Kq2N?x=1". Any host, so links from a dev
// server or an old domain work too; the slug still has to exist. Null when the text is
// anything else, a bare slug included: a seven letter word could pass for one.
export function parseMemeLink(text: string): string | null {
  const match = /^(?:https?:\/\/[^/\s]+)?\/meme\/([^/?#\s]+)\/?(?:[?#]\S*)?$/i.exec(text.trim());
  return match && isSlug(match[1]) ? match[1] : null;
}
