import { beforeEach, describe, expect, it } from 'vitest';
import { setLike } from '@/db/queries/likes';
import {
  addTagToMeme,
  findOrCreateTag,
  getTagAdder,
  listTagRows,
  listTagsForMeme,
  removeTagFromMeme,
  searchTags,
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

  it('lets the adder remove a tag until someone else upvotes it', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    const tag = await findOrCreateTag('cta', alice);
    await addTagToMeme(meme, tag, alice);

    const [mine] = await listTagsForMeme(meme, alice);
    expect(mine.removable).toBe(true);
    const [theirs] = await listTagsForMeme(meme, bob);
    expect(theirs.removable).toBe(false);

    await voteOnTag(meme, tag, bob, 1);
    const [upvoted] = await listTagsForMeme(meme, alice);
    expect(upvoted.removable).toBe(false);
  });

  it('removes a tag, and stops suggesting a tag left on no meme', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    const other = await makeMeme(alice);
    const typo = await findOrCreateTag('cta', alice);
    const shared = await findOrCreateTag('cat', alice);
    await addTagToMeme(meme, typo, alice);
    await addTagToMeme(meme, shared, alice);
    await addTagToMeme(other, shared, alice);
    await voteOnTag(meme, typo, bob, -1);

    await removeTagFromMeme(meme, typo);
    await removeTagFromMeme(meme, shared);
    expect(await listTagsForMeme(meme)).toHaveLength(0);
    expect((await searchTags('')).map((t) => t.name)).toEqual(['cat']);
  });

  it('browses tags on at least two standing memes, most-liked memes first', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const cats = await findOrCreateTag('cats', alice);
    const lonely = await findOrCreateTag('lonely', alice);
    const plain = await makeMeme(alice);
    const liked = await makeMeme(alice);
    await addTagToMeme(plain, cats, alice);
    await addTagToMeme(liked, cats, alice);
    await addTagToMeme(plain, lonely, alice);
    await setLike(liked, bob, true);

    const { rows, nextPage } = await listTagRows({ seed: 'x' });
    expect(rows.map((r) => r.name)).toEqual(['cats']);
    expect(rows[0].uses).toBe(2);
    expect(rows[0].memes.map((m) => m.id)).toEqual([liked, plain]);
    expect(nextPage).toBeNull();
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

    const carol = await makeUser('carol');

    expect(await setLike(meme, bob, true)).toBe(1);
    expect(await setLike(meme, bob, true)).toBe(1);
    expect(await setLike(meme, carol, true)).toBe(2);
    expect(await setLike(meme, bob, false)).toBe(1);
    expect(await setLike(meme, bob, false)).toBe(1);
  });

  it("leaves the uploader's own like out of the count", async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);

    // From before the like route refused these.
    expect(await setLike(meme, alice, true)).toBe(0);
    expect(await setLike(meme, bob, true)).toBe(1);
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

describe('karma', () => {
  it('counts likes and tag votes from others, never your own, and can go down', async () => {
    const { getKarma } = await import('@/db/queries/users');
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const meme = await makeMeme(alice);
    await setLike(meme, bob, true);
    await setLike(meme, alice, true); // self-like: not counted
    const tag = await findOrCreateTag('cats', alice);
    await addTagToMeme(meme, tag, alice); // alice's automatic +1: not counted
    await voteOnTag(meme, tag, bob, 1);
    await voteOnTag(meme, tag, carol, -1);
    expect(await getKarma(alice)).toBe(1 + (1 - 1));
    await voteOnTag(meme, tag, bob, -1);
    expect(await getKarma(alice)).toBe(1 - 2);
  });
});
