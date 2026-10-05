import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { setLike } from '@/db/queries/likes';
import { setSave } from '@/db/queries/saves';
import { countMemes, getMeme, listMemes, listTopMemes, softDeleteMeme } from '@/db/queries/memes';
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
import { addWarnings, getWarningAdder, listWarningsForMeme, removeWarning } from '@/db/queries/warnings';
import { addTranscription, reviewTranscription } from '@/db/queries/transcriptions';
import { getKarmaBreakdown, getProfileStats, getTrust } from '@/db/queries/users';
import { parseSearch, searchMemes } from '@/db/queries/search';
import { setTagPreference } from '@/db/queries/tagPreferences';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

beforeEach(resetDatabase);

// Migration 017: undoing something keeps the row, and nothing that counts sees it.

describe('likes and saves', () => {
  it('keeps an unlike as a removed row that nothing counts', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);

    expect(await setLike(meme, bob, true)).toBe(1);
    expect(await setLike(meme, bob, false)).toBe(0);
    expect(await setLike(meme, bob, false)).toBe(0);

    const [card] = (await listMemes({ viewerId: bob })).memes;
    expect(card.likeCount).toBe(0);
    expect(card.hasLiked).toBe(false);
    expect((await getKarmaBreakdown(alice)).post).toBe(0);
    expect((await getProfileStats(alice)).likesReceived).toBe(0);

    const rows = await db<{ removed: boolean }>(
      `SELECT removed_at IS NOT NULL AS removed FROM meme_like WHERE meme_id = $1`,
      [meme]
    );
    expect(rows).toEqual([{ removed: true }]);
  });

  it('adds a new row for each like, keeping the old ones', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);

    await setLike(meme, bob, true);
    await setLike(meme, bob, false);
    expect(await setLike(meme, bob, true)).toBe(1);
    expect(await setLike(meme, bob, true)).toBe(1);

    const [{ total, live }] = await db<{ total: number; live: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE removed_at IS NULL)::int AS live
         FROM meme_like WHERE meme_id = $1`,
      [meme]
    );
    expect({ total, live }).toEqual({ total: 2, live: 1 });
    expect((await getMeme(meme, bob))?.hasLiked).toBe(true);
    expect((await getKarmaBreakdown(alice)).post).toBe(1);
  });

  it('ranks top memes and search results by live likes only', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const unliked = await makeMeme(alice, '2026-01-01T00:00:00Z');
    const liked = await makeMeme(alice, '2026-01-02T00:00:00Z');
    const cats = await findOrCreateTag('cats', alice);
    await addTagToMeme(unliked, cats, alice);
    await addTagToMeme(liked, cats, alice);

    await setLike(unliked, bob, true);
    await setLike(unliked, carol, true);
    await setLike(unliked, bob, false);
    await setLike(unliked, carol, false);
    await setLike(liked, bob, true);

    const { memes } = await listTopMemes(undefined, 2);
    expect(memes.map((m) => m.id)).toEqual([liked, unliked]);

    const results = await searchMemes(parseSearch('tag:cats'));
    expect(results.memes.map((m) => m.id)).toEqual([liked, unliked]);

    const { rows } = await listTagRows({ seed: 'x' });
    expect(rows[0].memes.map((m) => m.id)).toEqual([liked, unliked]);
  });

  it('keeps an unsave as a removed row and drops it from the Library', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);

    await setSave(meme, bob, true);
    await setSave(meme, bob, false);
    expect(await countMemes({ savedBy: bob })).toBe(0);
    expect((await getMeme(meme, bob))?.hasSaved).toBe(false);

    await setSave(meme, bob, true);
    expect(await countMemes({ savedBy: bob })).toBe(1);
    const [{ count }] = await db<{ count: number }>(
      `SELECT count(*)::int AS count FROM meme_save WHERE meme_id = $1`,
      [meme]
    );
    expect(count).toBe(2);
  });
});

describe('tags', () => {
  it('keeps a removed tag and its votes, and stops it showing or counting anywhere', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const meme = await makeMeme(carol);
    const other = await makeMeme(carol);
    const cats = await findOrCreateTag('cats', alice);
    await addTagToMeme(meme, cats, alice);
    await addTagToMeme(other, cats, alice);
    await voteOnTag(meme, cats, bob, 1);
    await setTagPreference(bob, cats, 'mute');

    expect(await removeTagFromMeme(meme, cats, alice)).toBe(true);
    expect(await removeTagFromMeme(meme, cats, alice)).toBe(false);

    expect(await listTagsForMeme(meme)).toEqual([]);
    expect(await getTagAdder(meme, cats)).toBeNull();
    expect(await countMemes({ tagName: 'cats' })).toBe(1);
    expect((await searchMemes(parseSearch('tag:cats'))).memes.map((m) => m.id)).toEqual([other]);
    expect((await searchTags('cat'))[0].uses).toBe(1);
    expect((await getProfileStats(alice)).tagsAdded).toBe(1);
    // Curation karma counts the tag still on `other` (alice's +1 is her own and never counts).
    expect((await getKarmaBreakdown(alice)).curation).toBe(0);
    // The mute hides `other` only now.
    const feed = await listMemes({ viewerId: bob, hideMuted: true });
    expect(feed.memes.map((m) => m.id)).toEqual([meme]);

    const [row] = await db<{ removedBy: string; votes: number }>(
      `SELECT mt.removed_by AS "removedBy",
              (SELECT count(*)::int FROM meme_tag_vote v WHERE v.meme_id = mt.meme_id AND v.tag_id = mt.tag_id) AS votes
         FROM meme_tag mt WHERE mt.meme_id = $1 AND mt.tag_id = $2`,
      [meme, cats]
    );
    expect(row).toEqual({ removedBy: alice, votes: 2 });
  });

  it('stops suggesting a tag whose every use was removed, without deleting it', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    const typo = await findOrCreateTag('cta', alice);
    await addTagToMeme(meme, typo, alice);
    await removeTagFromMeme(meme, typo, alice);

    expect(await searchTags('ct')).toEqual([]);
    const tags = await db(`SELECT 1 FROM tag WHERE id = $1`, [typo]);
    expect(tags).toHaveLength(1);
  });

  it('revives a removed tag with its adder and votes, and the re-adder upvotes it', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const meme = await makeMeme(carol);
    const tag = await findOrCreateTag('dogs', alice);
    await addTagToMeme(meme, tag, alice);
    await voteOnTag(meme, tag, carol, -1);
    await removeTagFromMeme(meme, tag, alice);

    expect(await addTagToMeme(meme, tag, bob)).toBe(true);
    const [shown] = await listTagsForMeme(meme, bob);
    expect(shown).toMatchObject({ name: 'dogs', addedBy: alice, score: 1, myVote: 1 });
    // Adding it again while it shows is an upvote, not news.
    expect(await addTagToMeme(meme, tag, bob)).toBe(false);
  });

  it('keeps counting the votes on a removed tag toward its adder\'s trust', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');

    // Ten of bob's tags downvoted, and bob takes every one back before it settles.
    for (let i = 0; i < 10; i++) {
      const meme = await makeMeme(alice);
      const tag = await findOrCreateTag(`junk${i}`, bob);
      await addTagToMeme(meme, tag, bob);
      await voteOnTag(meme, tag, alice, -1);
      await removeTagFromMeme(meme, tag, bob);
    }

    expect(await getTrust(bob)).toMatchObject({ approved: 0, rejected: 10, held: true });
  });

  it('keeps the downvotes when a tag is taken back and added again', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    const tag = await findOrCreateTag('wrong', bob);
    await addTagToMeme(meme, tag, bob);
    await voteOnTag(meme, tag, alice, -1);

    await removeTagFromMeme(meme, tag, bob);
    await addTagToMeme(meme, tag, bob);

    expect(await getTrust(bob)).toMatchObject({ rejected: 1 });
    const [shown] = await listTagsForMeme(meme);
    expect(shown.score).toBe(0);
  });
});

describe('content warnings', () => {
  it('keeps a removed warning with who removed it, and stops showing it', async () => {
    const alice = await makeUser('alice');
    const mod = await makeUser('mod');
    const meme = await makeMeme(alice);
    await addWarnings(meme, ['nsfw', 'spoiler'], alice);

    expect(await removeWarning(meme, 'nsfw', mod)).toBe(true);
    expect(await removeWarning(meme, 'nsfw', mod)).toBe(false);

    expect((await getMeme(meme))?.warnings).toEqual(['spoiler']);
    expect((await listWarningsForMeme(meme)).map((w) => w.warning)).toEqual(['spoiler']);
    expect(await getWarningAdder(meme, 'nsfw')).toBeUndefined();

    const [row] = await db<{ removedBy: string }>(
      `SELECT removed_by AS "removedBy" FROM meme_content_warning WHERE meme_id = $1 AND warning = 'nsfw'`,
      [meme]
    );
    expect(row.removedBy).toBe(mod);
  });

  it('adds a removed warning back as a new row', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    await addWarnings(meme, ['nsfw'], alice);
    await removeWarning(meme, 'nsfw', alice);
    await addWarnings(meme, ['nsfw'], bob);
    await addWarnings(meme, ['nsfw'], alice);

    expect((await getMeme(meme))?.warnings).toEqual(['nsfw']);
    expect(await getWarningAdder(meme, 'nsfw')).toBe(bob);
    const rows = await db(`SELECT 1 FROM meme_content_warning WHERE meme_id = $1`, [meme]);
    expect(rows).toHaveLength(2);
  });
});

describe('vote and review history', () => {
  it('records every new tag vote and every flip, and not a repeat', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    const tag = await findOrCreateTag('cats', alice);
    await addTagToMeme(meme, tag, alice);

    await voteOnTag(meme, tag, bob, 1);
    await voteOnTag(meme, tag, bob, 1);
    await voteOnTag(meme, tag, bob, -1);
    await voteOnTag(meme, tag, bob, 1);
    // Adding it again as its adder re-sends the same +1.
    await addTagToMeme(meme, tag, alice);

    const rows = await db<{ voter: string; vote: number }>(
      `SELECT u.username AS voter, h.vote
         FROM tag_vote_history h
         JOIN app_user u ON u.id = h.voter_id
        WHERE h.meme_id = $1 AND h.tag_id = $2
        ORDER BY h.id`,
      [meme, tag]
    );
    expect(rows).toEqual([
      { voter: 'alice', vote: 1 },
      { voter: 'bob', vote: 1 },
      { voter: 'bob', vote: -1 },
      { voter: 'bob', vote: 1 },
    ]);
  });

  it('records every transcription review and every change of mind', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    const version = await addTranscription(meme, 'hello', alice);

    await reviewTranscription(version.id, bob, 1);
    await reviewTranscription(version.id, bob, -1);
    await reviewTranscription(version.id, bob, -1);

    const rows = await db<{ verdict: number }>(
      `SELECT verdict FROM transcription_review_history WHERE transcription_id = $1 ORDER BY id`,
      [version.id]
    );
    expect(rows.map((r) => r.verdict)).toEqual([1, -1]);
    // The current state is still one row.
    const current = await db(`SELECT 1 FROM transcription_review WHERE transcription_id = $1`, [version.id]);
    expect(current).toHaveLength(1);
  });
});

describe('meme deletion', () => {
  it('records who deleted a meme and why, once', async () => {
    const alice = await makeUser('alice');
    const mod = await makeUser('mod');
    const meme = await makeMeme(alice);

    expect(await softDeleteMeme(meme, { deletedBy: mod, reason: 'Spam' })).toBe(true);
    expect(await softDeleteMeme(meme, { deletedBy: alice })).toBe(false);

    const [row] = await db<{ deletedBy: string; reason: string }>(
      `SELECT deleted_by AS "deletedBy", delete_reason AS reason FROM meme WHERE id = $1`,
      [meme]
    );
    expect(row).toEqual({ deletedBy: mod, reason: 'Spam' });
  });
});
