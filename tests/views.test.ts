import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { getMeme, listMemes, softDeleteMeme } from '@/db/queries/memes';
import { recordView } from '@/db/queries/views';
import { formatCount } from '@/util/formatCount';
import { isBot } from '@/server/isBot';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

// The view route reads the session and the visitor cookie through Next. Both are swapped for
// plain stand-ins here, so the route can be called directly.
const session = vi.hoisted(() => ({
  user: undefined as { id: string } | undefined,
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

const { POST } = await import('@/app/api/meme/[memeId]/view/route');

const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';

async function postView(memeId: string, userAgent = BROWSER) {
  const response = await POST(
    new Request(`http://localhost/api/meme/${memeId}/view`, {
      method: 'POST',
      headers: { 'user-agent': userAgent },
    }),
    { params: Promise.resolve({ memeId }) }
  );
  return { status: response.status, ...((await response.json()) as { counted?: boolean }) };
}

async function viewCount(memeId: string) {
  return (await getMeme(memeId))!.viewCount;
}

// Moves every recorded view of a meme this far into the past.
async function age(memeId: string, interval: string) {
  await db(`UPDATE meme_view SET created_at = created_at - $2::interval WHERE meme_id = $1`, [
    memeId,
    interval,
  ]);
}

beforeEach(async () => {
  await resetDatabase();
  session.user = undefined;
  session.cookies.clear();
});

describe('recordView', () => {
  it('counts a logged-in viewer once per 24 hours', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);

    expect(await recordView(meme, { userId: bob })).toBe(true);
    expect(await recordView(meme, { userId: bob })).toBe(false);
    expect(await viewCount(meme)).toBe(1);

    await age(meme, '23 hours');
    expect(await recordView(meme, { userId: bob })).toBe(false);

    await age(meme, '2 hours');
    expect(await recordView(meme, { userId: bob })).toBe(true);
    expect(await viewCount(meme)).toBe(2);

    const [rows] = await db<{ count: number }>(
      `SELECT count(*)::int AS count FROM meme_view WHERE meme_id = $1`,
      [meme]
    );
    expect(rows.count).toBe(2);
  });

  it('never counts the uploader', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);

    expect(await recordView(meme, { userId: alice })).toBe(false);
    expect(await viewCount(meme)).toBe(0);
  });

  it('counts anonymous visitors by their key, separately from each other and from members', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    const visitor = randomUUID();

    expect(await recordView(meme, { visitorKey: visitor })).toBe(true);
    expect(await recordView(meme, { visitorKey: visitor })).toBe(false);
    expect(await recordView(meme, { visitorKey: randomUUID() })).toBe(true);
    expect(await recordView(meme, { userId: bob })).toBe(true);
    expect(await viewCount(meme)).toBe(3);
  });

  it('keeps each meme separate', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const first = await makeMeme(alice);
    const second = await makeMeme(alice);

    expect(await recordView(first, { userId: bob })).toBe(true);
    expect(await recordView(second, { userId: bob })).toBe(true);
    expect(await viewCount(first)).toBe(1);
    expect(await viewCount(second)).toBe(1);
  });

  it('counts the same viewer once when two requests arrive together', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);

    const results = await Promise.all([
      recordView(meme, { userId: bob }),
      recordView(meme, { userId: bob }),
      recordView(meme, { userId: bob }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await viewCount(meme)).toBe(1);
  });

  it('ignores deleted memes and malformed ids', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);
    await softDeleteMeme(meme);

    expect(await recordView(meme, { userId: bob })).toBe(false);
    expect(await recordView('not-a-uuid', { userId: bob })).toBe(false);
    expect(await recordView(randomUUID(), { visitorKey: 'nope' })).toBe(false);
  });

  it('shows the total on feed cards', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    await recordView(meme, { visitorKey: randomUUID() });
    await recordView(meme, { visitorKey: randomUUID() });

    const { memes } = await listMemes({});
    expect(memes[0].viewCount).toBe(2);
  });
});

describe('POST /api/meme/[memeId]/view', () => {
  it('gives a logged-out visitor a cookie and counts them once', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);

    expect(await postView(meme)).toEqual({ status: 200, counted: true });
    const visitor = session.cookies.get('visitor');
    expect(visitor).toMatch(/^[0-9a-f-]{36}$/);

    expect(await postView(meme)).toEqual({ status: 200, counted: false });
    expect(session.cookies.get('visitor')).toBe(visitor);
    expect(await viewCount(meme)).toBe(1);

    // A different browser, with no cookie yet.
    session.cookies.clear();
    expect(await postView(meme)).toEqual({ status: 200, counted: true });
    expect(await viewCount(meme)).toBe(2);
  });

  it('counts a logged-in viewer by account and sets no cookie', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);

    session.user = { id: bob };
    expect(await postView(meme)).toEqual({ status: 200, counted: true });
    expect(session.cookies.size).toBe(0);

    session.user = { id: alice };
    expect(await postView(meme)).toEqual({ status: 200, counted: false });
    expect(await viewCount(meme)).toBe(1);
  });

  it('skips bots', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);

    expect(await postView(meme, 'Googlebot/2.1 (+http://www.google.com/bot.html)')).toEqual({
      status: 200,
      counted: false,
    });
    expect(await postView(meme, '')).toEqual({ status: 200, counted: false });
    expect(await viewCount(meme)).toBe(0);
  });

  it('404s for a meme that does not exist', async () => {
    expect((await postView(randomUUID())).status).toBe(404);
  });
});

describe('isBot', () => {
  it('passes browsers and catches the usual crawlers', () => {
    expect(isBot(BROWSER)).toBe(false);
    expect(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1')).toBe(false);
    expect(isBot('facebookexternalhit/1.1')).toBe(true);
    expect(isBot('Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)')).toBe(true);
    expect(isBot('Mozilla/5.0 HeadlessChrome/140.0')).toBe(true);
    expect(isBot('curl/8.4.0')).toBe(true);
    expect(isBot(null)).toBe(true);
  });
});

describe('formatCount', () => {
  it('shortens large numbers', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1000)).toBe('1k');
    expect(formatCount(1234)).toBe('1.2k');
    expect(formatCount(9960)).toBe('10k');
    expect(formatCount(12_345)).toBe('12k');
    expect(formatCount(999_950)).toBe('1m');
    expect(formatCount(3_400_000)).toBe('3.4m');
  });
});
