import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { listReactions, listReactionsFor } from '@/db/queries/reactions';
import { addComment, deleteComment } from '@/db/queries/comments';
import { listNotifications } from '@/db/queries/notifications';
import { mergeMemes } from '@/db/queries/merge';
import { isReactionEmoji, REACTIONS_PER_PERSON } from '@/constants/reactions';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

const session = vi.hoisted(() => ({
  user: undefined as { id: string; username: string; role: string } | undefined,
}));

vi.mock('@/auth/lib', () => ({
  getUserFromAccessToken: async () => session.user,
}));

const memeRoute = await import('@/app/api/meme/[memeId]/reactions/route');
const commentRoute = await import('@/app/api/meme/[memeId]/comments/[commentId]/reactions/route');

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> }
) => Promise<Response>;

async function put(handler: Handler, params: Record<string, string>, body: unknown) {
  const response = await handler(
    new Request('http://localhost/api/test', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve(params) }
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function as(username: string, role = 'user') {
  const [existing] = await db<{ id: string }>(`SELECT id FROM app_user WHERE username = $1`, [username]);
  const id = existing?.id ?? (await makeUser(username));
  session.user = { id, username, role };
  return id;
}

beforeEach(async () => {
  await resetDatabase();
  session.user = undefined;
});

describe('isReactionEmoji', () => {
  it('takes one emoji, skin tones, families, flags and keycaps included', () => {
    for (const emoji of ['😂', '❤️', '👍🏽', '👨‍👩‍👧', '🏳️‍🌈', '🇯🇵', '1️⃣', '©️']) {
      expect(isReactionEmoji(emoji), emoji).toBe(true);
    }
  });

  it('refuses text, several emoji and nothing', () => {
    for (const value of ['', 'a', 'lol', '😂😂', '😂 ', ':skull:', '1', '<b>']) {
      expect(isReactionEmoji(value), value).toBe(false);
    }
  });
});

describe('reacting to a meme', () => {
  it('counts each emoji, marks the viewer, and takes a reaction back', async () => {
    const owner = await makeUser('owner');
    const memeId = await makeMeme(owner);
    await as('ada');
    await put(memeRoute.PUT as Handler, { memeId }, { emoji: '😂', reacted: true });
    await put(memeRoute.PUT as Handler, { memeId }, { emoji: '🔥', reacted: true });
    await as('bea');
    const result = await put(memeRoute.PUT as Handler, { memeId }, { emoji: '😂', reacted: true });

    expect(result.status).toBe(200);
    expect(result.body.reactions).toEqual([
      { emoji: '😂', count: 2, mine: true, names: ['ada', 'bea'] },
      { emoji: '🔥', count: 1, mine: false, names: ['ada'] },
    ]);

    const undone = await put(memeRoute.PUT as Handler, { memeId }, { emoji: '😂', reacted: false });
    expect(undone.body.reactions).toEqual([
      { emoji: '😂', count: 1, mine: false, names: ['ada'] },
      { emoji: '🔥', count: 1, mine: false, names: ['ada'] },
    ]);
    // The row stays, stamped.
    expect(await db(`SELECT 1 FROM meme_reaction WHERE removed_at IS NOT NULL`)).toHaveLength(1);
  });

  it('notifies the uploader once per person, and not for their own', async () => {
    const owner = await as('owner');
    const memeId = await makeMeme(owner);
    await put(memeRoute.PUT as Handler, { memeId }, { emoji: '😂', reacted: true });
    await as('ada');
    await put(memeRoute.PUT as Handler, { memeId }, { emoji: '😂', reacted: true });
    await put(memeRoute.PUT as Handler, { memeId }, { emoji: '💀', reacted: true });

    const groups = await listNotifications(owner);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: 'meme_reaction', actorCount: 1 });
  });

  it('refuses text and a reaction past the limit', async () => {
    const memeId = await makeMeme(await makeUser('owner'));
    await as('ada');
    const text = await put(memeRoute.PUT as Handler, { memeId }, { emoji: 'lol', reacted: true });
    expect(text.status).toBe(400);

    const emoji = ['😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊', '😋'];
    expect(emoji.length).toBeGreaterThan(REACTIONS_PER_PERSON);
    for (const e of emoji.slice(0, REACTIONS_PER_PERSON)) {
      expect((await put(memeRoute.PUT as Handler, { memeId }, { emoji: e, reacted: true })).status).toBe(200);
    }
    const over = await put(memeRoute.PUT as Handler, { memeId }, { emoji: emoji[REACTIONS_PER_PERSON], reacted: true });
    expect(over.status).toBe(400);
    expect(over.body.error).toContain(String(REACTIONS_PER_PERSON));
    // One already given is not a new one.
    expect((await put(memeRoute.PUT as Handler, { memeId }, { emoji: emoji[0], reacted: true })).status).toBe(200);
  });

  it('needs a login', async () => {
    const memeId = await makeMeme(await makeUser('owner'));
    expect((await put(memeRoute.PUT as Handler, { memeId }, { emoji: '😂', reacted: true })).status).toBe(401);
  });
});

