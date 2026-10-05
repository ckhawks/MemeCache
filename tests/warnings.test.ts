import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { createMeme, getMeme, listMemes } from '@/db/queries/memes';
import { nextQueueItem } from '@/db/queries/queue';
import { addTagToMeme, findOrCreateTag, listTagRows } from '@/db/queries/tags';
import {
  addWarnings,
  getWarningAdder,
  getWarningDisplay,
  listWarningsForMeme,
  removeWarning,
  setWarningDisplay,
} from '@/db/queries/warnings';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

beforeEach(resetDatabase);

describe('content warnings', () => {
  it('stores warnings given on upload with the meme', async () => {
    const alice = await makeUser('alice');
    const id = randomUUID();
    await createMeme({
      id,
      uploaderId: alice,
      s3Key: id,
      contentType: 'image/png',
      warnings: ['spoiler', 'nsfw', 'nsfw'],
    });

    const meme = await getMeme(id);
    expect(meme?.warnings).toEqual(['nsfw', 'spoiler']);
    expect(await getWarningAdder(id, 'nsfw')).toBe(alice);
  });

  it('creates a meme with no warnings when none are given', async () => {
    const alice = await makeUser('alice');
    const id = randomUUID();
    await createMeme({ id, uploaderId: alice, s3Key: id, contentType: 'image/png' });

    expect((await getMeme(id))?.warnings).toEqual([]);
  });

  it('returns warnings on every feed row, empty for unlabelled memes', async () => {
    const alice = await makeUser('alice');
    const labelled = await makeMeme(alice, '2026-01-02T00:00:00Z');
    const plain = await makeMeme(alice, '2026-01-01T00:00:00Z');
    await addWarnings(labelled, ['gore'], alice);

    const { memes } = await listMemes({});
    expect(memes.map((m) => [m.id, m.warnings])).toEqual([
      [labelled, ['gore']],
      [plain, []],
    ]);
  });

  it('keeps whoever added a warning first, and lists own for the viewer', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);

    await addWarnings(meme, ['nsfw'], bob);
    await addWarnings(meme, ['nsfw', 'flashing'], alice);

    expect(await listWarningsForMeme(meme, bob)).toEqual([
      { warning: 'flashing', addedByUsername: 'alice', own: false },
      { warning: 'nsfw', addedByUsername: 'bob', own: true },
    ]);
    expect((await listWarningsForMeme(meme)).every((w) => w.own === false)).toBe(true);
  });

  it('removes a warning by deleting its row', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    await addWarnings(meme, ['nsfw', 'spoiler'], alice);

    await removeWarning(meme, 'nsfw');
    expect(await getWarningAdder(meme, 'nsfw')).toBeUndefined();
    expect((await getMeme(meme))?.warnings).toEqual(['spoiler']);
  });

  it('keeps a warning when the account that added it is deleted', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    await addWarnings(meme, ['nsfw'], bob);

    await db(`DELETE FROM app_user WHERE id = $1`, [bob]);
    expect(await getWarningAdder(meme, 'nsfw')).toBeNull();
    expect(await listWarningsForMeme(meme)).toEqual([
      { warning: 'nsfw', addedByUsername: null, own: false },
    ]);
  });

  it('carries warnings into the queue and the browse-tags thumbnails', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const first = await makeMeme(alice);
    const second = await makeMeme(alice);
    await addWarnings(first, ['nsfw'], alice);
    await addWarnings(second, ['nsfw'], alice);

    expect((await nextQueueItem('tag', bob))?.meme.warnings).toEqual(['nsfw']);

    // Adding a tag counts as its adder's upvote, so both stand.
    const cats = await findOrCreateTag('cats', alice);
    await addTagToMeme(first, cats, alice);
    await addTagToMeme(second, cats, alice);
    const { rows } = await listTagRows({ seed: 'x' });
    expect(rows[0].memes.map((m) => m.warnings)).toEqual([['nsfw'], ['nsfw']]);
  });
});

describe('warning display setting', () => {
  it('defaults to blur and can be changed', async () => {
    const alice = await makeUser('alice');
    expect(await getWarningDisplay(alice)).toBe('blur');

    await setWarningDisplay(alice, 'hover');
    expect(await getWarningDisplay(alice)).toBe('hover');
  });

  it('is blur for an id that is not a user', async () => {
    expect(await getWarningDisplay('not-a-uuid')).toBe('blur');
    expect(await getWarningDisplay(randomUUID())).toBe('blur');
  });
});
