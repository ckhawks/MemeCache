import { beforeEach, describe, expect, it } from 'vitest';
import { setLike } from '@/db/queries/likes';
import {
  addTagToMeme,
  findOrCreateTag,
  getTagAdder,
  listTagsForMeme,
  voteOnTag,
} from '@/db/queries/tags';
import { addTranscription, getCurrentTranscription } from '@/db/queries/transcriptions';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

beforeEach(resetDatabase);

describe('tags', () => {
  it('scores a tag once even when a second person adds it', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);

    // Different case, same tag.
    await addTagToMeme(meme, await findOrCreateTag('Dogs', alice), alice);
    await addTagToMeme(meme, await findOrCreateTag('dogs', bob), bob);

    const tags = await listTagsForMeme(meme, bob);
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('Dogs');
    expect(tags[0].score).toBe(2);
    expect(tags[0].addedBy).toBe(alice);
    expect(tags[0].own).toBe(false);
    expect(tags[0].myVote).toBe(1);
  });

  it('reports own and myVote for the viewer, and nothing for a visitor', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    const tag = await findOrCreateTag('cats', alice);
    await addTagToMeme(meme, tag, alice);
    await voteOnTag(meme, tag, bob, -1);

    const [asAlice] = await listTagsForMeme(meme, alice);
    expect(asAlice.own).toBe(true);
    expect(asAlice.score).toBe(0);

    const [asBob] = await listTagsForMeme(meme, bob);
    expect(asBob.own).toBe(false);
    expect(asBob.myVote).toBe(-1);

    const [asVisitor] = await listTagsForMeme(meme);
    expect(asVisitor.own).toBe(false);
    expect(asVisitor.myVote).toBe(0);
  });

  it('changes a vote rather than stacking it', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    const tag = await findOrCreateTag('cats', alice);
    await addTagToMeme(meme, tag, alice);

    await voteOnTag(meme, tag, bob, 1);
    await voteOnTag(meme, tag, bob, 1);
    await voteOnTag(meme, tag, bob, -1);

    const [row] = await listTagsForMeme(meme);
    expect(row.score).toBe(0);
  });

  it('knows who added a tag, and null for a tag the meme does not carry', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    const tag = await findOrCreateTag('cats', alice);
    expect(await getTagAdder(meme, tag)).toBeNull();
    await addTagToMeme(meme, tag, alice);
    expect(await getTagAdder(meme, tag)).toBe(alice);
  });
});

describe('likes', () => {
  it('is idempotent in both directions and returns the new count', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);

    expect(await setLike(meme, bob, true)).toBe(1);
    expect(await setLike(meme, bob, true)).toBe(1);
    expect(await setLike(meme, alice, true)).toBe(2);
    expect(await setLike(meme, bob, false)).toBe(1);
    expect(await setLike(meme, bob, false)).toBe(1);
  });
});

describe('transcriptions', () => {
  it('returns the newest edit with its editor', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);

    expect(await getCurrentTranscription(meme)).toBeNull();
    await addTranscription(meme, 'first', alice);
    const saved = await addTranscription(meme, 'second', bob);
    expect(saved.editedByUsername).toBe('bob');

    const current = await getCurrentTranscription(meme);
    expect(current?.text).toBe('second');
    expect(current?.editedBy).toBe(bob);
  });
});

describe('profile stats', () => {
  it('counts uploads, likes received from others, tags and transcribed memes', async () => {
    const { getProfileStats } = await import('@/db/queries/users');
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    await makeMeme(alice);
    await setLike(meme, bob, true);
    await setLike(meme, alice, true); // a self-like does not count as received
    await addTagToMeme(meme, await findOrCreateTag('cats', alice), alice);
    await addTranscription(meme, 'one', alice);
    await addTranscription(meme, 'two', alice); // the same meme twice counts once

    const stats = await getProfileStats(alice);
    expect(stats).toMatchObject({
      uploads: 2,
      likesReceived: 1,
      tagsAdded: 1,
      transcriptions: 1,
      role: 'user',
    });
    expect(stats.memberSince).not.toBeNull();
  });
});
