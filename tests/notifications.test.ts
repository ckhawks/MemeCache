import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import {
  countUnreadNotifications,
  listNotifications,
  markNotificationsRead,
  notify,
  notifyIfTagConfirmed,
} from '@/db/queries/notifications';
import { setLike } from '@/db/queries/likes';
import { addTagToMeme, findOrCreateTag, removeTagFromMeme, voteOnTag } from '@/db/queries/tags';
import { addTranscription, reviewTranscription } from '@/db/queries/transcriptions';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

beforeEach(resetDatabase);

// What the like route does.
async function like(memeId: string, uploaderId: string, userId: string, liked = true) {
  await setLike(memeId, userId, liked);
  if (liked) {
    await notify({
      recipientId: uploaderId,
      kind: 'like',
      actorId: userId,
      memeId,
    });
  }
}

async function rowCount(userId: string): Promise<number> {
  const [row] = await db<{ count: number }>(
    `SELECT count(*)::int AS count FROM notification WHERE user_id = $1`,
    [userId]
  );
  return row.count;
}

describe('creating', () => {
  it('tells the uploader about a like, and nobody about their own', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);

    await like(meme, alice, alice);
    expect(await rowCount(alice)).toBe(0);

    await like(meme, alice, bob);
    const [group] = await listNotifications(alice);
    expect(group.kind).toBe('like');
    expect(group.memeId).toBe(meme);
    expect(group.unread).toBe(true);
    expect(group.actors.map((a) => a.username)).toEqual(['bob']);
    expect(await rowCount(bob)).toBe(0);
  });

  it('tells the adder once when a tag is confirmed, whoever tips it', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const dave = await makeUser('dave');
    const meme = await makeMeme(dave);
    const tag = await findOrCreateTag('cats', alice);
    await addTagToMeme(meme, tag, alice);

    await voteOnTag(meme, tag, bob, 1);
    await notifyIfTagConfirmed(meme, tag, bob);
    expect(await rowCount(alice)).toBe(0);

    await voteOnTag(meme, tag, carol, 1);
    await notifyIfTagConfirmed(meme, tag, carol);
    await voteOnTag(meme, tag, dave, 1);
    await notifyIfTagConfirmed(meme, tag, dave);

    const groups = await listNotifications(alice);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('tag_confirmed');
    expect(groups[0].tagNames).toEqual(['cats']);
  });

  it('keeps the tag name after removing the tag deletes it', async () => {
    const alice = await makeUser('alice');
    const mod = await makeUser('mod');
    const meme = await makeMeme(alice);
    const tag = await findOrCreateTag('typo', alice);
    await addTagToMeme(meme, tag, alice);

    // The route writes the notification first, then removes.
    await notify({
      recipientId: alice,
      kind: 'tag_removed',
      actorId: mod,
      memeId: meme,
      tagId: tag,
    });
    await removeTagFromMeme(meme, tag);

    const [group] = await listNotifications(alice);
    expect(group.kind).toBe('tag_removed');
    expect(group.tagNames).toEqual(['typo']);
  });

  it('tells a fixed version author it was fixed, and the uploader it was transcribed', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const meme = await makeMeme(carol);
    const first = await addTranscription(meme, 'helo', alice);
    const fix = await addTranscription(meme, 'hello', bob);

    // What the transcription route does for a fix.
    await reviewTranscription(first.id, bob, -1);
    await notify({
      recipientId: alice,
      kind: 'transcription_fixed',
      actorId: bob,
      memeId: meme,
      transcriptionId: first.id,
    });
    await notify({
      recipientId: carol,
      kind: 'meme_transcribed',
      actorId: bob,
      memeId: meme,
      transcriptionId: fix.id,
    });

    expect((await listNotifications(alice)).map((g) => g.kind)).toEqual(['transcription_fixed']);
    expect((await listNotifications(carol)).map((g) => g.kind)).toEqual(['meme_transcribed']);
  });
});

