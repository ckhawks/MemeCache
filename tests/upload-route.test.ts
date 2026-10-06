import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { saveFingerprint } from '@/db/queries/mediaHash';
import { fingerprintImage } from '@/server/mediaHashDecode';
import { makeMeme, makeUser, resetDatabase } from './fixtures';
import { encode, jpeg, picture, png, withText } from './images';

// The upload route reads the session through Next, stores the file in S3 and fingerprints
// after the response. Each is swapped for a stand-in here: the session is set per test, the
// bucket accepts anything, and work for after the response is collected and run by hand.
const session = vi.hoisted(() => ({
  user: undefined as { id: string } | undefined,
}));
const afterResponse = vi.hoisted(() => [] as (() => unknown)[]);

vi.mock('@/auth/lib', () => ({
  getUserFromAccessToken: async () => session.user,
}));

vi.mock('@/util/s3/GetS3Client', () => ({
  default: () => ({ send: async () => ({}) }),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => unknown) => {
    afterResponse.push(task);
  },
}));

const { POST } = await import('@/app/api/upload/route');

async function upload(file: Buffer, type: string) {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(file)], 'meme', { type }));
  const response = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }), {
    params: Promise.resolve({}),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function runAfterResponse() {
  for (const task of afterResponse.splice(0)) {
    await task();
  }
}

const meme = withText(picture(1, 480, 360), 20);
let existing: string;
let existingSlug: string;

beforeEach(async () => {
  await resetDatabase();
  afterResponse.length = 0;
  const alice = await makeUser('alice');
  session.user = { id: await makeUser('bob') };
  existing = await makeMeme(alice);
  [{ slug: existingSlug }] = await db<{ slug: string }>(`SELECT slug FROM meme WHERE id = $1`, [existing]);
  await saveFingerprint(existing, await fingerprintImage(await png(meme)));
});

describe('POST /api/upload', () => {
  it('refuses an exact copy of a live meme, saying which one', async () => {
    const result = await upload(await jpeg(meme, 60), 'image/jpeg');
    expect(result).toEqual({
      status: 409,
      body: { error: 'This meme is already here.', duplicate: existingSlug },
    });
    expect(await db(`SELECT 1 FROM meme WHERE id <> $1`, [existing])).toHaveLength(0);
    const [event] = await db<{ kind: string; memeId: string }>(`SELECT kind, meme_id AS "memeId" FROM event`);
    expect(event).toEqual({ kind: 'upload_refused', memeId: existing });
  });

  it('takes a cropped copy, storing its fingerprint and the match as a duplicate', async () => {
    const cropped = await encode(meme).extract({ left: 24, top: 0, width: 456, height: 360 }).png().toBuffer();
    const result = await upload(cropped, 'image/png');
    expect(result.status).toBe(200);
    await runAfterResponse();

    const id = result.body.id as string;
    expect(await db(`SELECT 1 FROM meme_media_hash WHERE meme_id = $1 AND error IS NULL`, [id])).toHaveLength(1);
    const matches = await db<{ kind: string }>(`SELECT kind FROM meme_media_match`);
    expect(matches).toEqual([{ kind: 'duplicate' }]);
  });

  it('takes an exact copy once the meme it copies is deleted', async () => {
    await db(`UPDATE meme SET deleted_at = now() WHERE id = $1`, [existing]);
    expect((await upload(await png(meme), 'image/png')).status).toBe(200);
  });
});
