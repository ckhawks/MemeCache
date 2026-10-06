import { MAX_IMAGE_BYTES, STILL_IMAGE_TYPES, supportedImageTypes } from '@/constants/mimeTypes';
import { getMemeLinks } from '@/db/queries/mediaHash';
import { fingerprintImage } from '@/server/mediaHashDecode';
import { findMatches } from '@/server/mediaMatch';
import { HttpError, route } from '@/server/route';

// How many look-alikes the upload page is shown at most.
const MAX_DUPLICATES = 3;

// POST multipart { file }: memes already here that look like this one, for the upload
// page's warning before it uploads. Only duplicates: a meme on the same template as others
// is a new meme. The page sends an image; for a video it sends a frame from one second in,
// which is the frame stored videos are fingerprinted by. exact marks one that is the very
// same picture, which the upload itself will refuse when the picked file is a still image
// (the page knows that, this route only sees the still it was sent).
export const POST = route({
  auth: 'required',
  handler: async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      throw new HttpError(400, 'No file provided.');
    }
    if (!supportedImageTypes.includes(file.type)) {
      throw new HttpError(415, `Unsupported file type: ${file.type || 'unknown'}.`);
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new HttpError(413, 'File is too large.');
    }

    let fingerprint;
    try {
      fingerprint = await fingerprintImage(Buffer.from(await file.arrayBuffer()));
    } catch {
      // Not an image sharp can read. The upload itself will say what is wrong.
      return { duplicates: [] };
    }

    const duplicates = (await findMatches(fingerprint))
      .filter((m) => m.kind === 'duplicate')
      .slice(0, MAX_DUPLICATES);
    const links = await getMemeLinks(duplicates.map((m) => m.memeId));
    return {
      duplicates: links.map((link) => ({
        ...link,
        exact:
          STILL_IMAGE_TYPES.includes(link.contentType) &&
          duplicates.some((m) => m.memeId === link.id && m.exact),
      })),
    };
  },
});
