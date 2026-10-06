import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { setLike } from '@/db/queries/likes';
import {
  countMemes,
  getMeme,
  listForYou,
  listMemes,
  listMemesOrdered,
  listRelatedMemes,
  listTopMemes,
} from '@/db/queries/memes';
import { countQueue, nextQueueItem } from '@/db/queries/queue';
import { parseSearch, searchMemes } from '@/db/queries/search';
import {
  getTagPreferences,
  getTagWithPreference,
  listTagPreferences,
  setTagPreference,
} from '@/db/queries/tagPreferences';
import { addTagToMeme, findOrCreateTag, listTagRows, voteOnTag } from '@/db/queries/tags';
import { addTranscription } from '@/db/queries/transcriptions';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

beforeEach(resetDatabase);

async function tag(memeId: string, name: string, userId: string) {
  const tagId = await findOrCreateTag(name, userId);
  await addTagToMeme(memeId, tagId, userId);
  return tagId;
}

// alice uploads a cat meme (tagged cats) and a plain one; bob mutes cats.
async function mutedSetup() {
  const alice = await makeUser('alice');
  const bob = await makeUser('bob');
  const cat = await makeMeme(alice, '2026-01-02T00:00:00Z');
  const plain = await makeMeme(alice, '2026-01-01T00:00:00Z');
  const cats = await tag(cat, 'cats', alice);
  await setTagPreference(bob, cats, 'mute');
  return { alice, bob, cat, plain, cats };
}

describe('tag preferences', () => {
  it('follow and mute exclude each other, and clearing deletes the row', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    const cats = await tag(meme, 'cats', alice);

    await setTagPreference(alice, cats, 'follow');
    await setTagPreference(alice, cats, 'follow');
    expect(await listTagPreferences(alice)).toEqual([{ id: cats, name: 'cats', kind: 'follow' }]);

    await setTagPreference(alice, cats, 'mute');
    expect(await listTagPreferences(alice)).toEqual([{ id: cats, name: 'cats', kind: 'mute' }]);
    expect(await getTagPreferences(alice, [cats])).toEqual({ [cats]: 'mute' });
    expect(await getTagWithPreference('CATS', alice)).toEqual({ id: cats, name: 'cats', preference: 'mute' });

    await setTagPreference(alice, cats, null);
    const [{ count }] = await db<{ count: number }>(`SELECT count(*)::int AS count FROM tag_preference`);
    expect(count).toBe(0);
    expect(await getTagWithPreference('cats', alice)).toMatchObject({ preference: null });
  });

  it('the database refuses a second row for the same tag', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    const cats = await tag(meme, 'cats', alice);
    await db(`INSERT INTO tag_preference (user_id, tag_id, kind) VALUES ($1, $2, 'follow')`, [alice, cats]);
    await expect(
      db(`INSERT INTO tag_preference (user_id, tag_id, kind) VALUES ($1, $2, 'mute')`, [alice, cats])
    ).rejects.toThrow();
  });

  it('goes with the tag when the tag is deleted', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    const cats = await tag(meme, 'cats', alice);
    await setTagPreference(alice, cats, 'follow');
    await db(`DELETE FROM tag WHERE id = $1`, [cats]);
    expect(await listTagPreferences(alice)).toEqual([]);
  });
});

