import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { getMeme } from '@/db/queries/memes';
import { getActivityNumbers, listFailedSearches, recordEvent } from '@/db/queries/events';
import { listModerationActions } from '@/db/queries/moderation';
import { addTagToMeme, findOrCreateTag } from '@/db/queries/tags';
import { addWarnings } from '@/db/queries/warnings';
import { addComment } from '@/db/queries/comments';
import { reportMeme } from '@/db/queries/reports';
import { touchLastActive } from '@/db/queries/users';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

// The routes read the session and the visitor cookie through Next. Both are swapped for plain
// stand-ins here, as in views.test.ts, so routes can be called directly.
const session = vi.hoisted(() => ({
  user: undefined as { id: string; username: string; role: string } | undefined,
  cookies: new Map<string, string>(),
}));

vi.mock('@/auth/lib', () => ({
  getUserFromAccessToken: async () => session.user,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      session.cookies.has(name) ? { name, value: session.cookies.get(name) } : undefined,
    set: (name: string, value: string) => {
      session.cookies.set(name, value);
    },
  }),
}));

const eventRoute = await import('@/app/api/event/route');
const memeRoute = await import('@/app/api/meme/[memeId]/route');
const tagRoute = await import('@/app/api/meme/[memeId]/tags/[tagId]/route');
const warningRoute = await import('@/app/api/meme/[memeId]/warnings/[warning]/route');
const commentRoute = await import('@/app/api/meme/[memeId]/comments/[commentId]/route');
const reportsRoute = await import('@/app/api/admin/reports/[memeId]/route');
const trustRoute = await import('@/app/api/admin/trust/route');
const renameRoute = await import('@/app/api/admin/username/route');
const invitesRoute = await import('@/app/api/admin/invites/route');
const inviteRoute = await import('@/app/api/admin/invites/[inviteId]/route');

const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> }
) => Promise<Response>;

