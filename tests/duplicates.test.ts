import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import {
  answerMatch,
  countAdminPairs,
  getMatchPair,
  listAdminPairs,
  nextDuplicatePair,
  skipMatch,
} from '@/db/queries/duplicates';
import { listMatchedMemes, saveMatches } from '@/db/queries/mediaHash';
import { countQueue } from '@/db/queries/queue';
import { mergeMemes } from '@/db/queries/merge';
import { addTagToMeme, findOrCreateTag, voteOnTag } from '@/db/queries/tags';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

beforeEach(resetDatabase);

let alice: string;
let bob: string;
let carol: string;
let dave: string;
let erin: string;
let older: string;
let newer: string;

beforeEach(async () => {
  alice = await makeUser('alice');
  bob = await makeUser('bob');
  carol = await makeUser('carol');
  dave = await makeUser('dave');
  erin = await makeUser('erin');
  older = await makeMeme(alice, '2026-01-01T00:00:00Z');
  newer = await makeMeme(bob, '2026-02-01T00:00:00Z');
  await saveMatches([{ memeId: newer, otherId: older, kind: 'duplicate', score: 0.95 }]);
});

// Ten tags by `user`, each downvoted by `voter`: held (migration 005).
async function makeHeld(user: string, voter: string) {
  for (let i = 0; i < 10; i++) {
    const meme = await makeMeme(voter);
    const tag = await findOrCreateTag(`junk${i}`, user);
    await addTagToMeme(meme, tag, user);
    await voteOnTag(meme, tag, voter, -1);
  }
}

async function settled() {
  return (await listAdminPairs('settled')).map((p) => p.verdict);
}

describe('the duplicates queue', () => {
  it('offers a stored pair to everyone but its uploaders, older meme first', async () => {
    const pair = await nextDuplicatePair(carol);
    expect(pair?.memes.map((m) => m.id)).toEqual([older, newer]);
    expect(pair?.kind).toBe('duplicate');
    expect(await nextDuplicatePair(alice)).toBeNull();
    expect(await nextDuplicatePair(bob)).toBeNull();
  });

  // One countQueue per test: its transcription and tag counts are slow on a fresh database,
  // where Postgres JIT-compiles them.
  it("counts the pair on the queue's tab for someone who can answer it", async () => {
    expect((await countQueue(carol)).duplicate).toBe(1);
  });

  it("does not count it for one of its uploaders", async () => {
    expect((await countQueue(alice)).duplicate).toBe(0);
  });

  it('stops offering a pair someone answered or skipped', async () => {
    await answerMatch(older, newer, carol, 'same_template');
    expect(await nextDuplicatePair(carol)).toBeNull();
    await skipMatch(dave, newer, older);
    expect(await nextDuplicatePair(dave)).toBeNull();
    expect(await nextDuplicatePair(erin)).not.toBeNull();
  });

  it('settles on two agreeing answers, which then leave the queue for everyone', async () => {
    await answerMatch(older, newer, carol, 'same_meme');
    expect(await settled()).toEqual([]);
    await answerMatch(newer, older, dave, 'same_meme');
    expect(await settled()).toEqual(['same_meme']);
    expect(await nextDuplicatePair(erin)).toBeNull();
    expect(await countAdminPairs()).toEqual({ settled: 1, open: 0 });
  });

  it('needs a clear lead: two against two is not settled', async () => {
    await answerMatch(older, newer, carol, 'same_meme');
    await answerMatch(older, newer, dave, 'same_meme');
    await answerMatch(older, newer, erin, 'different');
    const frank = await makeUser('frank');
    await answerMatch(older, newer, frank, 'different');
    expect(await settled()).toEqual([]);
    expect((await listAdminPairs('open'))[0].tally).toEqual({ same_meme: 2, same_template: 0, different: 2 });
  });

  it("does not count the uploaders' or held users' answers", async () => {
    // Uploaders cannot answer through the route; rows written anyway do not count.
    await answerMatch(older, newer, alice, 'same_meme');
    await answerMatch(older, newer, carol, 'same_meme');
    expect(await settled()).toEqual([]);

    await makeHeld(dave, erin);
    await answerMatch(older, newer, dave, 'same_meme');
    expect(await settled()).toEqual([]);
    await answerMatch(older, newer, erin, 'same_meme');
    expect(await settled()).toEqual(['same_meme']);
  });

  it('lets a moderator settle a pair alone, over what the queue said', async () => {
    await answerMatch(older, newer, carol, 'same_meme');
    await answerMatch(older, newer, dave, 'same_meme');
    await answerMatch(older, newer, erin, 'different', true);
    expect(await settled()).toEqual([]);
    expect(await countAdminPairs()).toEqual({ settled: 0, open: 0 });
    expect(await listMatchedMemes(older)).toEqual([]);
  });

  it('keeps every answer and every change in the history', async () => {
    await answerMatch(older, newer, carol, 'same_meme');
    await answerMatch(older, newer, carol, 'same_meme');
    await answerMatch(older, newer, carol, 'different');
    const rows = await db<{ answer: string }>(
      `SELECT answer FROM meme_match_answer_history ORDER BY id`
    );
    expect(rows.map((r) => r.answer)).toEqual(['same_meme', 'different']);
  });
});

describe('the Same template strip', () => {
  it('shows settled templates as templates, and leaves out pairs settled as different', async () => {
    expect((await listMatchedMemes(older)).map((m) => m.matchKind)).toEqual(['duplicate']);
    await answerMatch(older, newer, carol, 'same_template');
    await answerMatch(older, newer, dave, 'same_template');
    expect((await listMatchedMemes(older)).map((m) => m.matchKind)).toEqual(['template']);
    await answerMatch(older, newer, erin, 'different', true);
    expect(await listMatchedMemes(newer)).toEqual([]);
  });
});

describe('getMatchPair', () => {
  it('finds a stored pair either way round, and nothing once a meme is merged away', async () => {
    expect(await getMatchPair(newer, older)).toMatchObject({
      memeId: older < newer ? older : newer,
      uploaderIds: expect.arrayContaining([alice, bob]),
    });
    const unrelated = await makeMeme(carol);
    expect(await getMatchPair(older, unrelated)).toBeNull();

    await mergeMemes(newer, older, carol);
    expect(await getMatchPair(older, newer)).toBeNull();
    expect(await countAdminPairs()).toEqual({ settled: 0, open: 0 });
  });
});
