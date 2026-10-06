import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { anonymiseUser } from '@/db/queries/accounts';
import { setFollow } from '@/db/queries/follows';
import { setTagPreference } from '@/db/queries/tagPreferences';
import { addTagToMeme, findOrCreateTag } from '@/db/queries/tags';
import { setTrustOverride } from '@/db/queries/users';
import { listPeople, listUsersForAdmin } from '@/db/queries/userLists';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

// requireAdmin reads the session through Next; a plain stand-in here lets the page be called
// directly.
const session = vi.hoisted(() => ({
  user: undefined as { id: string; username: string; role: string } | undefined,
}));

vi.mock('@/auth/lib', () => ({
  getUserFromAccessToken: async () => session.user,
}));

const { requireAdmin } = await import('@/server/requireAdmin');
const { default: AdminUsers } = await import('@/app/admin/users/page');

async function like(memeId: string, userId: string) {
  await db(`INSERT INTO meme_like (meme_id, user_id) VALUES ($1, $2)`, [memeId, userId]);
}

async function setJoined(userId: string, when: string) {
  await db(`UPDATE app_user SET created_at = $2 WHERE id = $1`, [userId, when]);
}

// alice: two uploads, three likes from others, joined first. bob: one upload with one like,
// two followers, joined second. carol: nothing, joined last. dave: deleted.
async function seed() {
  const alice = await makeUser('alice');
  const bob = await makeUser('bob');
  const carol = await makeUser('carol');
  const dave = await makeUser('dave');
  await setJoined(alice, '2024-01-01');
  await setJoined(bob, '2024-02-01');
  await setJoined(carol, '2024-03-01');
  await setJoined(dave, '2024-04-01');
  const a1 = await makeMeme(alice);
  const a2 = await makeMeme(alice);
  const b1 = await makeMeme(bob);
  await like(a1, bob);
  await like(a1, carol);
  await like(a2, bob);
  // Her own like counts for nothing.
  await like(a1, alice);
  await like(b1, alice);
  await setFollow(alice, bob, true);
  await setFollow(carol, bob, true);
  await anonymiseUser({ userId: dave, deletedBy: dave });
  return { alice, bob, carol, dave, a1, a2, b1 };
}

beforeEach(async () => {
  await resetDatabase();
  session.user = undefined;
});

describe('listPeople', () => {
  it('sorts by karma, followers and newest, and leaves deleted accounts out', async () => {
    const { alice, bob, carol } = await seed();

    const byKarma = await listPeople({ sort: 'karma' });
    expect(byKarma.rows.map((row) => row.id)).toEqual([alice, bob, carol]);
    expect(byKarma.rows[0]).toMatchObject({ karma: 3, uploads: 2, followers: 0 });
    expect(byKarma.nextPage).toBeNull();

    const byFollowers = await listPeople({ sort: 'followers' });
    expect(byFollowers.rows.map((row) => row.id)).toEqual([bob, alice, carol]);
    expect(byFollowers.rows[0].followers).toBe(2);

    const newest = await listPeople({ sort: 'new' });
    expect(newest.rows.map((row) => row.id)).toEqual([carol, bob, alice]);
  });

  it('sorts by what people added in the last 30 days', async () => {
    const { alice, bob, carol } = await seed();
    // Old uploads do not count; carol's two new ones put her first.
    await db(`UPDATE meme SET created_at = now() - interval '60 days' WHERE uploader_id = $1`, [alice]);
    await makeMeme(carol);
    await makeMeme(carol);

    const active = await listPeople({ sort: 'active' });
    expect(active.rows.map((row) => row.id)).toEqual([carol, bob, alice]);
  });

  it('pages, and says whether the viewer follows each person', async () => {
    const { alice, bob, carol } = await seed();

    const first = await listPeople({ sort: 'karma', perPage: 2, viewerId: alice });
    expect(first.rows.map((row) => row.id)).toEqual([alice, bob]);
    expect(first.nextPage).toBe(1);
    expect(first.rows[1].following).toBe(true);
    const second = await listPeople({ sort: 'karma', perPage: 2, page: 1, viewerId: alice });
    expect(second.rows.map((row) => row.id)).toEqual([carol]);
    expect(second.nextPage).toBeNull();

    const visitor = await listPeople({ sort: 'karma' });
    expect(visitor.rows.every((row) => !row.following)).toBe(true);
  });

  it('fills the strip with the most-liked uploads first, without memes the viewer muted', async () => {
    const { alice, carol, a1, a2 } = await seed();
    const tagId = await findOrCreateTag('cats', alice);
    await addTagToMeme(a1, tagId, alice);

    const forVisitor = await listPeople({ sort: 'karma' });
    expect(forVisitor.rows[0].memes.map((meme) => meme.id)).toEqual([a1, a2]);
    expect(forVisitor.rows[2].memes).toEqual([]);

    await setTagPreference(carol, tagId, 'mute');
    const forCarol = await listPeople({ sort: 'karma', viewerId: carol });
    expect(forCarol.rows[0].memes.map((meme) => meme.id)).toEqual([a2]);
  });
});