async function call(
  handler: Handler,
  options: {
    method?: string;
    body?: unknown;
    params?: Record<string, string>;
    userAgent?: string;
  } = {}
) {
  const response = await handler(
    new Request('http://localhost/api/test', {
      method: options.method ?? 'POST',
      headers: {
        'user-agent': options.userAgent ?? BROWSER,
        'content-type': 'application/json',
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
    { params: Promise.resolve(options.params ?? {}) }
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function signIn(username: string, role = 'user') {
  const id = await makeUser(username);
  if (role !== 'user') {
    await db(`UPDATE app_user SET role = $2 WHERE id = $1`, [id, role]);
  }
  session.user = { id, username, role };
  return id;
}

function as(id: string, username: string, role = 'user') {
  session.user = { id, username, role };
}

async function events(kind: string) {
  return db<{ userId: string | null; visitorKey: string | null; memeId: string | null; data: Record<string, unknown> }>(
    `SELECT user_id AS "userId", visitor_key AS "visitorKey", meme_id AS "memeId", data
       FROM event WHERE kind = $1 ORDER BY id`,
    [kind]
  );
}

async function log() {
  return (await listModerationActions()).rows;
}

beforeEach(async () => {
  await resetDatabase();
  session.user = undefined;
  session.cookies.clear();
});

describe('events', () => {
  it('records a member\'s event with the meme, found by slug or id', async () => {
    const alice = await signIn('alice');
    const meme = await makeMeme(alice);
    const slug = (await getMeme(meme))!.slug;

    expect((await call(eventRoute.POST, { body: { kind: 'meme_download', memeId: meme } })).status).toBe(200);
    await call(eventRoute.POST, { body: { kind: 'search_click', memeId: slug, query: 'cats', position: 3 } });

    expect(await events('meme_download')).toEqual([{ userId: alice, visitorKey: null, memeId: meme, data: {} }]);
    expect(await events('search_click')).toEqual([
      { userId: alice, visitorKey: null, memeId: meme, data: { query: 'cats', position: 3 } },
    ]);
  });

  it('gives a logged-out visitor the visitor cookie and records them by it', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);

    await call(eventRoute.POST, { body: { kind: 'meme_send', memeId: meme } });
    await call(eventRoute.POST, { body: { kind: 'share', memeId: meme } });

    const key = session.cookies.get('visitor');
    expect(key).toBeTruthy();
    const rows = [...(await events('meme_send')), ...(await events('share'))];
    expect(rows.map((r) => [r.userId, r.visitorKey])).toEqual([
      [null, key],
      [null, key],
    ]);
  });

  it('drops bots, memes that do not exist, and refuses unknown kinds', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);

    await call(eventRoute.POST, { body: { kind: 'meme_download', memeId: meme }, userAgent: 'Googlebot/2.1' });
    await call(eventRoute.POST, { body: { kind: 'meme_download', memeId: 'nothing' } });
    const unknown = await call(eventRoute.POST, { body: { kind: 'search' } });

    expect(unknown.status).toBe(400);
    expect(await events('meme_download')).toEqual([]);
    expect(session.cookies.size).toBe(0);
  });

  it('never throws from recordEvent', async () => {
    // A meme id that does not exist breaks the foreign key. It is logged, not thrown.
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      recordEvent({ kind: 'upload', memeId: '00000000-0000-4000-8000-000000000000' })
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('records one active row per user per day', async () => {
    const alice = await makeUser('alice');
    await touchLastActive(alice);
    await touchLastActive(alice);
    expect(await events('active')).toHaveLength(1);

    await db(`UPDATE event SET created_at = created_at - interval '1 day' WHERE kind = 'active'`);
    await touchLastActive(alice);
    expect(await events('active')).toHaveLength(2);
  });

  it('answers the admin numbers: active members, sends, downloads and failed searches', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const carol = await makeUser('carol');
    await touchLastActive(alice);
    await touchLastActive(bob);
    // Carol was last seen two weeks ago.
    await db(`UPDATE app_user SET last_active = now() - interval '14 days' WHERE id = $1`, [carol]);

    const meme = await makeMeme(alice);
    await recordEvent({ kind: 'meme_send', userId: bob, memeId: meme });
    await recordEvent({ kind: 'meme_download', userId: bob, memeId: meme });
    await recordEvent({ kind: 'meme_download', userId: alice, memeId: meme });
    await recordEvent({ kind: 'search', userId: bob, data: { query: 'Cat ', results: 0 } });
    await recordEvent({ kind: 'search', userId: alice, data: { query: 'cat', results: 0 } });
    await recordEvent({ kind: 'search', userId: alice, data: { query: 'dog', results: 0 } });
    await recordEvent({ kind: 'search', userId: alice, data: { query: 'fine', results: 4 } });
    // Older than a week.
    await db(
      `INSERT INTO event (kind, user_id, data, created_at)
       VALUES ('search', $1, '{"query": "old", "results": 0}', now() - interval '8 days')`,
      [alice]
    );

    expect(await getActivityNumbers()).toMatchObject({
      activeWeek: 2,
      activeMonth: 3,
      sendsWeek: 1,
      downloadsWeek: 2,
      searchesWeek: 4,
    });
    expect(await listFailedSearches()).toEqual([
      { query: 'cat', count: 2 },
      { query: 'dog', count: 1 },
    ]);
  });
});

describe('moderation log', () => {
  it('logs a moderator deleting someone else\'s meme, with the reason, and not an uploader deleting their own', async () => {
    const alice = await makeUser('alice');
    const own = await makeMeme(alice);
    const other = await makeMeme(alice);

    as(alice, 'alice');
    expect((await call(memeRoute.DELETE, { method: 'DELETE', params: { memeId: own } })).status).toBe(200);
    expect(await log()).toEqual([]);

    const mod = await signIn('mod', 'moderator');
    const response = await call(memeRoute.DELETE, {
      method: 'DELETE',
      params: { memeId: other },
      body: { reason: 'Not a meme' },
    });
    expect(response.status).toBe(200);

    const [entry] = await log();
    expect(entry).toMatchObject({
      action: 'meme_delete',
      targetType: 'meme',
      targetId: other,
      reason: 'Not a meme',
      actorUsername: 'mod',
      memeDeleted: true,
    });
    const [row] = await db<{ deletedBy: string; reason: string }>(
      `SELECT deleted_by AS "deletedBy", delete_reason AS reason FROM meme WHERE id = $1`,
      [other]
    );
    expect(row).toEqual({ deletedBy: mod, reason: 'Not a meme' });
  });

  it('logs resolving reports, and the deletion that comes with it', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    await reportMeme(meme, bob, 'spam', null);

    await signIn('mod', 'moderator');
    await call(reportsRoute.POST, { params: { memeId: meme }, body: { action: 'delete', note: 'Spam ring' } });

    const entries = await log();
    expect(entries.map((e) => [e.action, e.reason, e.data])).toEqual([
      ['meme_delete', 'Spam ring', { fromReports: true }],
      ['report_resolve', 'Spam ring', { status: 'actioned', reports: 1 }],
    ]);
  });

  it('logs trust overrides, renames and invite codes', async () => {
    const bob = await makeUser('bob');
    await signIn('admin', 'admin');

    await call(trustRoute.POST, { body: { userId: bob, override: 'held' } });
    await call(trustRoute.POST, { body: { userId: bob, override: null } });
    await call(renameRoute.POST, { body: { userId: bob, username: 'robert' } });
    const created = await call(invitesRoute.POST, { body: { code: 'FRIENDS', note: 'for friends' } });
    await call(inviteRoute.POST, { params: { inviteId: created.body.id as string }, body: { disabled: true } });

    const entries = (await log()).reverse();
    expect(entries.map((e) => [e.action, e.targetType, e.data])).toEqual([
      ['trust_override', 'user', { from: null, to: 'held' }],
      ['trust_override', 'user', { from: 'held', to: null }],
      ['user_rename', 'user', { from: 'bob', to: 'robert' }],
      ['invite_create', 'invite', { code: 'FRIENDS', note: 'for friends', maxUses: null, expiresAt: null }],
      ['invite_disable', 'invite', {}],
    ]);
    expect(entries[0].targetUsername).toBe('robert');
  });

  it('logs a moderator removing someone else\'s tag, warning or comment, and not their own', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    const tag = await findOrCreateTag('wrong', alice);
    const own = await findOrCreateTag('mine', alice);
    await addTagToMeme(meme, tag, alice);
    await addTagToMeme(meme, own, alice);
    await addWarnings(meme, ['spoiler'], alice);
    const comment = await addComment({ memeId: meme, authorId: alice, body: 'hi', refMemeId: null });

    // Alice taking back her own tag is not moderation.
    as(alice, 'alice');
    await call(tagRoute.DELETE, { method: 'DELETE', params: { memeId: meme, tagId: own } });
    expect(await log()).toEqual([]);

    await signIn('mod', 'moderator');
    expect((await call(tagRoute.DELETE, { method: 'DELETE', params: { memeId: meme, tagId: tag } })).status).toBe(200);
    expect(
      (await call(warningRoute.DELETE, { method: 'DELETE', params: { memeId: meme, warning: 'spoiler' } })).status
    ).toBe(200);
    expect(
      (await call(commentRoute.DELETE, { method: 'DELETE', params: { memeId: meme, commentId: comment.id } })).status
    ).toBe(200);
    // A second delete of the same comment changes nothing and logs nothing.
    await call(commentRoute.DELETE, { method: 'DELETE', params: { memeId: meme, commentId: comment.id } });

    const entries = (await log()).reverse();
    expect(entries.map((e) => [e.action, e.targetType, e.data])).toEqual([
      ['tag_remove', 'meme', { tagId: tag, tagName: 'wrong', addedBy: alice }],
      ['warning_remove', 'meme', { warning: 'spoiler', addedBy: alice }],
      ['comment_delete', 'comment', { memeId: meme, authorId: alice }],
    ]);
    // The comment's entry links to the meme it was on.
    expect(entries[2].memeSlug).toBe((await getMeme(meme))!.slug);
  });

  it('pages the log newest first', async () => {
    const bob = await makeUser('bob');
    await signIn('admin', 'admin');
    for (const override of ['held', 'trusted', null]) {
      await call(trustRoute.POST, { body: { userId: bob, override } });
    }
    const first = await listModerationActions({ limit: 2 });
    expect(first.rows.map((r) => r.data.to)).toEqual([null, 'trusted']);
    const second = await listModerationActions({ limit: 2, before: first.nextBefore });
    expect(second.rows.map((r) => r.data.to)).toEqual(['held']);
    expect(second.nextBefore).toBeNull();
  });
});
