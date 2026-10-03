import { beforeEach, describe, expect, it } from 'vitest';
import { countMemes, listMemes, softDeleteMeme } from '@/db/queries/memes';
import { setSave } from '@/db/queries/saves';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

beforeEach(resetDatabase);

describe('saves', () => {
  it('lists only the memes a user saved, and is idempotent', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const saved = await makeMeme(alice);
    await makeMeme(alice);

    await setSave(saved, bob, true);
    await setSave(saved, bob, true);

    const { memes } = await listMemes({ viewerId: bob, savedBy: bob });
    expect(memes.map((m) => m.id)).toEqual([saved]);
    expect(memes[0].hasSaved).toBe(true);
    expect(await countMemes({ savedBy: bob })).toBe(1);
    expect(await countMemes({ savedBy: alice })).toBe(0);

    await setSave(saved, bob, false);
    await setSave(saved, bob, false);
    expect(await countMemes({ savedBy: bob })).toBe(0);
  });

  it('keeps saves private: hasSaved is about the viewer only', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    await setSave(meme, bob, true);

    const asAlice = await listMemes({ viewerId: alice });
    expect(asAlice.memes[0].hasSaved).toBe(false);
  });

  it('drops a soft-deleted meme from the Library', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    await setSave(meme, bob, true);
    await softDeleteMeme(meme);
    expect(await countMemes({ savedBy: bob })).toBe(0);
  });
});
