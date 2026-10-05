import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { setLike } from '@/db/queries/likes';
import { countQueue, dismissQueueItem, nextQueueItem } from '@/db/queries/queue';
import { addTagToMeme, findOrCreateTag, listTagsForMeme, voteOnTag } from '@/db/queries/tags';
import {
  addTranscription,
  getCurrentTranscription,
  reviewTranscription,
} from '@/db/queries/transcriptions';
import { getKarmaBreakdown, getTrust } from '@/db/queries/users';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

beforeEach(resetDatabase);

// Ten tags by `user`, each downvoted by `voter`: enough judged work, all of it rejected.
async function makeHeld(user: string, voter: string) {
  for (let i = 0; i < 10; i++) {
    const meme = await makeMeme(voter);
    const tag = await findOrCreateTag(`junk${i}`, user);
    await addTagToMeme(meme, tag, user);
    await voteOnTag(meme, tag, voter, -1);
  }
}

describe('trust', () => {
  it('holds a user once at least 10 judgements are mostly rejections', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    await makeHeld(bob, alice);
    expect(await getTrust(bob)).toMatchObject({ approved: 0, rejected: 10, held: true });
    expect((await getTrust(alice)).held).toBe(false);
  });

  it('does not hold on too few judgements, and an admin override wins', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    const tag = await findOrCreateTag('x', bob);
    await addTagToMeme(meme, tag, bob);
    await voteOnTag(meme, tag, alice, -1);
    expect((await getTrust(bob)).held).toBe(false);

    await db(`UPDATE app_user SET trust_override = 'held' WHERE id = $1`, [bob]);
    expect((await getTrust(bob)).held).toBe(true);
  });

  it('hides a held user tag from others until someone upvotes it', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    await makeHeld(bob, alice);
    const meme = await makeMeme(alice);
    const tag = await findOrCreateTag('cats', bob);
    await addTagToMeme(meme, tag, bob);

    expect(await listTagsForMeme(meme, carol)).toHaveLength(0);
    // The adder still sees it, at 0: their own vote does not count.
    const [own] = await listTagsForMeme(meme, bob);
    expect(own.score).toBe(0);

    await voteOnTag(meme, tag, carol, 1);
    const [shown] = await listTagsForMeme(meme, alice);
    expect(shown.score).toBe(1);
  });

  it('ignores a held user vote', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    await makeHeld(bob, alice);
    const meme = await makeMeme(alice);
    const tag = await findOrCreateTag('cats', alice);
    await addTagToMeme(meme, tag, alice);
    await voteOnTag(meme, tag, bob, -1);
    const [row] = await listTagsForMeme(meme);
    expect(row.score).toBe(1);
  });
});

describe('transcription review', () => {
  it('falls back to the previous version when the newest is rejected', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const meme = await makeMeme(alice);
    await addTranscription(meme, 'right', alice);
    const wrong = await addTranscription(meme, 'wrong', bob);
    expect((await getCurrentTranscription(meme))?.text).toBe('wrong');

    await reviewTranscription(wrong.id, carol, -1);
    expect((await getCurrentTranscription(meme))?.text).toBe('right');

    // Changing your mind replaces the verdict rather than adding one.
    await reviewTranscription(wrong.id, carol, 1);
    const current = await getCurrentTranscription(meme);
    expect(current?.text).toBe('wrong');
    expect(current?.confirms).toBe(1);
    expect(current?.rejects).toBe(0);
  });

  it('holds a held user edit until someone confirms it', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    await makeHeld(bob, alice);
    const meme = await makeMeme(alice);
    const saved = await addTranscription(meme, 'from bob', bob);
    expect(saved.pending).toBe(true);
    expect(await getCurrentTranscription(meme)).toBeNull();

    await reviewTranscription(saved.id, carol, 1);
    expect((await getCurrentTranscription(meme))?.text).toBe('from bob');
  });
});

describe('karma', () => {
  it('splits likes from curation, and counts transcription reviews', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const meme = await makeMeme(alice);
    await setLike(meme, bob, true);
    const tag = await findOrCreateTag('cats', alice);
    await addTagToMeme(meme, tag, alice);
    await voteOnTag(meme, tag, bob, 1);
    const t = await addTranscription(meme, 'text', alice);
    await reviewTranscription(t.id, bob, 1);
    await reviewTranscription(t.id, carol, -1);

    // Tag +1 from bob; transcription +1 bob, -1 carol. Alice's own tag vote never counts.
    expect(await getKarmaBreakdown(alice)).toEqual({ post: 1, curation: 1 });
  });
});

describe('queue', () => {
  it('asks for text until a transcription exists, then for confirmations until it has two', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const dave = await makeUser('dave');
    const meme = await makeMeme(alice);

    expect(await nextQueueItem('transcription', bob)).toEqual(
      expect.objectContaining({ transcription: null })
    );

    const version = await addTranscription(meme, 'text', alice);
    // The writer is not asked to check their own.
    expect(await nextQueueItem('transcription', alice)).toBeNull();
    expect((await nextQueueItem('transcription', bob))?.transcription?.id).toBe(version.id);

    await reviewTranscription(version.id, bob, 1);
    // Bob has judged it; Carol has not, and one confirmation is not enough.
    expect(await nextQueueItem('transcription', bob)).toBeNull();
    expect((await nextQueueItem('transcription', carol))?.transcription?.id).toBe(version.id);

    await reviewTranscription(version.id, carol, 1);
    expect(await nextQueueItem('transcription', dave)).toBeNull();
  });

  it('moves review back to the previous version once the newest is rejected twice', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const dave = await makeUser('dave');
    const meme = await makeMeme(alice);
    const right = await addTranscription(meme, 'right', alice);
    const wrong = await addTranscription(meme, 'wrong', bob);

    await reviewTranscription(wrong.id, carol, -1);
    await reviewTranscription(wrong.id, alice, -1);
    expect((await nextQueueItem('transcription', dave))?.transcription?.id).toBe(right.id);
  });

  it('treats an empty transcription as "no text" to be confirmed like any other', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    await addTranscription(meme, '', alice);

    expect((await getCurrentTranscription(meme))?.text).toBe('');
    expect((await nextQueueItem('transcription', bob))?.transcription?.text).toBe('');
  });

  it('brings a skipped meme back once something new happens on it', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const meme = await makeMeme(alice);

    await dismissQueueItem(bob, 'transcription', meme);
    expect(await nextQueueItem('transcription', bob)).toBeNull();

    await addTranscription(meme, 'text', carol);
    expect((await nextQueueItem('transcription', bob))?.meme.id).toBe(meme);
  });

  it('keeps a meme in the tag queue until it has three settled tags and nothing undecided', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const dave = await makeUser('dave');
    const meme = await makeMeme(alice);
    const tags: string[] = [];
    for (const name of ['a', 'b', 'c']) {
      const tag = await findOrCreateTag(name, alice);
      await addTagToMeme(meme, tag, alice);
      tags.push(tag);
    }

    // Three tags, none confirmed by anyone else yet.
    expect((await nextQueueItem('tag', dave))?.meme).toEqual(expect.objectContaining({ id: meme }));

    for (const tag of tags) {
      await voteOnTag(meme, tag, bob, 1);
      await voteOnTag(meme, tag, carol, 1);
    }
    expect(await nextQueueItem('tag', dave)).toBeNull();

    // A new tag nobody has judged opens it up again.
    await addTagToMeme(meme, await findOrCreateTag('d', bob), bob);
    expect((await nextQueueItem('tag', dave))?.meme.id).toBe(meme);
    expect(await countQueue(dave)).toEqual({ transcription: 1, tag: 1 });
  });
});
