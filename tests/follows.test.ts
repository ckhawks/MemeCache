import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { anonymiseUser } from '@/db/queries/accounts';
import {
  followsAnyone,
  getFollowCounts,
  isFollowing,
  setFollow,
} from '@/db/queries/follows';
import { listForYou } from '@/db/queries/memes';
import { countUnreadNotifications, listNotifications } from '@/db/queries/notifications';
import { setTagPreference } from '@/db/queries/tagPreferences';
import { addTagToMeme, findOrCreateTag } from '@/db/queries/tags';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

// The route reads the session through Next; a plain stand-in here lets it be called directly.
const session = vi.hoisted(() => ({
  user: undefined as { id: string } | undefined,
}));

vi.mock('@/auth/lib', () => ({
  getUserFromAccessToken: async () => session.user,
}));

const { POST } = await import('@/app/api/users/[userId]/follow/route');

async function postFollow(userId: string, body: unknown) {
  const response = await POST(
    new Request(`http://localhost/api/users/${userId}/follow`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ userId }) }
  );
  return { status: response.status, ...((await response.json()) as object) };
}

async function followRows() {
  const [row] = await db<{ count: number }>(`SELECT count(*)::int AS count FROM user_follow`);
  return row.count;
}

async function followNotifications(userId: string) {
  const [row] = await db<{ count: number }>(
    `SELECT count(*)::int AS count FROM notification WHERE user_id = $1 AND kind = 'follow'`,
    [userId]
  );
  return row.count;
}

async function tag(memeId: string, name: string, userId: string) {
  const tagId = await findOrCreateTag(name, userId);
  await addTagToMeme(memeId, tagId, userId);
  return tagId;
}

beforeEach(async () => {
  await resetDatabase();
  session.user = undefined;
});

describe('following', () => {
  it('is idempotent both ways, and says when a call created the follow', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');

    expect(await setFollow(alice, bob, true)).toBe(true);
    expect(await setFollow(alice, bob, true)).toBe(false);
    expect(await followRows()).toBe(1);
    expect(await isFollowing(alice, bob)).toBe(true);
    expect(await isFollowing(bob, alice)).toBe(false);

    await setFollow(alice, bob, false);
    await setFollow(alice, bob, false);
    expect(await followRows()).toBe(0);
    expect(await isFollowing(alice, bob)).toBe(false);
    expect(await isFollowing(undefined, bob)).toBe(false);
  });

  it('the database refuses a self-follow', async () => {
    const alice = await makeUser('alice');
    await expect(setFollow(alice, alice, true)).rejects.toThrow();
  });

  it('counts followers and following', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    await setFollow(bob, alice, true);
    await setFollow(carol, alice, true);
    await setFollow(alice, bob, true);

    expect(await getFollowCounts(alice)).toEqual({ followers: 2, following: 1 });
    expect(await getFollowCounts(bob)).toEqual({ followers: 1, following: 1 });
    expect(await getFollowCounts(carol)).toEqual({ followers: 0, following: 1 });
    expect(await followsAnyone(carol)).toBe(true);
    expect(await getFollowCounts('not-a-uuid')).toEqual({ followers: 0, following: 0 });
  });
});

describe('POST /api/users/[userId]/follow', () => {
  it('needs a login', async () => {
    const alice = await makeUser('alice');
    expect(await postFollow(alice, { following: true })).toMatchObject({ status: 401 });
    expect(await followRows()).toBe(0);
  });

  it('follows and unfollows', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    session.user = { id: alice };

    expect(await postFollow(bob, { following: true })).toEqual({ status: 200, following: true });
    expect(await isFollowing(alice, bob)).toBe(true);
    expect(await postFollow(bob, { following: false })).toEqual({ status: 200, following: false });
    expect(await isFollowing(alice, bob)).toBe(false);
  });

  it('refuses yourself, a bad body, and unknown or deleted users', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    session.user = { id: alice };

    expect(await postFollow(alice, { following: true })).toMatchObject({ status: 400 });
    expect(await postFollow(bob, { following: 'yes' })).toMatchObject({ status: 400 });
    expect(await postFollow('not-a-uuid', { following: true })).toMatchObject({ status: 404 });
    expect(
      await postFollow('00000000-0000-4000-8000-000000000000', { following: true })
    ).toMatchObject({ status: 404 });

    await anonymiseUser({ userId: bob, deletedBy: bob });
    expect(await postFollow(bob, { following: true })).toMatchObject({ status: 404 });
    expect(await followRows()).toBe(0);
  });

  it('notifies once per follower, however often they unfollow and follow again', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    session.user = { id: alice };

    await postFollow(bob, { following: true });
    await postFollow(bob, { following: true });
    await postFollow(bob, { following: false });
    await postFollow(bob, { following: true });
    expect(await followNotifications(bob)).toBe(1);
    expect(await followNotifications(alice)).toBe(0);

    const [group] = await listNotifications(bob);
    expect(group).toMatchObject({
      kind: 'follow',
      memeId: null,
      memeSlug: null,
      unread: true,
      actorCount: 1,
    });
    expect(group.actors.map((a) => a.username)).toEqual(['alice']);
  });
});

