import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import {
  deleteMatchesExcept,
  getFingerprints,
  listMatchedMemes,
  listMemeHashes,
  listMemesToHash,
  saveFingerprint,
  saveFingerprintError,
  saveMatches,
} from '@/db/queries/mediaHash';
import { softDeleteMeme } from '@/db/queries/memes';
import { FINGERPRINT_VERSION } from '@/server/mediaHash';
import { fingerprintImage } from '@/server/mediaHashDecode';
import { findMatches, fingerprintAndMatch, matchAll } from '@/server/mediaMatch';
import { makeMeme, makeUser, resetDatabase } from './fixtures';
import { jpeg, picture, png, withText } from './images';

const base = picture(1, 480, 360);
const other = picture(2, 480, 360);

let uploader: string;

beforeEach(async () => {
  await resetDatabase();
  uploader = await makeUser('uploader');
});

describe('storing fingerprints', () => {
  it('reads back exactly what was saved', async () => {
    const id = await makeMeme(uploader);
    const fingerprint = await fingerprintImage(await png(withText(base, 5)));
    await saveFingerprint(id, fingerprint);

    // Aspect ratios are stored as 4-byte reals.
    const rounded = (f: typeof fingerprint) => ({
      ...f,
      regions: f.regions.map((r) => ({ ...r, aspect: r.aspect.toFixed(4) })),
    });
    const loaded = (await getFingerprints([id])).get(id);
    expect(loaded && rounded(loaded)).toEqual(rounded(fingerprint));
    expect((await listMemeHashes()).map((m) => m.memeId)).toEqual([id]);
  });

  it('keeps a failure apart, and only retries it when asked', async () => {
    const failed = await makeMeme(uploader);
    const fresh = await makeMeme(uploader);
    await saveFingerprintError(failed, 'not an image');

    expect((await listMemesToHash(10)).map((m) => m.id)).toEqual([fresh]);
    expect((await listMemesToHash(10, true)).map((m) => m.id).sort()).toEqual([failed, fresh].sort());
    expect(await listMemeHashes()).toEqual([]);
  });

  it('redoes fingerprints from an older version', async () => {
    const id = await makeMeme(uploader);
    await saveFingerprint(id, await fingerprintImage(await png(base)));
    expect(await listMemesToHash(10)).toEqual([]);

    await db(`UPDATE meme_media_hash SET version = $1`, [FINGERPRINT_VERSION - 1]);
    expect((await listMemesToHash(10)).map((m) => m.id)).toEqual([id]);
    expect(await listMemeHashes()).toEqual([]);
  });
});

describe('finding matches', () => {
  it('finds a re-encoded copy as a duplicate and skips unrelated and deleted memes', async () => {
    const original = await makeMeme(uploader);
    const unrelated = await makeMeme(uploader);
    const deleted = await makeMeme(uploader);
    await saveFingerprint(original, await fingerprintImage(await png(base)));
    await saveFingerprint(unrelated, await fingerprintImage(await png(other)));
    await saveFingerprint(deleted, await fingerprintImage(await png(base)));
    await softDeleteMeme(deleted);

    const found = await findMatches(await fingerprintImage(await jpeg(base, 40)));
    expect(found.map((m) => [m.memeId, m.kind])).toEqual([[original, 'duplicate']]);
  });

  it('records matches for an upload, which both memes then list', async () => {
    const first = await makeMeme(uploader);
    const second = await makeMeme(uploader);
    await fingerprintAndMatch(first, await png(withText(base, 5)), 'image/png');
    await fingerprintAndMatch(second, await png(withText(base, 9)), 'image/png');

    expect((await listMatchedMemes(first)).map((m) => [m.id, m.matchKind])).toEqual([[second, 'template']]);
    expect((await listMatchedMemes(second)).map((m) => [m.id, m.matchKind])).toEqual([[first, 'template']]);
  });

  it('records a file it cannot read as a failure instead of throwing', async () => {
    const id = await makeMeme(uploader);
    await fingerprintAndMatch(id, Buffer.from('not an image'), 'image/png');

    const [row] = await db<{ error: string | null }>(`SELECT error FROM meme_media_hash WHERE meme_id = $1`, [id]);
    expect(row.error).toBeTruthy();
  });

  it('rebuilds matches: stores current pairs once and removes ones that no longer hold', async () => {
    const a = await makeMeme(uploader);
    const b = await makeMeme(uploader);
    const c = await makeMeme(uploader);
    const fingerprints = new Map([
      [a, await fingerprintImage(await png(base))],
      [b, await fingerprintImage(await jpeg(base, 50))],
      [c, await fingerprintImage(await png(other))],
    ]);
    // A stale pair from an earlier run.
    await saveMatches([{ memeId: a, otherId: c, kind: 'template', score: 0.5 }]);

    const matches = matchAll(fingerprints);
    expect(matches.map((m) => m.kind)).toEqual(['duplicate']);
    await saveMatches(matches);
    // The same pair the other way round is the same row.
    await saveMatches(matches.map((m) => ({ ...m, memeId: m.otherId, otherId: m.memeId })));
    await deleteMatchesExcept([a, b, c], matches);

    const rows = await db(`SELECT kind FROM meme_media_match`);
    expect(rows).toEqual([{ kind: 'duplicate' }]);
    expect((await listMatchedMemes(c)).length).toBe(0);
  });
});