describe('reacting to a comment', () => {
  it('reacts, notifies the author per comment, and lists reactions by comment', async () => {
    const owner = await makeUser('owner');
    const memeId = await makeMeme(owner);
    const author = await makeUser('author');
    const first = await addComment({ memeId, authorId: author, body: 'one', refMemeId: null });
    const second = await addComment({ memeId, authorId: author, body: 'two', refMemeId: null });

    await as('ada');
    await put(commentRoute.PUT as Handler, { memeId, commentId: first.id }, { emoji: '👍', reacted: true });
    await put(commentRoute.PUT as Handler, { memeId, commentId: second.id }, { emoji: '😭', reacted: true });

    const byComment = await listReactions('comment', [first.id, second.id], null);
    expect(byComment[first.id]).toEqual([{ emoji: '👍', count: 1, mine: false, names: ['ada'] }]);
    expect(byComment[second.id]).toEqual([{ emoji: '😭', count: 1, mine: false, names: ['ada'] }]);

    const groups = await listNotifications(author);
    expect(groups.map((g) => g.kind)).toEqual(['comment_reaction', 'comment_reaction']);
  });

  it('refuses a comment on another meme and new reactions on a deleted one', async () => {
    const owner = await makeUser('owner');
    const memeId = await makeMeme(owner);
    const otherMeme = await makeMeme(owner);
    const author = await makeUser('author');
    const comment = await addComment({ memeId, authorId: author, body: 'hi', refMemeId: null });
    await as('ada');

    const wrong = await put(commentRoute.PUT as Handler, { memeId: otherMeme, commentId: comment.id }, { emoji: '👍', reacted: true });
    expect(wrong.status).toBe(404);

    await put(commentRoute.PUT as Handler, { memeId, commentId: comment.id }, { emoji: '👍', reacted: true });
    await deleteComment(comment.id, author);
    const late = await put(commentRoute.PUT as Handler, { memeId, commentId: comment.id }, { emoji: '😂', reacted: true });
    expect(late.status).toBe(400);
    // Taking one back still works.
    const back = await put(commentRoute.PUT as Handler, { memeId, commentId: comment.id }, { emoji: '👍', reacted: false });
    expect(back.status).toBe(200);
  });
});

describe('merging', () => {
  it('moves reactions to the original, keeping one per person per emoji', async () => {
    const owner = await makeUser('owner');
    const original = await makeMeme(owner, '2026-01-01');
    const duplicate = await makeMeme(owner, '2026-02-01');
    const ada = await makeUser('ada');
    const bea = await makeUser('bea');
    await db(
      `INSERT INTO meme_reaction (meme_id, user_id, emoji) VALUES ($1, $3, '😂'), ($2, $3, '😂'), ($2, $4, '🔥')`,
      [original, duplicate, ada, bea]
    );
    const moderator = await makeUser('mod');
    await db(`UPDATE app_user SET role = 'moderator' WHERE id = $1`, [moderator]);

    const result = await mergeMemes(duplicate, original, moderator);
    expect(result.moved.reactions).toBe(1);
    // Inserted together, so in no particular order.
    const reactions = await listReactionsFor('meme', original, ada);
    expect(reactions).toHaveLength(2);
    expect(reactions).toEqual(
      expect.arrayContaining([
        { emoji: '😂', count: 1, mine: true, names: ['ada'] },
        { emoji: '🔥', count: 1, mine: false, names: ['bea'] },
      ])
    );
  });
});
