import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { setLike } from '@/db/queries/likes';
import { softDeleteMeme } from '@/db/queries/memes';
import { formatSearch, parseSearch, searchMemes } from '@/db/queries/search';
import { addTagToMeme, findOrCreateTag, voteOnTag } from '@/db/queries/tags';
import {
  addTranscription,
  CURRENT_TRANSCRIPTIONS,
  getCurrentTranscription,
  reviewTranscription,
} from '@/db/queries/transcriptions';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

beforeEach(resetDatabase);

async function search(raw: string, viewerId?: string) {
  return searchMemes(parseSearch(raw), { viewerId });
}

async function ids(raw: string) {
  return (await search(raw)).memes.map((m) => m.id);
}

async function tag(memeId: string, name: string, userId: string) {
  const tagId = await findOrCreateTag(name, userId);
  await addTagToMeme(memeId, tagId, userId);
  return tagId;
}

describe('parseSearch', () => {
  it('splits words, drops punctuation and apostrophes, and lowercases', () => {
    expect(parseSearch('  Don’t   PANIC!!  it\'s fine... ')).toEqual({
      text: 'Don’t PANIC!! it\'s fine...',
      words: ['dont', 'panic', 'its', 'fine'],
      tags: [],
    });
  });

  it('takes tag: filters out of the text, quoted or not, once each', () => {
    expect(parseSearch('tag:cats sleeping tag:"dog pile" tag:Cats')).toEqual({
      text: 'sleeping',
      words: ['sleeping'],
      tags: ['cats', 'dog pile'],
    });
  });

  it('round-trips through formatSearch', () => {
    const query = parseSearch('tag:"dog pile" tag:cats sleeping on keyboard');
    expect(parseSearch(formatSearch(query))).toEqual(query);
  });
});