describe('deduplicating', () => {
  it('writes one like notification however often someone toggles it', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);

    await like(meme, alice, bob);
    await like(meme, alice, bob, false);
    await like(meme, alice, bob);
    await like(meme, alice, bob, false);
    await like(meme, alice, bob);

    expect(await rowCount(alice)).toBe(1);
  });

  it('writes one review notification per reviewer per verdict', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    const version = await addTranscription(meme, 'text', alice);

    for (const kind of ['transcription_confirmed', 'transcription_confirmed'] as const) {
      await notify({
        recipientId: alice,
        kind,
        actorId: bob,
        memeId: meme,
        transcriptionId: version.id,
      });
    }
    expect(await rowCount(alice)).toBe(1);

    // Changing their mind is new news, and the old row stays.
    await notify({
      recipientId: alice,
      kind: 'transcription_rejected',
      actorId: bob,
      memeId: meme,
      transcriptionId: version.id,
    });
    expect(await rowCount(alice)).toBe(2);
  });
});

describe('grouping', () => {
  it('reads many likes on one meme as one line, newest people first', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    const other = await makeMeme(alice);
    for (const name of ['bob', 'carol', 'dave', 'erin']) {
      await like(meme, alice, await makeUser(name));
    }
    await like(other, alice, await makeUser('frank'));

    const groups = await listNotifications(alice);
    expect(groups).toHaveLength(2);
    expect(groups[0].memeId).toBe(other);
    expect(groups[1].memeId).toBe(meme);
    expect(groups[1].actorCount).toBe(4);
    expect(groups[1].actors.map((a) => a.username)).toEqual(['erin', 'dave']);
  });

  it('names someone once when they added two tags to a meme', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const meme = await makeMeme(alice);
    for (const [user, name] of [
      [bob, 'cat'],
      [carol, 'loaf'],
      [bob, 'dog'],
    ]) {
      const tag = await findOrCreateTag(name, user);
      await addTagToMeme(meme, tag, user);
      await notify({
        recipientId: alice,
        kind: 'meme_tagged',
        actorId: user,
        memeId: meme,
        tagId: tag,
      });
    }

    const groups = await listNotifications(alice);
    expect(groups).toHaveLength(1);
    expect(groups[0].actorCount).toBe(2);
    expect(groups[0].actors.map((a) => a.username)).toEqual(['bob', 'carol']);
    expect([...groups[0].tagNames].sort()).toEqual(['cat', 'dog', 'loaf']);
  });

  it('keeps confirms and rejects of the same version apart', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const meme = await makeMeme(bob);
    const version = await addTranscription(meme, 'text', alice);
    for (const [actor, kind] of [
      [bob, 'transcription_confirmed'],
      [carol, 'transcription_rejected'],
    ] as const) {
      await notify({
        recipientId: alice,
        kind,
        actorId: actor,
        memeId: meme,
        transcriptionId: version.id,
      });
    }

    const kinds = (await listNotifications(alice)).map((g) => g.kind).sort();
    expect(kinds).toEqual(['transcription_confirmed', 'transcription_rejected']);
  });

  it('leaves out memes that were deleted', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    await like(meme, alice, bob);
    await db(`UPDATE meme SET deleted_at = now() WHERE id = $1`, [meme]);

    expect(await listNotifications(alice)).toEqual([]);
    expect(await countUnreadNotifications(alice)).toBe(0);
  });
});

describe('marking read', () => {
  it('counts unread groups, not rows', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    const other = await makeMeme(alice);
    await like(meme, alice, await makeUser('bob'));
    await like(meme, alice, await makeUser('carol'));
    await like(other, alice, await makeUser('dave'));

    expect(await countUnreadNotifications(alice)).toBe(2);
  });

  it('marks up to what was shown, leaving anything newer unread', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    const other = await makeMeme(alice);
    await like(meme, alice, bob);
    const shown = await listNotifications(alice);

    // Arrives while the list is open.
    await like(other, alice, bob);
    await markNotificationsRead(alice, shown[0].id);

    expect(await countUnreadNotifications(alice)).toBe(1);
    const groups = await listNotifications(alice);
    expect(groups.find((g) => g.memeId === meme)?.unread).toBe(false);
    expect(groups.find((g) => g.memeId === other)?.unread).toBe(true);

    await markNotificationsRead(alice);
    expect(await countUnreadNotifications(alice)).toBe(0);
  });

  it('shows a group as unread again when someone new joins it', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    await like(meme, alice, await makeUser('bob'));
    await markNotificationsRead(alice);
    await like(meme, alice, await makeUser('carol'));

    const [group] = await listNotifications(alice);
    expect(group.unread).toBe(true);
    expect(group.actorCount).toBe(2);
    expect(await countUnreadNotifications(alice)).toBe(1);
  });
});