describe('listUsersForAdmin', () => {
  it('leaves deleted accounts out unless asked, and counts them only then', async () => {
    const { dave } = await seed();

    const live = await listUsersForAdmin({});
    expect(live.total).toBe(3);
    expect(live.rows.some((row) => row.id === dave)).toBe(false);

    const all = await listUsersForAdmin({ includeDeleted: true });
    expect(all.total).toBe(4);
    expect(all.rows.find((row) => row.id === dave)?.deletedAt).not.toBeNull();
  });

  it('sorts by any column in either direction', async () => {
    const { alice, bob, carol } = await seed();

    const joined = await listUsersForAdmin({});
    expect(joined.rows.map((row) => row.id)).toEqual([carol, bob, alice]);

    const names = await listUsersForAdmin({ sort: 'username', dir: 'asc' });
    expect(names.rows.map((row) => row.id)).toEqual([alice, bob, carol]);

    const post = await listUsersForAdmin({ sort: 'post', dir: 'desc' });
    expect(post.rows.map((row) => row.id)).toEqual([alice, bob, carol]);
    expect(post.rows[0]).toMatchObject({ postKarma: 3, curationKarma: 0, uploads: 2 });

    const followers = await listUsersForAdmin({ sort: 'followers', dir: 'asc' });
    expect(followers.rows.at(-1)).toMatchObject({ id: bob, followers: 2 });

    await setTrustOverride(carol, 'held');
    const trust = await listUsersForAdmin({ sort: 'trust', dir: 'desc' });
    expect(trust.rows[0]).toMatchObject({ id: carol, held: true, trustOverride: 'held' });
  });

  it('filters by part of the username, taking % and _ literally, and pages', async () => {
    const { bob } = await seed();
    await makeUser('z_z');

    const found = await listUsersForAdmin({ query: 'BO' });
    expect(found.rows.map((row) => row.id)).toEqual([bob]);
    expect(found.total).toBe(1);
    const underscore = await listUsersForAdmin({ query: '_' });
    expect(underscore.rows.map((row) => row.username)).toEqual(['z_z']);
    expect((await listUsersForAdmin({ query: '%' })).total).toBe(0);

    const page = await listUsersForAdmin({ sort: 'username', dir: 'asc', perPage: 2, page: 1 });
    expect(page.rows.map((row) => row.username)).toEqual(['carol', 'z_z']);
    expect(page.total).toBe(4);
  });

  it('shows the invite code an account signed up with', async () => {
    const { alice } = await seed();
    const [code] = await db<{ id: string }>(`INSERT INTO invite_code (code) VALUES ('FRIENDS') RETURNING id`);
    await db(`UPDATE app_user SET invited_by_code_id = $2 WHERE id = $1`, [alice, code.id]);

    const rows = (await listUsersForAdmin({ sort: 'username', dir: 'asc' })).rows;
    expect(rows.map((row) => row.inviteCode)).toEqual(['FRIENDS', null, null]);
  });
});

describe('the admin users page', () => {
  it('is a 404 for everyone but admins', async () => {
    const admin = await makeUser('root');
    const props = { searchParams: Promise.resolve({}) };

    session.user = undefined;
    await expect(requireAdmin()).rejects.toThrow();
    await expect(AdminUsers(props)).rejects.toThrow();

    session.user = { id: admin, username: 'root', role: 'user' };
    await expect(AdminUsers(props)).rejects.toThrow();

    session.user = { id: admin, username: 'root', role: 'moderator' };
    await expect(AdminUsers(props)).rejects.toThrow();

    session.user = { id: admin, username: 'root', role: 'admin' };
    expect(await requireAdmin()).toMatchObject({ id: admin });
    await expect(AdminUsers(props)).resolves.toBeTruthy();
  });
});