describe('mute', () => {
  it('hides muted memes from Explore in every sort, and from its count', async () => {
    const { alice, bob, cat, plain } = await mutedSetup();
    const filter = { viewerId: bob, hideMuted: true };

    expect((await listMemes(filter)).memes.map((m) => m.id)).toEqual([plain]);
    expect((await listMemesOrdered(filter, 'top')).memes.map((m) => m.id)).toEqual([plain]);
    expect((await listMemesOrdered(filter, 'random', { seed: 'x' })).memes.map((m) => m.id)).toEqual([plain]);
    expect((await listForYou(bob)).memes.map((m) => m.id)).toEqual([plain]);
    expect(await countMemes(filter)).toBe(1);

    // Only for the one who muted it.
    expect(await countMemes({ viewerId: alice, hideMuted: true })).toBe(2);
    // Feeds that do not ask, such as the tag page, a profile or a Library, list it.
    expect(await countMemes({ viewerId: bob, tagName: 'cats' })).toBe(1);
    // And the meme still opens directly.
    expect((await getMeme(cat, bob))?.id).toBe(cat);
  });

  it('only hides a tag that stands on the meme', async () => {
    const { bob, cat } = await mutedSetup();
    const carol = await makeUser('carol');
    const dave = await makeUser('dave');
    const [{ id: cats }] = await db<{ id: string }>(`SELECT id FROM tag WHERE name = 'cats'`);
    // Two downvotes take it to -1: the meme no longer counts as a cat meme.
    await voteOnTag(cat, cats, carol, -1);
    await voteOnTag(cat, cats, dave, -1);
    expect(await countMemes({ viewerId: bob, hideMuted: true })).toBe(2);
  });

  it('hides muted memes from the home page top memes', async () => {
    const { bob, cat, plain } = await mutedSetup();
    await setLike(cat, bob, true);
    const top = await listTopMemes(bob, 5);
    expect(top.memes.map((m) => m.id)).toEqual([plain]);
    expect((await listTopMemes(undefined, 5)).memes.map((m) => m.id)).toEqual([cat, plain]);
  });

  it('hides muted memes from related memes', async () => {
    const { alice, bob, cat, plain } = await mutedSetup();
    const base = await makeMeme(alice);
    const related = await listRelatedMemes({ id: base, uploaderId: alice }, bob);
    expect(related.map((m) => m.id)).toEqual([plain]);
    expect((await listRelatedMemes({ id: base, uploaderId: alice }, alice)).map((m) => m.id)).toContain(cat);
  });

  it('hides muted memes and the muted tag from browse tags', async () => {
    const { alice, bob, cat, plain } = await mutedSetup();
    const third = await makeMeme(alice);
    const fourth = await makeMeme(alice);
    // cats is on two memes; funny is on all four, both cat memes included.
    await tag(third, 'cats', alice);
    for (const meme of [cat, plain, third, fourth]) {
      await tag(meme, 'funny', alice);
    }

    const asAlice = await listTagRows({ seed: 'x', viewerId: alice });
    expect(asAlice.rows.map((r) => r.name).sort()).toEqual(['cats', 'funny']);

    const asBob = await listTagRows({ seed: 'x', viewerId: bob });
    expect(asBob.rows.map((r) => r.name)).toEqual(['funny']);
    expect(asBob.rows[0].uses).toBe(2);
    expect(asBob.rows[0].memes.map((m) => m.id).sort()).toEqual([plain, fourth].sort());
  });

  it('hides muted memes from search, even when searched for by the muted tag', async () => {
    const { alice, bob, cat, plain } = await mutedSetup();
    await addTranscription(cat, 'one does not simply', alice);
    await addTranscription(plain, 'one does not simply', alice);

    const asBob = await searchMemes(parseSearch('simply'), { viewerId: bob });
    expect(asBob.memes.map((m) => m.id)).toEqual([plain]);
    expect(asBob.total).toBe(1);
    expect((await searchMemes(parseSearch('tag:cats'), { viewerId: bob })).memes).toEqual([]);

    const asAlice = await searchMemes(parseSearch('simply'), { viewerId: alice });
    expect(asAlice.total).toBe(2);
  });

  it('keeps muted memes out of the queue', async () => {
    const { bob, plain } = await mutedSetup();
    // Both need typing out and tagging; the cat meme is muted.
    expect(await countQueue(bob)).toEqual({ transcription: 1, tag: 1, duplicate: 0 });
    expect((await nextQueueItem('transcription', bob))?.meme.id).toBe(plain);
    expect((await nextQueueItem('tag', bob))?.meme.id).toBe(plain);
  });
});

describe('For you', () => {
  it('puts memes with a followed tag first, newest day first, and names the tags', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const newestPlain = await makeMeme(alice, '2026-03-05T12:00:00Z');
    const oldCat = await makeMeme(alice, '2026-03-01T12:00:00Z');
    const newCatDog = await makeMeme(alice, '2026-03-03T12:00:00Z');
    const oldPlain = await makeMeme(alice, '2026-02-01T12:00:00Z');
    const cats = await tag(oldCat, 'cats', alice);
    await tag(newCatDog, 'cats', alice);
    const dogs = await tag(newCatDog, 'dogs', alice);
    await tag(newestPlain, 'birds', alice);
    await setTagPreference(bob, cats, 'follow');
    await setTagPreference(bob, dogs, 'follow');

    const { memes, nextPage } = await listForYou(bob);
    expect(memes.map((m) => m.id)).toEqual([newCatDog, oldCat, newestPlain, oldPlain]);
    expect(memes.map((m) => m.followedTags)).toEqual([['cats', 'dogs'], ['cats'], [], []]);
    expect(nextPage).toBeNull();
  });

  it('within a day, most liked first', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const earlier = await makeMeme(alice, '2026-03-01T08:00:00Z');
    const later = await makeMeme(alice, '2026-03-01T09:00:00Z');
    const cats = await tag(earlier, 'cats', alice);
    await tag(later, 'cats', alice);
    await setTagPreference(bob, cats, 'follow');
    await setLike(earlier, bob, true);

    const { memes } = await listForYou(bob);
    expect(memes.map((m) => m.id)).toEqual([earlier, later]);
  });

  it('does not count a followed tag that was voted off the meme', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const newer = await makeMeme(alice, '2026-03-02T00:00:00Z');
    const older = await makeMeme(alice, '2026-03-01T00:00:00Z');
    const cats = await tag(older, 'cats', alice);
    await setTagPreference(bob, cats, 'follow');
    await voteOnTag(older, cats, bob, -1);
    await voteOnTag(older, cats, carol, -1);

    const { memes } = await listForYou(bob);
    expect(memes.map((m) => m.id)).toEqual([newer, older]);
    expect(memes[1].followedTags).toEqual([]);
  });

  it('with nothing followed, is every meme by day; mutes still apply', async () => {
    const { bob, cat, plain } = await mutedSetup();
    expect((await listForYou(bob)).memes.map((m) => m.id)).toEqual([plain]);
    await setTagPreference(bob, (await getTagWithPreference('cats'))!.id, null);
    expect((await listForYou(bob)).memes.map((m) => m.id)).toEqual([cat, plain]);
  });

  it('pages by offset', async () => {
    const alice = await makeUser('alice');
    for (let i = 0; i < 3; i++) {
      await makeMeme(alice, `2026-03-0${i + 1}T00:00:00Z`);
    }
    const first = await listForYou(alice, { limit: 2 });
    expect(first.memes).toHaveLength(2);
    expect(first.nextPage).toBe(1);
    const second = await listForYou(alice, { page: 1, limit: 2 });
    expect(second.memes).toHaveLength(1);
    expect(second.nextPage).toBeNull();
  });
});
