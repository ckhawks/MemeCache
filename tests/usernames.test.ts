import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { usernameProblem } from '@/auth/username';
import { getSessionState, isUsernameTaken } from '@/db/queries/users';
import {
  findRenamedUsername,
  getUsernameCooldown,
  listUsernameHistory,
  renameUser,
  USERNAME_COOLDOWN_DAYS,
  USERNAME_RESERVED_DAYS,
} from '@/db/queries/usernames';
import { makeUser, resetDatabase } from './fixtures';

beforeEach(resetDatabase);

// Moves a user's renames into the past, as if `days` had gone by.
async function age(userId: string, days: number) {
  await db(
    `UPDATE username_history SET changed_at = changed_at - make_interval(days => $2) WHERE user_id = $1`,
    [userId, days]
  );
}

describe('username rules', () => {
  it('accepts plain names and refuses empty, long or URL-unfriendly ones', () => {
    expect(usernameProblem('alice_2.0-b')).toBeNull();
    expect(usernameProblem('')).not.toBeNull();
    expect(usernameProblem('a'.repeat(33))).not.toBeNull();
    expect(usernameProblem('al ice')).not.toBeNull();
    expect(usernameProblem('al/ice')).not.toBeNull();
  });
});

describe('renaming', () => {
  it('changes the name, records it, and reports it in the session check', async () => {
    const alice = await makeUser('alice');
    expect(await renameUser({ userId: alice, username: 'alicia' })).toMatchObject({
      ok: true,
      username: 'alicia',
      previous: 'alice',
    });
    expect((await getSessionState(alice))?.username).toBe('alicia');
    const history = await listUsernameHistory(alice);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ oldUsername: 'alice', newUsername: 'alicia' });
  });

  it('refuses a name in use, case-insensitively, and the same name', async () => {
    const alice = await makeUser('alice');
    await makeUser('bob');
    expect(await renameUser({ userId: alice, username: 'BOB' })).toMatchObject({ ok: false, reason: 'taken' });
    expect(await renameUser({ userId: alice, username: 'alice' })).toMatchObject({ ok: false, reason: 'same' });
  });

  it('allows one change per cooldown, and admin renames neither wait nor start it', async () => {
    const alice = await makeUser('alice');
    expect((await getUsernameCooldown(alice)).availableAt).toBeNull();

    await renameUser({ userId: alice, username: 'alice2' });
    const cooldown = await getUsernameCooldown(alice);
    expect(cooldown.availableAt).not.toBeNull();
    const days = (cooldown.availableAt!.getTime() - cooldown.lastChangedAt!.getTime()) / 86_400_000;
    expect(days).toBe(USERNAME_COOLDOWN_DAYS);
    expect(await renameUser({ userId: alice, username: 'alice3' })).toMatchObject({
      ok: false,
      reason: 'cooldown',
    });

    // An admin can still rename them, and that does not reset their clock.
    expect(await renameUser({ userId: alice, username: 'alice4', byAdmin: true })).toMatchObject({ ok: true });
    await age(alice, USERNAME_COOLDOWN_DAYS - 1);
    expect((await renameUser({ userId: alice, username: 'alice5' })).ok).toBe(false);
    await age(alice, 1);
    expect((await getUsernameCooldown(alice)).availableAt).toBeNull();
    expect(await renameUser({ userId: alice, username: 'alice5' })).toMatchObject({ ok: true });
  });

  it('holds an old name for others during the reservation window, then frees it', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    await renameUser({ userId: alice, username: 'alicia' });

    expect(await renameUser({ userId: bob, username: 'Alice' })).toMatchObject({ ok: false, reason: 'reserved' });
    // Registration sees it as taken too.
    expect(await isUsernameTaken('alice')).toBe(true);

    await age(alice, USERNAME_RESERVED_DAYS + 1);
    expect(await isUsernameTaken('alice')).toBe(false);
    expect(await renameUser({ userId: bob, username: 'alice' })).toMatchObject({ ok: true });
  });

  it('lets the owner take their old name back, after the cooldown', async () => {
    const alice = await makeUser('alice');
    await renameUser({ userId: alice, username: 'alicia' });
    expect((await renameUser({ userId: alice, username: 'alice' })).ok).toBe(false);

    await age(alice, USERNAME_COOLDOWN_DAYS);
    expect(await renameUser({ userId: alice, username: 'alice' })).toMatchObject({ ok: true });
    expect(await listUsernameHistory(alice)).toHaveLength(2);
  });

  it('allows changing only the case of your own name', async () => {
    const alice = await makeUser('alice');
    expect(await renameUser({ userId: alice, username: 'Alice' })).toMatchObject({ ok: true });
  });
});

describe('old name redirects', () => {
  it('finds the current name of whoever gave a name up most recently', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    expect(await findRenamedUsername('alice')).toBeNull();

    await renameUser({ userId: alice, username: 'alicia' });
    expect(await findRenamedUsername('ALICE')).toBe('alicia');

    // Follows later renames.
    await age(alice, USERNAME_RESERVED_DAYS + 1);
    await renameUser({ userId: alice, username: 'ali' });
    expect(await findRenamedUsername('alice')).toBe('ali');

    // Once the reservation is over someone else can hold it and then give it up; the
    // most recent owner wins.
    await renameUser({ userId: bob, username: 'alice' });
    await age(bob, 1);
    await renameUser({ userId: bob, username: 'bobby', byAdmin: true });
    expect(await findRenamedUsername('alice')).toBe('bobby');
  });
});

describe('concurrent renames', () => {
  it('lets only one of two people take the same name at once', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const results = await Promise.all([
      renameUser({ userId: alice, username: 'winner' }),
      renameUser({ userId: bob, username: 'Winner' }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ reason: 'taken' });
  });

  it('does not let someone take a name in the moment its owner leaves it', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const [leave, take] = await Promise.all([
      renameUser({ userId: alice, username: 'alicia' }),
      renameUser({ userId: bob, username: 'alice' }),
    ]);
    expect(leave.ok).toBe(true);
    expect(take.ok).toBe(false);
    expect(['taken', 'reserved']).toContain((take as { reason: string }).reason);
  });

  it('does not let two changes by the same person both pass the cooldown', async () => {
    const alice = await makeUser('alice');
    const results = await Promise.all([
      renameUser({ userId: alice, username: 'one' }),
      renameUser({ userId: alice, username: 'two' }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await listUsernameHistory(alice)).toHaveLength(1);
  });
});
