import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { countMemes, getMeme, listMemes, listTopMemes, softDeleteMeme } from '@/db/queries/memes';
import { setLike } from '@/db/queries/likes';
import { addTagToMeme, findOrCreateTag, voteOnTag } from '@/db/queries/tags';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

beforeEach(resetDatabase);

describe('listMemes', () => {
  it('counts likes without multiplying them by tag votes', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const meme = await makeMeme(alice);

    await setLike(meme, bob, true);
    await setLike(meme, carol, true);
    const tag = await findOrCreateTag('dogs', alice);
    await addTagToMeme(meme, tag, alice);
    await voteOnTag(meme, tag, bob, 1);
    await voteOnTag(meme, tag, carol, 1);

    const { memes } = await listMemes({ viewerId: bob });
    expect(memes).toHaveLength(1);
    expect(memes[0].likeCount).toBe(2);
    expect(memes[0].hasLiked).toBe(true);

    const visitor = await listMemes({});
    expect(visitor.memes[0].hasLiked).toBe(false);
  });

  it('returns newest first and pages through ties without skipping or repeating', async () => {
    const alice = await makeUser('alice');
    const sameInstant = '2026-01-01T00:00:00.123456Z';
    const ids = [
      await makeMeme(alice, sameInstant),
      await makeMeme(alice, sameInstant),
      await makeMeme(alice, sameInstant),
      await makeMeme(alice, '2026-01-02T00:00:00Z'),
      await makeMeme(alice, '2025-12-31T00:00:00Z'),
    ];

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await listMemes({}, cursor, 2);
      seen.push(...page.memes.map((m) => m.id));
      cursor = page.nextCursor;
    } while (cursor);

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    expect(seen[0]).toBe(ids[3]);
    expect(seen[4]).toBe(ids[4]);
  });

  it('filters by uploader', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    await makeMeme(alice);
    await makeMeme(bob);

    const { memes } = await listMemes({ uploaderId: alice });
    expect(memes.map((m) => m.uploaderId)).toEqual([alice]);
    expect(await countMemes({ uploaderId: alice })).toBe(1);
  });

  it('filters by tag, only where the tag has a net score of at least 1', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const kept = await makeMeme(alice);
    const votedDown = await makeMeme(alice);

    const tag = await findOrCreateTag('Dogs', alice);
    await addTagToMeme(kept, tag, alice);
    await addTagToMeme(votedDown, tag, alice);
    await voteOnTag(votedDown, tag, bob, -1);
    await voteOnTag(votedDown, tag, carol, -1);

    const { memes } = await listMemes({ tagName: 'dogs' });
    expect(memes.map((m) => m.id)).toEqual([kept]);
    expect(await countMemes({ tagName: 'DOGS' })).toBe(1);
  });
});

describe('soft delete', () => {
  it('hides a deleted meme from feeds, counts and lookups but keeps the row', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);

    await softDeleteMeme(meme);

    expect((await listMemes({})).memes).toHaveLength(0);
    expect(await countMemes({})).toBe(0);
    expect(await getMeme(meme)).toBeNull();
    const rows = await db(`SELECT 1 FROM meme WHERE id = $1`, [meme]);
    expect(rows).toHaveLength(1);
  });
});

describe('getMeme', () => {
  it('returns null for a malformed id instead of throwing', async () => {
    expect(await getMeme('not-a-uuid')).toBeNull();
  });
});

describe('cascades', () => {
  it('removes likes, tags, votes and transcriptions with a hard-deleted meme', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    await setLike(meme, bob, true);
    await addTagToMeme(meme, await findOrCreateTag('dogs', alice), alice);
    await db(`INSERT INTO meme_transcription (meme_id, text, edited_by) VALUES ($1, 'hi', $2)`, [
      meme,
      bob,
    ]);

    await db(`DELETE FROM meme WHERE id = $1`, [meme]);

    for (const table of ['meme_like', 'meme_tag', 'meme_tag_vote', 'meme_transcription']) {
      const rows = await db(`SELECT 1 FROM ${table} WHERE meme_id = $1`, [meme]);
      expect(rows, table).toHaveLength(0);
    }
  });
});

