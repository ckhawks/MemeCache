import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

// The like route reads the session through Next. It is swapped for a plain stand-in here, so
// the route can be called directly.
const session = vi.hoisted(() => ({
  user: undefined as { id: string } | undefined,
}));

vi.mock('@/auth/lib', () => ({
  getUserFromAccessToken: async () => session.user,
}));

const { POST } = await import('@/app/api/meme/[memeId]/like/route');

async function postLike(memeId: string, liked: boolean) {
  const response = await POST(
    new Request(`http://localhost/api/meme/${memeId}/like`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ liked }),
    }),
    { params: Promise.resolve({ memeId }) }
  );
  return { status: response.status, body: (await response.json()) as { likeCount?: number } };
}

beforeEach(async () => {
  await resetDatabase();
  session.user = undefined;
});

describe('POST /api/meme/[memeId]/like', () => {
  it("refuses a like on the caller's own meme, and allows anyone else's", async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const meme = await makeMeme(alice);

    session.user = { id: alice };
    expect((await postLike(meme, true)).status).toBe(403);
    // Taking back an old self-like still works.
    expect(await postLike(meme, false)).toEqual({ status: 200, body: { likeCount: 0 } });

    session.user = { id: bob };
    expect(await postLike(meme, true)).toEqual({ status: 200, body: { likeCount: 1 } });
  });
});
