import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { getConcurrency, getVisitStats, listPresent } from '@/db/queries/visits';
import { getRetention, listNewMembers, listUnclickedSearches } from '@/db/queries/analytics';
import { recordEvent } from '@/db/queries/events';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

// The session and the visitor cookie, swapped for stand-ins as in events-moderation.test.ts.
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

const presenceRoute = await import('@/app/api/presence/route');
const liveRoute = await import('@/app/api/admin/live/route');
const summaryRoute = await import('@/app/api/admin/live/summary/route');

const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> }
) => Promise<Response>;

async function call(handler: Handler, options: { method?: string; body?: unknown; userAgent?: string; url?: string } = {}) {
  const response = await handler(
    new Request(options.url ?? 'http://localhost/api/test', {
      method: options.method ?? 'POST',
      headers: {
        'user-agent': options.userAgent ?? BROWSER,
        'content-type': 'application/json',
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
    { params: Promise.resolve({}) }
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

function ping(body: { path: string; view: boolean; referrer?: string; installed?: boolean }, userAgent?: string) {
  return call(presenceRoute.POST as Handler, { body, userAgent });
}

async function visits() {
  return db<{
    id: number;
    userId: string | null;
    visitorKey: string | null;
    entryPath: string;
    exitPath: string;
    pages: number;
    referrer: string | null;
    device: string;
    installed: boolean;
  }>(
    `SELECT id::int, user_id AS "userId", visitor_key AS "visitorKey", entry_path AS "entryPath",
            exit_path AS "exitPath", pages, referrer, device, installed
       FROM visit ORDER BY id`
  );
}

async function signIn(username: string, role = 'user') {
  const id = await makeUser(username);
  if (role !== 'user') {
    await db(`UPDATE app_user SET role = $2 WHERE id = $1`, [id, role]);
  }
  session.user = { id, username, role };
  return id;
}

beforeEach(async () => {
  await resetDatabase();
  session.user = undefined;
  session.cookies.clear();
});

describe('POST /api/presence', () => {
  it('starts a visit for a visitor, continues it on heartbeats and counts the pages opened', async () => {
    await ping({ path: '/', view: true, referrer: 'https://www.reddit.com/r/memes' });
    await ping({ path: '/', view: false });
    await ping({ path: '/explore', view: true, referrer: 'http://localhost/' });

    const rows = await visits();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: null,
      entryPath: '/',
      exitPath: '/explore',
      pages: 2,
      referrer: 'www.reddit.com',
      device: 'Chrome on Windows',
      installed: false,
    });
    expect(rows[0].visitorKey).toBe(session.cookies.get('visitor'));

    const views = await db<{ data: Record<string, unknown> }>(
      `SELECT data FROM event WHERE kind = 'page_view' ORDER BY id`
    );
    expect(views.map((v) => v.data)).toEqual([
      { path: '/', referrer: 'www.reddit.com' },
      // This site as the referrer is not a referrer.
      { path: '/explore' },
    ]);
  });

  it('starts a new visit after 30 minutes away, and a member visit on logging in', async () => {
    await ping({ path: '/', view: true });
    await db(`UPDATE visit SET last_seen_at = now() - interval '31 minutes'`);
    await ping({ path: '/search', view: true });
    const id = await signIn('ada');
    await ping({ path: '/library', view: true, installed: true });

    const rows = await visits();
    expect(rows.map((r) => r.entryPath)).toEqual(['/', '/search', '/library']);
    expect(rows[2]).toMatchObject({ userId: id, visitorKey: null, installed: true });
  });

  it('ignores bots', async () => {
    await ping({ path: '/', view: true }, 'Googlebot/2.1');
    expect(await visits()).toHaveLength(0);
    expect(await db(`SELECT 1 FROM event`)).toHaveLength(0);
  });
});

describe('who is here and how many', () => {
  it('lists people seen in the last 90 seconds, once each', async () => {
    const ada = await signIn('ada');
    await ping({ path: '/', view: true });
    // A second visit for the same person, as two racing tabs can make.
    await db(
      `INSERT INTO visit (user_id, entry_path, exit_path, pages, device, last_seen_at)
       VALUES ($1, '/explore', '/explore', 1, 'Safari on iPhone', now() - interval '10 seconds')`,
      [ada]
    );
    session.user = undefined;
    await ping({ path: '/meme/abc', view: true });
    await db(`UPDATE visit SET last_seen_at = now() - interval '2 minutes' WHERE visitor_key IS NOT NULL`);

    const present = await listPresent();
    expect(present).toHaveLength(1);
    expect(present[0]).toMatchObject({ username: 'ada', path: '/' });
  });

  it('counts people per step, the current step last', async () => {
    const ada = await makeUser('ada');
    await db(
      `INSERT INTO visit (user_id, entry_path, exit_path, device, started_at, last_seen_at)
       VALUES ($1, '/', '/', 'x', now() - interval '3 hours', now() - interval '2 hours 50 minutes'),
              ($1, '/', '/', 'x', now() - interval '1 minute', now())`,
      [ada]
    );
    await db(
      `INSERT INTO visit (visitor_key, entry_path, exit_path, device, started_at, last_seen_at)
       VALUES (gen_random_uuid(), '/', '/', 'x', now() - interval '1 minute', now())`
    );

    const day = await getConcurrency('day');
    expect(day).toHaveLength(288);
    expect(day.at(-1)).toMatchObject({ people: 2, members: 1 });
    expect(day.reduce((sum, p) => sum + (p.people > 0 ? 1 : 0), 0)).toBeGreaterThanOrEqual(3);

    expect(await getConcurrency('week')).toHaveLength(168);
    expect(await getConcurrency('month')).toHaveLength(30);

    const stats = await getVisitStats();
    expect(stats.peakWeek).toBe(2);
  });

  it('works out bounces and returning visits', async () => {
    const ada = await makeUser('ada');
    await db(
      `INSERT INTO visit (user_id, entry_path, exit_path, pages, device, started_at, last_seen_at, installed)
       VALUES ($1, '/', '/', 1, 'x', now() - interval '2 days', now() - interval '2 days', false),
              ($1, '/', '/explore', 4, 'x', now() - interval '1 day', now() - interval '1 day' + interval '5 minutes', true)`,
      [ada]
    );
    const stats = await getVisitStats();
    expect(stats).toMatchObject({
      visits: 2,
      people: 1,
      bounceShare: 0.5,
      returningShare: 0.5,
      installedShare: 0.5,
      medianPages: 2.5,
    });
    expect(stats.topExits.map((r) => r.path).sort()).toEqual(['/', '/explore']);
  });
});

describe('the longer-view panels', () => {
  it('reads retention only for weeks that have finished since activity was recorded', async () => {
    const ada = await makeUser('ada');
    const bea = await makeUser('bea');
    await db(`UPDATE app_user SET created_at = now() - interval '16 days' WHERE id IN ($1, $2)`, [ada, bea]);
    // Tracking began before they joined.
    await db(`INSERT INTO event (kind, user_id, created_at) VALUES ('active', $1, now() - interval '20 days')`, [bea]);
    // Ada came back in week 1 (days 7 to 13), Bea did not.
    await db(`INSERT INTO event (kind, user_id, created_at) VALUES ('active', $1, now() - interval '7 days')`, [ada]);

    const cohorts = await getRetention();
    const cohort = cohorts.find((c) => c.size === 2)!;
    expect(cohort.active[0]).toBe(1);
    // Week 2 (days 14 to 20) has not finished.
    expect(cohort.active[1]).toBeNull();
  });

  it('lists new members with the first time they did things', async () => {
    const ada = await makeUser('ada');
    await makeUser('bea');
    await makeMeme(ada);
    await recordEvent({ kind: 'meme_copy_link', userId: ada });

    const members = await listNewMembers(10);
    const row = members.find((m) => m.username === 'ada')!;
    expect(row.firstUploadAt).not.toBeNull();
    expect(row.firstSendAt).not.toBeNull();
    expect(row.firstLikeAt).toBeNull();
    expect(row.uploads).toBe(1);
    expect(members.find((m) => m.username === 'bea')!.firstUploadAt).toBeNull();
  });

  it('lists searches that found something nobody opened', async () => {
    const ada = await makeUser('ada');
    const bea = await makeUser('bea');
    await recordEvent({ kind: 'search', userId: ada, data: { query: 'Cat ', results: 3 } });
    await recordEvent({ kind: 'search', userId: bea, data: { query: 'cat', results: 2 } });
    await recordEvent({ kind: 'search_click', userId: bea, data: { query: 'cat', position: 0 } });
    await recordEvent({ kind: 'search', userId: ada, data: { query: 'dog', results: 0 } });

    expect(await listUnclickedSearches()).toEqual([{ query: 'cat', count: 1, results: 3 }]);
  });
});

describe('the admin endpoints', () => {
  it('are admin only', async () => {
    await signIn('ada');
    const live = await call(liveRoute.GET as Handler, { method: 'GET', url: 'http://localhost/api/admin/live' });
    expect(live.status).toBe(404);
    const summary = await call(summaryRoute.GET as Handler, { method: 'GET' });
    expect(summary.status).toBe(404);
  });

  it('answer an admin', async () => {
    await signIn('root', 'admin');
    await ping({ path: '/', view: true });
    const live = await call(liveRoute.GET as Handler, { method: 'GET', url: 'http://localhost/api/admin/live?range=week' });
    expect(live.status).toBe(200);
    expect(live.body.present).toHaveLength(1);
    expect(live.body.concurrency).toHaveLength(168);
    const summary = await call(summaryRoute.GET as Handler, { method: 'GET' });
    expect(summary.status).toBe(200);
    expect(Object.keys(summary.body).sort()).toEqual(['newMembers', 'retention', 'traffic', 'unclickedSearches', 'visits']);
  });
});
