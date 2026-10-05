import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { db } from '@/db/db';
import { createAccessToken, validateAccessToken } from '@/auth/lib';
import {
  coarseNetwork,
  createSession,
  listSessions,
  revokeOtherSessions,
  revokeSession,
} from '@/db/queries/sessions';
import { describeDevice } from '@/util/describeDevice';
import { makeUser, resetDatabase } from './fixtures';

beforeEach(resetDatabase);

async function login(userId: string, username: string, userAgent: string | null = null) {
  const sessionId = await createSession({
    userId,
    userAgent,
    ip: '203.0.113.42',
  });
  const token = await createAccessToken({
    id: userId,
    username,
    email: `${username}@example.test`,
    role: 'user',
    sessionId,
  });
  return { sessionId, token };
}

async function lastSeen(sessionId: string): Promise<Date> {
  const [row] = await db<{ lastSeenAt: Date }>(
    `SELECT last_seen_at AS "lastSeenAt" FROM user_session WHERE id = $1`,
    [sessionId]
  );
  return row.lastSeenAt;
}

describe('sessions', () => {
  it('accepts a token whose session is open, with the session id on the user', async () => {
    const alice = await makeUser('alice');
    const { sessionId, token } = await login(alice, 'alice');
    expect(await validateAccessToken(token)).toMatchObject({
      id: alice,
      username: 'alice',
      sessionId,
    });
  });

  it('rejects a token once its session is revoked', async () => {
    const alice = await makeUser('alice');
    const { sessionId, token } = await login(alice, 'alice');
    expect(await revokeSession(alice, sessionId)).toBe(true);
    expect(await validateAccessToken(token)).toBeNull();
    // Already over.
    expect(await revokeSession(alice, sessionId)).toBe(false);
  });

  it('rejects a token naming a session that does not exist, or someone else\'s', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const missing = await createAccessToken({
      id: alice,
      username: 'alice',
      email: 'alice@example.test',
      role: 'user',
      sessionId: randomUUID(),
    });
    expect(await validateAccessToken(missing)).toBeNull();

    const bobs = await login(bob, 'bob');
    const borrowed = await createAccessToken({
      id: alice,
      username: 'alice',
      email: 'alice@example.test',
      role: 'user',
      sessionId: bobs.sessionId,
    });
    expect(await validateAccessToken(borrowed)).toBeNull();
    // Nor can one user revoke another's.
    expect(await revokeSession(alice, bobs.sessionId)).toBe(false);
  });

  it('rejects tokens from before sessions existed', async () => {
    const alice = await makeUser('alice');
    const legacy = await new SignJWT({
      id: alice,
      username: 'alice',
      email: 'alice@example.test',
      role: 'user',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET));
    expect(await validateAccessToken(legacy)).toBeNull();
  });

  it('rejects a token after the role changed', async () => {
    const alice = await makeUser('alice');
    const { token } = await login(alice, 'alice');
    await db(`UPDATE app_user SET role = 'admin' WHERE id = $1`, [alice]);
    expect(await validateAccessToken(token)).toBeNull();
  });

  it('writes last_seen_at only when it is more than a few minutes old', async () => {
    const alice = await makeUser('alice');
    const { sessionId, token } = await login(alice, 'alice');

    // Fresh from login, and recently active: a request does not write.
    await db(`UPDATE app_user SET last_active = now() WHERE id = $1`, [alice]);
    const first = await lastSeen(sessionId);
    await validateAccessToken(token);
    expect((await lastSeen(sessionId)).getTime()).toBe(first.getTime());

    // Ten minutes stale: the next request writes, and the one after does not.
    await db(
      `UPDATE user_session SET last_seen_at = now() - interval '10 minutes' WHERE id = $1`,
      [sessionId]
    );
    await db(`UPDATE app_user SET last_active = now() WHERE id = $1`, [alice]);
    const stale = await lastSeen(sessionId);
    await validateAccessToken(token);
    const touched = await lastSeen(sessionId);
    expect(touched.getTime()).toBeGreaterThan(stale.getTime() + 9 * 60 * 1000);
    await validateAccessToken(token);
    expect((await lastSeen(sessionId)).getTime()).toBe(touched.getTime());
  });

  it('logs out everywhere else, keeping this session', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const here = await login(alice, 'alice');
    const phone = await login(alice, 'alice');
    const laptop = await login(alice, 'alice');
    const bobs = await login(bob, 'bob');

    expect(await revokeOtherSessions(alice, here.sessionId)).toBe(2);
    expect(await validateAccessToken(here.token)).not.toBeNull();
    expect(await validateAccessToken(phone.token)).toBeNull();
    expect(await validateAccessToken(laptop.token)).toBeNull();
    // Nobody else's.
    expect(await validateAccessToken(bobs.token)).not.toBeNull();
    expect((await listSessions(alice)).map((session) => session.id)).toEqual([here.sessionId]);
  });

  it('lists open sessions with a coarse network, leaving out long-unseen ones', async () => {
    const alice = await makeUser('alice');
    const recent = await login(alice, 'alice', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0');
    const old = await login(alice, 'alice');
    await db(
      `UPDATE user_session SET last_seen_at = now() - interval '8 days' WHERE id = $1`,
      [old.sessionId]
    );
    const sessions = await listSessions(alice);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      id: recent.sessionId,
      network: '203.0.113.0/24',
    });
    expect(describeDevice(sessions[0].userAgent)).toBe('Firefox on Windows');
  });
});

describe('coarseNetwork', () => {
  it('keeps a /24 of IPv4 and a /48 of IPv6, and nothing of garbage', async () => {
    expect(coarseNetwork('198.51.100.7')).toBe('198.51.100.7/24');
    expect(coarseNetwork('::ffff:198.51.100.7')).toBe('198.51.100.7/24');
    expect(coarseNetwork('2001:db8:1234:5678::1')).toBe('2001:db8:1234:5678::1/48');
    expect(coarseNetwork('not an address')).toBeNull();
    expect(coarseNetwork(null)).toBeNull();

    // Postgres does the masking when it is stored.
    const alice = await makeUser('alice');
    await createSession({ userId: alice, userAgent: null, ip: '2001:db8:1234:5678::1' });
    const [session] = await listSessions(alice);
    expect(session.network).toBe('2001:db8:1234::/48');
  });
});

describe('describeDevice', () => {
  it('names common browsers and systems', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
      )
    ).toBe('Safari on iPhone');
    expect(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0'
      )
    ).toBe('Edge on Windows');
    expect(
      describeDevice(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
      )
    ).toBe('Chrome on Android');
    expect(describeDevice(null)).toBe('Unknown device');
    expect(describeDevice('curl/8.0')).toBe('Unknown device');
  });
});