describe('follow notifications', () => {
  it('are one line per follower, next to meme notifications', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const meme = await makeMeme(alice);
    session.user = { id: bob };
    await postFollow(alice, { following: true });
    session.user = { id: carol };
    await postFollow(alice, { following: true });
    await db(
      `INSERT INTO notification (user_id, kind, actor_id, meme_id) VALUES ($1, 'like', $2, $3)`,
      [alice, carol, meme]
    );

    const groups = await listNotifications(alice);
    expect(groups.map((g) => [g.kind, g.actors[0].username])).toEqual([
      ['like', 'carol'],
      ['follow', 'carol'],
      ['follow', 'bob'],
    ]);
    expect(await countUnreadNotifications(alice)).toBe(3);
  });

  it('the database keeps meme_id for every kind but follow', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    await expect(
      db(`INSERT INTO notification (user_id, kind, actor_id) VALUES ($1, 'like', $2)`, [alice, bob])
    ).rejects.toThrow();
    await expect(
      db(`INSERT INTO notification (user_id, kind, actor_id, meme_id) VALUES ($1, 'follow', $2, $3)`, [
        alice,
        bob,
        meme,
      ])
    ).rejects.toThrow();
  });
});

describe('deleting an account', () => {
  it('removes its follows both ways and the follow notifications it caused', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    session.user = { id: alice };
    await postFollow(bob, { following: true });
    session.user = { id: carol };
    await postFollow(alice, { following: true });
    await setFollow(carol, bob, true);

    await anonymiseUser({ userId: alice, deletedBy: alice });

    expect(await getFollowCounts(alice)).toEqual({ followers: 0, following: 0 });
    expect(await isFollowing(carol, bob)).toBe(true);
    expect(await followRows()).toBe(1);
    expect(await followNotifications(bob)).toBe(0);
    expect(await followNotifications(alice)).toBe(0);
  });
});

describe('For you', () => {
  it('puts followed uploaders first with followed tags, and names both', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const newestPlain = await makeMeme(carol, '2026-03-05T12:00:00Z');
    const byAlice = await makeMeme(alice, '2026-03-04T12:00:00Z');
    const catByCarol = await makeMeme(carol, '2026-03-03T12:00:00Z');
    const catByAlice = await makeMeme(alice, '2026-03-02T12:00:00Z');
    const oldPlain = await makeMeme(carol, '2026-02-01T12:00:00Z');
    const cats = await tag(catByCarol, 'cats', carol);
    await tag(catByAlice, 'cats', alice);
    await setTagPreference(bob, cats, 'follow');
    await setFollow(bob, alice, true);

    const { memes } = await listForYou(bob);
    expect(memes.map((m) => m.id)).toEqual([byAlice, catByCarol, catByAlice, newestPlain, oldPlain]);
    expect(memes.map((m) => [m.followedUsers, m.followedTags])).toEqual([
      [['alice'], []],
      [[], ['cats']],
      [['alice'], ['cats']],
      [[], []],
      [[], []],
    ]);
  });

  it('leaves the viewer out of the followed part, even with a followed tag', async () => {
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    const own = await makeMeme(bob, '2026-03-02T12:00:00Z');
    const other = await makeMeme(carol, '2026-03-01T12:00:00Z');
    const cats = await tag(own, 'cats', bob);
    await setTagPreference(bob, cats, 'follow');
    await setFollow(bob, carol, true);

    const { memes } = await listForYou(bob);
    expect(memes.map((m) => m.id)).toEqual([other, own]);
    expect(memes[1]).toMatchObject({ followedUsers: [], followedTags: [] });
  });

  it('still hides muted memes from followed uploaders', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const muted = await makeMeme(alice, '2026-03-02T12:00:00Z');
    const plain = await makeMeme(alice, '2026-03-01T12:00:00Z');
    const cats = await tag(muted, 'cats', alice);
    await setTagPreference(bob, cats, 'mute');
    await setFollow(bob, alice, true);

    const { memes } = await listForYou(bob);
    expect(memes.map((m) => m.id)).toEqual([plain]);
    expect(memes[0].followedUsers).toEqual(['alice']);
  });
});
