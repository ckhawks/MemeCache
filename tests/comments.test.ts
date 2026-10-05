import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import {
  addComment,
  deleteComment,
  editComment,
  getComment,
  getMemeRef,
  isCommentEditable,
  listComments,
  searchMemeRefs,
} from '@/db/queries/comments';
import { getMeme, listMemes, softDeleteMeme } from '@/db/queries/memes';
import { countUnreadNotifications, listNotifications, notify } from '@/db/queries/notifications';
import { addWarnings } from '@/db/queries/warnings';
import { addTranscription } from '@/db/queries/transcriptions';
import { parseMemeLink } from '@/util/memeLink';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

beforeEach(resetDatabase);

async function slugOf(memeId: string): Promise<string> {
  return (await getMeme(memeId))!.slug;
}

// Moves a comment's posting time into the past, past the edit window.
async function age(commentId: string, minutes: number) {
  await db(`UPDATE meme_comment SET created_at = now() - make_interval(mins => $2) WHERE id = $1`, [
    commentId,
    minutes,
  ]);
}

// What the comment route does after adding one.
async function comment(memeId: string, uploaderId: string, authorId: string, body: string, ref?: string) {
  const added = await addComment({
    memeId,
    authorId,
    body,
    refMemeId: ref ?? null,
  });
  await notify({
    recipientId: uploaderId,
    kind: 'comment',
    actorId: authorId,
    memeId,
    commentId: added.id,
  });
  return added;
}

describe('adding and listing', () => {
  it('lists comments oldest first with their author', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);

    await addComment({ memeId: meme, authorId: bob, body: 'first', refMemeId: null });
    await addComment({ memeId: meme, authorId: alice, body: 'second', refMemeId: null });

    const comments = await listComments(meme);
    expect(comments.map((c) => c.body)).toEqual(['first', 'second']);
    expect(comments[0].username).toBe('bob');
    expect(comments[0].authorId).toBe(bob);
    expect(comments[0].karma).toBe(0);
    expect(comments[0].editedAt).toBeNull();
    expect(comments[0].deleted).toBeNull();
    expect(comments[0].ref).toBeNull();
  });

  it('carries the meme replied with, and its content warnings', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    const reply = await makeMeme(bob);
    await addWarnings(reply, ['spoiler', 'nsfw'], bob);

    const added = await addComment({ memeId: meme, authorId: bob, body: '', refMemeId: reply });

    expect(added.body).toBe('');
    expect(added.ref).toEqual({
      id: reply,
      slug: await slugOf(reply),
      contentType: 'image/png',
      username: 'bob',
      warnings: ['nsfw', 'spoiler'],
    });
    expect(added.refGone).toBe(false);
  });

  it('says so when the meme replied with was deleted', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    const reply = await makeMeme(alice);
    const added = await addComment({ memeId: meme, authorId: alice, body: 'look', refMemeId: reply });

    await softDeleteMeme(reply);

    const [listed] = await listComments(meme);
    expect(listed.id).toBe(added.id);
    expect(listed.ref).toBeNull();
    expect(listed.refGone).toBe(true);
  });

  it('keeps comments to their own meme', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    const other = await makeMeme(alice);
    await addComment({ memeId: other, authorId: alice, body: 'elsewhere', refMemeId: null });

    expect(await listComments(meme)).toEqual([]);
    expect(await listComments('not-a-uuid')).toEqual([]);
    expect(await getComment('not-a-number')).toBeNull();
  });
});

describe('editing', () => {
  it('lets the author edit, marking it edited only when something changed', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    const reply = await makeMeme(alice);
    const added = await addComment({ memeId: meme, authorId: alice, body: 'helo', refMemeId: null });

    expect(await editComment(added.id, alice, 'helo', null)).toBe(true);
    expect((await getComment(added.id))!.editedAt).toBeNull();

    expect(await editComment(added.id, alice, 'hello', reply)).toBe(true);
    const edited = (await getComment(added.id))!;
    expect(edited.body).toBe('hello');
    expect(edited.ref?.id).toBe(reply);
    expect(edited.editedAt).not.toBeNull();
  });

  it('refuses someone else, a deleted comment, and an old one', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    const added = await addComment({ memeId: meme, authorId: alice, body: 'mine', refMemeId: null });

    expect(await editComment(added.id, bob, 'theirs', null)).toBe(false);

    expect(await isCommentEditable(added.id)).toBe(true);
    await age(added.id, 11);
    expect(await isCommentEditable(added.id)).toBe(false);
    expect(await editComment(added.id, alice, 'too late', null)).toBe(false);

    const fresh = await addComment({ memeId: meme, authorId: alice, body: 'gone', refMemeId: null });
    await deleteComment(fresh.id, alice);
    expect(await isCommentEditable(fresh.id)).toBe(false);
    expect(await editComment(fresh.id, alice, 'back', null)).toBe(false);

    expect((await listComments(meme)).map((c) => c.body)).toEqual(['mine', '']);
  });
});