describe('slugs', () => {
  it('gives each meme a short slug without confusable characters, findable by slug or uuid', async () => {
    const { createMeme } = await import('@/db/queries/memes');
    const alice = await makeUser('alice');
    const id = (await import('node:crypto')).randomUUID();
    const slug = await createMeme({ id, uploaderId: alice, s3Key: id, contentType: 'image/png' });

    expect(slug).toMatch(/^[2-9A-HJ-NP-Za-km-np-z]{7}$/);
    expect((await getMeme(slug))?.id).toBe(id);
    expect((await getMeme(id))?.slug).toBe(slug);
    // A string of the right length but outside the alphabet is not looked up at all.
    expect(await getMeme('0Ol1Il0')).toBeNull();
  });
});

describe('listRelatedMemes', () => {
  it('ranks shared confirmed tags first, then same uploader, then newest, never the meme itself', async () => {
    const { listRelatedMemes } = await import('@/db/queries/memes');
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const base = await makeMeme(alice, '2026-01-01T00:00:00Z');
    const sharesTwo = await makeMeme(bob, '2025-01-01T00:00:00Z');
    const sharesOne = await makeMeme(bob, '2025-02-01T00:00:00Z');
    const sameUploader = await makeMeme(alice, '2025-03-01T00:00:00Z');
    const unrelatedNewest = await makeMeme(bob, '2026-02-01T00:00:00Z');
    const downvotedShare = await makeMeme(bob, '2025-04-01T00:00:00Z');

    const cats = await findOrCreateTag('cats', alice);
    const loaf = await findOrCreateTag('loaf', alice);
    for (const meme of [base, sharesTwo]) {
      await addTagToMeme(meme, cats, alice);
      await addTagToMeme(meme, loaf, alice);
    }
    await addTagToMeme(sharesOne, cats, alice);
    // A shared tag voted down to 0 is not confirmed, so it does not count.
    await addTagToMeme(downvotedShare, cats, alice);
    await voteOnTag(downvotedShare, cats, carol, -1);

    const related = await listRelatedMemes({ id: base, uploaderId: alice });
    expect(related.map((m) => m.id)).toEqual([
      sharesTwo,
      sharesOne,
      sameUploader,
      unrelatedNewest,
      downvotedShare,
    ]);
  });
});

describe('listMemesOrdered', () => {
  it('top puts the most liked first; random is stable per seed and pages without repeats', async () => {
    const { listMemesOrdered } = await import('@/db/queries/memes');
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) {
      ids.push(await makeMeme(alice, `2026-01-0${i + 1}T00:00:00Z`));
    }
    await setLike(ids[2], bob, true);
    await setLike(ids[2], carol, true);
    await setLike(ids[5], bob, true);

    const top = await listMemesOrdered({}, 'top');
    expect(top.memes.slice(0, 2).map((m) => m.id)).toEqual([ids[2], ids[5]]);

    const first = await listMemesOrdered({}, 'random', { seed: 'abc', limit: 3 });
    const again = await listMemesOrdered({}, 'random', { seed: 'abc', limit: 3 });
    expect(again.memes.map((m) => m.id)).toEqual(first.memes.map((m) => m.id));

    const seen: string[] = [];
    let page: number | null = 0;
    while (page !== null) {
      const result = await listMemesOrdered({}, 'random', { seed: 'abc', limit: 3, page });
      seen.push(...result.memes.map((m) => m.id));
      page = result.nextPage;
    }
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);

    const other = await listMemesOrdered({}, 'random', { seed: 'xyz', limit: 7 });
    expect(other.memes.map((m) => m.id)).not.toEqual(seen);
  });
});

describe('listTopMemes', () => {
  it('uses the shortest window with enough memes, most liked first', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const old = await makeMeme(alice, '2020-01-01');
    const recent = await makeMeme(alice);
    const liked = await makeMeme(alice);
    await setLike(liked, bob, true);

    // Two memes today: enough for a window of 2.
    const today = await listTopMemes(bob, 2);
    expect(today.window).toBe('day');
    expect(today.memes.map((m) => m.id)).toEqual([liked, recent]);

    // Three needed: only all time has three.
    const all = await listTopMemes(bob, 3);
    expect(all.window).toBe('all');
    expect(all.memes.map((m) => m.id)).toContain(old);
  });
});
