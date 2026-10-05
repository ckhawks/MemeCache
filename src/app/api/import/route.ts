import { z } from 'zod';
import { findMemeBySourceUrl } from '@/db/queries/memes';
import { importMedia, normalizeImportUrl } from '@/server/mediaImport';
import { HttpError, route } from '@/server/route';

// Each import runs yt-dlp on the server, so it is rationed per user. In memory: it resets
// on restart and is per process, which is fine for one box and a handful of users.
const IMPORTS_PER_WINDOW = 10;
const WINDOW_MS = 10 * 60 * 1000;
const recent = new Map<string, number[]>();
const running = new Set<string>();

function claimSlot(userId: string) {
  if (running.has(userId)) {
    throw new HttpError(429, 'Already importing one. Wait for it to finish.');
  }
  const now = Date.now();
  const times = (recent.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= IMPORTS_PER_WINDOW) {
    throw new HttpError(
      429,
      'That is a lot of imports. Try again in a few minutes.'
    );
  }
  times.push(now);
  recent.set(userId, times);
  running.add(userId);
}

// POST { url, force? }: fetches the media behind a post link and sends the file back, so
// the upload page can treat it like a picked file. Nothing is stored here; the upload that
// follows saves the meme with this source URL.
//
// When a meme was already imported from the same post, answers { duplicate: slug } as JSON
// instead, unless force is set.
export const POST = route({
  auth: 'required',
  body: z.object({
    url: z.string('Paste a link.').trim().min(1, 'Paste a link.').max(2000),
    force: z.boolean().optional(),
  }),
  handler: async ({ user, body }) => {
    const { url, site } = normalizeImportUrl(body.url);

    if (!body.force) {
      const existing = await findMemeBySourceUrl(url);
      if (existing) {
        return { duplicate: existing.slug, sourceUrl: url };
      }
    }

    claimSlot(user.id);
    try {
      const media = await importMedia(url, site);
      return new Response(new Uint8Array(media.bytes), {
        headers: {
          'Content-Type': media.contentType,
          'Content-Length': String(media.bytes.length),
          'Cache-Control': 'no-store',
          'X-Source-Url': url,
          'X-File-Name': media.fileName,
        },
      });
    } finally {
      running.delete(user.id);
    }
  },
});