describe('deleting', () => {
  it('keeps the row but leaves out its text and meme, and says who deleted it', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const mod = await makeUser('mod');
    const meme = await makeMeme(alice);
    const reply = await makeMeme(bob);
    const own = await addComment({ memeId: meme, authorId: bob, body: 'oops', refMemeId: reply });
    const rude = await addComment({ memeId: meme, authorId: bob, body: 'rude', refMemeId: null });

    await deleteComment(own.id, bob);
    await deleteComment(rude.id, mod);
    // A second delete keeps the first.
    await deleteComment(own.id, mod);

    const [first, second] = await listComments(meme);
    expect(first).toMatchObject({ id: own.id, body: '', ref: null, refGone: false, deleted: 'author' });
    expect(second).toMatchObject({ id: rude.id, body: '', deleted: 'moderator' });

    const [row] = await db<{ body: string }>(`SELECT body FROM meme_comment WHERE id = $1`, [own.id]);
    expect(row.body).toBe('oops');
  });
});

describe('feed cards', () => {
  it('count the comments still standing', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    await addComment({ memeId: meme, authorId: alice, body: 'one', refMemeId: null });
    const two = await addComment({ memeId: meme, authorId: alice, body: 'two', refMemeId: null });
    await addComment({ memeId: meme, authorId: alice, body: 'three', refMemeId: null });
    await deleteComment(two.id, alice);

    const { memes } = await listMemes({});
    expect(memes[0].commentCount).toBe(2);
  });
});

describe('attaching a meme', () => {
  it('finds a live meme by slug or id', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    const slug = await slugOf(meme);

    expect((await getMemeRef(slug))?.id).toBe(meme);
    expect((await getMemeRef(meme))?.uploaderId).toBe(alice);
    expect(await getMemeRef('nonsense')).toBeNull();

    await softDeleteMeme(meme);
    expect(await getMemeRef(slug)).toBeNull();
  });

  it('offers search results as thumbnails', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    await makeMeme(alice);
    await addTranscription(meme, 'my disappointment is immeasurable', alice);

    const refs = await searchMemeRefs('disappointment');
    expect(refs.map((r) => r.id)).toEqual([meme]);
    expect(refs[0]).toMatchObject({ username: 'alice', warnings: [] });
  });

  it('reads meme links but not bare words', () => {
    expect(parseMemeLink('https://memecache.me/meme/Xm7Kq2N')).toBe('Xm7Kq2N');
    expect(parseMemeLink('  http://localhost:3000/meme/Xm7Kq2N/?ref=send#top ')).toBe('Xm7Kq2N');
    expect(parseMemeLink('/meme/Xm7Kq2N')).toBe('Xm7Kq2N');
    expect(parseMemeLink('Xm7Kq2N')).toBeNull();
    expect(parseMemeLink('look at /meme/Xm7Kq2N')).toBeNull();
    expect(parseMemeLink('https://memecache.me/meme/0000000')).toBeNull();
    expect(parseMemeLink('https://memecache.me/t/cats')).toBeNull();
  });
});

describe('notifications', () => {
  it('tells the uploader about each comment, grouped per meme, and nobody about their own', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const meme = await makeMeme(alice);

    await comment(meme, alice, alice, 'my own');
    await comment(meme, alice, bob, 'nice');
    await comment(meme, alice, bob, 'really nice');
    await comment(meme, alice, carol, 'agreed');

    const [row] = await db<{ count: number }>(
      `SELECT count(*)::int AS count FROM notification WHERE user_id = $1`,
      [alice]
    );
    expect(row.count).toBe(3);
    const groups = await listNotifications(alice);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('comment');
    expect(groups[0].actorCount).toBe(2);
    expect(groups[0].actors.map((a) => a.username)).toEqual(['carol', 'bob']);
  });

  it('writes one meme_quoted per comment, however often it is edited', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const meme = await makeMeme(alice);
    const reply = await makeMeme(carol);
    const added = await comment(meme, alice, bob, '', reply);

    for (let i = 0; i < 2; i++) {
      await notify({
        recipientId: carol,
        kind: 'meme_quoted',
        actorId: bob,
        memeId: meme,
        commentId: added.id,
      });
    }

    const groups = await listNotifications(carol);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: 'meme_quoted', memeId: meme, actorCount: 1 });
  });

  it('drops notifications about a comment once it is deleted', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    const added = await comment(meme, alice, bob, 'spam');
    expect(await countUnreadNotifications(alice)).toBe(1);

    await deleteComment(added.id, bob);

    expect(await listNotifications(alice)).toEqual([]);
    expect(await countUnreadNotifications(alice)).toBe(0);
  });
});