describe('searchMemes', () => {
  it('finds a meme from part of its text, half-typed words, other word forms and typos', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    const other = await makeMeme(alice);
    await addTranscription(meme, 'My disappointment is immeasurable, and my day is ruined.', alice);
    await addTranscription(other, 'One does not simply walk into Mordor', alice);

    expect(await ids('my disappointment is immeasurable')).toEqual([meme]);
    expect(await ids('DISAPPOINTMENT!!!')).toEqual([meme]);
    expect(await ids('ruined immeasurable')).toEqual([meme]);
    expect(await ids('disappointm')).toEqual([meme]);
    expect(await ids('immeas')).toEqual([meme]);
    expect(await ids('disappointed')).toEqual([meme]);
    expect(await ids('my dissapointment is imeasurable')).toEqual([meme]);
    expect(await ids('walk into mordor')).toEqual([other]);
    expect(await ids('zebra')).toEqual([]);
  });

  it('needs every word, so an extra word that is nowhere does not match', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    await addTranscription(meme, 'this is fine', alice);

    expect(await ids('this is fine')).toEqual([meme]);
    expect(await ids('fine giraffe')).toEqual([]);
  });

  it('treats apostrophes as part of the word', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    await addTranscription(meme, 'Don’t worry, it\'s fine', alice);

    expect(await ids('dont worry')).toEqual([meme]);
    expect(await ids("don't worry")).toEqual([meme]);
  });

  it('marks the matched words in the snippet', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    await addTranscription(meme, 'My disappointment is immeasurable', alice);

    const [result] = (await search('immeasurable')).memes;
    expect(result.snippet).toBe('My disappointment is \u0001immeasurable\u0002');
  });

  it('matches tag names, and ranks an exact tag above the word in the text', async () => {
    const alice = await makeUser('alice');
    const mentioned = await makeMeme(alice);
    const tagged = await makeMeme(alice);
    await addTranscription(mentioned, 'I am not a cat person', alice);
    await tag(tagged, 'cat', alice);
    // Likes would put it first if relevance did not come before them.
    await setLike(mentioned, alice, true);

    expect(await ids('cat')).toEqual([tagged, mentioned]);
  });

  it('reads a hyphenated tag as its words for the exact match', async () => {
    const alice = await makeUser('alice');
    const tagged = await makeMeme(alice);
    const mentioned = await makeMeme(alice);
    await tag(tagged, 'surprised-pikachu', alice);
    await addTranscription(mentioned, 'surprised pikachu face', alice);
    await setLike(mentioned, alice, true);

    expect(await ids('surprised pikachu')).toEqual([tagged, mentioned]);
  });

  it('matches words across tags and text together', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    await tag(meme, 'cat', alice);
    await addTranscription(meme, 'when you sit on the keyboard', alice);

    expect(await ids('cat keyboard')).toEqual([meme]);
  });

  it('ignores a tag voted down to zero', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    const tagId = await tag(meme, 'cat', alice);
    await voteOnTag(meme, tagId, bob, -1);

    expect(await ids('cat')).toEqual([]);
  });

  it('filters by tag: and searches within it', async () => {
    const alice = await makeUser('alice');
    const catMeme = await makeMeme(alice);
    const dogMeme = await makeMeme(alice);
    await tag(catMeme, 'cats', alice);
    await tag(dogMeme, 'dogs', alice);
    await addTranscription(catMeme, 'monday again', alice);
    await addTranscription(dogMeme, 'monday again', alice);

    expect(await ids('monday')).toHaveLength(2);
    expect(await ids('monday tag:cats')).toEqual([catMeme]);
    expect(await ids('tag:dogs')).toEqual([dogMeme]);
    expect(await ids('tag:dogs tag:cats')).toEqual([]);
  });

  it('breaks ties by likes, then newest', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const older = await makeMeme(alice, '2026-01-01T00:00:00Z');
    const newer = await makeMeme(alice, '2026-02-01T00:00:00Z');
    const liked = await makeMeme(alice, '2025-01-01T00:00:00Z');
    for (const meme of [older, newer, liked]) {
      await addTranscription(meme, 'stonks', alice);
    }
    await setLike(liked, bob, true);

    expect(await ids('stonks')).toEqual([liked, newer, older]);
  });

  it('never returns a deleted meme', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    await addTranscription(meme, 'stonks', alice);
    await tag(meme, 'stonks', alice);
    await softDeleteMeme(meme);

    expect(await ids('stonks')).toEqual([]);
    expect(await ids('tag:stonks')).toEqual([]);
  });

  it('searches only the current version of the text', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const meme = await makeMeme(alice);
    await addTranscription(meme, 'stonks', alice);
    const edit = await addTranscription(meme, 'not stinks', bob);

    expect(await ids('stonks')).toEqual([]);
    expect(await ids('stinks')).toEqual([meme]);

    // Rejected: the edit no longer stands and the version before it is current again.
    await reviewTranscription(edit.id, alice, -1);
    await reviewTranscription(edit.id, carol, -1);
    expect(await ids('stinks')).toEqual([]);
    expect(await ids('stonks')).toEqual([meme]);
  });

  it('ignores a held user edit until someone confirms it', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    await db(`UPDATE app_user SET trust_override = 'held' WHERE id = $1`, [bob]);
    const edit = await addTranscription(meme, 'stinks', bob);

    expect(await ids('stinks')).toEqual([]);
    await reviewTranscription(edit.id, alice, 1);
    expect(await ids('stinks')).toEqual([meme]);
  });

  it('treats empty text as no text', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    await addTranscription(meme, '', alice);
    await tag(meme, 'cat', alice);

    const [result] = (await search('cat')).memes;
    expect(result.id).toBe(meme);
    expect(result.snippet).toBeNull();
  });

  it('pages, with the total of every match', async () => {
    const alice = await makeUser('alice');
    for (let i = 0; i < 5; i++) {
      await addTranscription(await makeMeme(alice), 'stonks', alice);
    }
    const query = parseSearch('stonks');

    const first = await searchMemes(query, { limit: 2 });
    expect(first.total).toBe(5);
    expect(first.memes).toHaveLength(2);
    expect(first.nextPage).toBe(1);

    const last = await searchMemes(query, { limit: 2, page: 2 });
    expect(last.memes).toHaveLength(1);
    expect(last.nextPage).toBeNull();
    const all = [...first.memes, ...(await searchMemes(query, { limit: 2, page: 1 })).memes, ...last.memes];
    expect(new Set(all.map((m) => m.id)).size).toBe(5);
  });

  it('returns nothing for an empty or punctuation-only query', async () => {
    const alice = await makeUser('alice');
    await addTranscription(await makeMeme(alice), 'stonks', alice);

    expect(await ids('')).toEqual([]);
    expect(await ids('?!...')).toEqual([]);
  });

  it('reports hasLiked for the viewer', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    await addTranscription(meme, 'stonks', alice);
    await setLike(meme, alice, true);

    expect((await search('stonks', alice)).memes[0].hasLiked).toBe(true);
    expect((await search('stonks')).memes[0].hasLiked).toBe(false);
  });
});

describe('CURRENT_TRANSCRIPTIONS', () => {
  it('agrees with getCurrentTranscription', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    await db(`UPDATE app_user SET trust_override = 'held' WHERE id = $1`, [carol]);

    const plain = await makeMeme(alice);
    await addTranscription(plain, 'first', alice);
    await addTranscription(plain, 'second', bob);

    const rejected = await makeMeme(alice);
    await addTranscription(rejected, 'kept', alice);
    const bad = await addTranscription(rejected, 'rejected', bob);
    await reviewTranscription(bad.id, alice, -1);

    const heldEdit = await makeMeme(alice);
    await addTranscription(heldEdit, 'before', alice);
    await addTranscription(heldEdit, 'held', carol);

    const heldOnly = await makeMeme(alice);
    await addTranscription(heldOnly, 'held', carol);

    const untouched = await makeMeme(alice);

    const rows = await db<{ meme_id: string; text: string }>(CURRENT_TRANSCRIPTIONS);
    const viaView = new Map(rows.map((r) => [r.meme_id, r.text]));
    for (const meme of [plain, rejected, heldEdit, heldOnly, untouched]) {
      expect(viaView.get(meme) ?? null).toBe((await getCurrentTranscription(meme))?.text ?? null);
    }
    expect(viaView.get(plain)).toBe('second');
    expect(viaView.get(rejected)).toBe('kept');
    expect(viaView.get(heldEdit)).toBe('before');
    expect(viaView.has(heldOnly)).toBe(false);
  });
});
