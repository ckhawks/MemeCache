import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import {
  checkInviteCode,
  createInviteCode,
  createInvitedUser,
  generateInviteCode,
  listInviteCodes,
  setInviteCodeDisabled,
} from '@/db/queries/invites';
import { makeUser, resetDatabase } from './fixtures';

beforeEach(resetDatabase);

function newUser(username: string) {
  return {
    username,
    email: `${username}@example.test`,
    passwordHash: 'not-a-real-hash',
  };
}

async function makeInvite(
  adminId: string,
  code: string,
  options: { maxUses?: number | null; expiresAt?: Date | null } = {}
) {
  const created = await createInviteCode({
    code,
    note: null,
    maxUses: options.maxUses ?? null,
    expiresAt: options.expiresAt ?? null,
    createdBy: adminId,
  });
  return created!.id;
}

describe('invite codes', () => {
  it('generates readable codes without 0 O 1 I or lowercase', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateInviteCode()).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    }
  });

  it('keeps codes unique case-insensitively', async () => {
    const admin = await makeUser('admin');
    await makeInvite(admin, 'Friends');
    const again = await createInviteCode({
      code: 'FRIENDS',
      note: null,
      maxUses: null,
      expiresAt: null,
      createdBy: admin,
    });
    expect(again).toBeNull();
  });

  it('signs up with a code in any case, counts the use and records who used it', async () => {
    const admin = await makeUser('admin');
    const id = await makeInvite(admin, 'Friends', { maxUses: 2 });

    expect(await checkInviteCode('friends')).toBe('active');
    const alice = await createInvitedUser(newUser('alice'), 'fRIENDS');
    expect(alice?.username).toBe('alice');

    const [row] = await db<{ invitedBy: string }>(
      `SELECT invited_by_code_id AS "invitedBy" FROM app_user WHERE id = $1`,
      [alice!.id]
    );
    expect(row.invitedBy).toBe(id);

    const [invite] = await listInviteCodes();
    expect(invite).toMatchObject({ uses: 1, maxUses: 2, status: 'active', usedBy: ['alice'], createdBy: 'admin' });
  });

  it('refuses unknown, disabled, expired and used-up codes', async () => {
    const admin = await makeUser('admin');
    await makeInvite(admin, 'ONCE', { maxUses: 1 });
    await makeInvite(admin, 'OLD', { expiresAt: new Date(Date.now() - 1000) });
    const off = await makeInvite(admin, 'OFF');
    await setInviteCodeDisabled(off, true);

    expect(await createInvitedUser(newUser('alice'), 'ONCE')).not.toBeNull();

    expect(await checkInviteCode('NOPE')).toBe('unknown');
    expect(await checkInviteCode('ONCE')).toBe('used-up');
    expect(await checkInviteCode('OLD')).toBe('expired');
    expect(await checkInviteCode('OFF')).toBe('disabled');
    for (const code of ['NOPE', 'ONCE', 'OLD', 'OFF']) {
      expect(await createInvitedUser(newUser(`bob${code}`), code)).toBeNull();
    }
    const [{ count }] = await db<{ count: number }>(`SELECT count(*)::int FROM app_user`);
    expect(count).toBe(2);

    // Turned back on, it works again.
    await setInviteCodeDisabled(off, false);
    expect(await checkInviteCode('OFF')).toBe('active');
    expect(await createInvitedUser(newUser('carol'), 'off')).not.toBeNull();
  });

  it('never goes past max uses when signups race', async () => {
    const admin = await makeUser('admin');
    await makeInvite(admin, 'RACE', { maxUses: 3 });

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createInvitedUser(newUser(`racer${i}`), 'RACE'))
    );
    expect(results.filter((user) => user !== null)).toHaveLength(3);

    const [invite] = await listInviteCodes();
    expect(invite.uses).toBe(3);
    expect(invite.usedBy).toHaveLength(3);
    expect(invite.status).toBe('used-up');
  });

  it('gives the use back when the account cannot be created', async () => {
    const admin = await makeUser('admin');
    await makeInvite(admin, 'ONCE', { maxUses: 1 });

    // admin@example.test is taken: the insert fails and takes the claimed use with it.
    await expect(
      createInvitedUser({ ...newUser('someone'), email: 'admin@example.test' }, 'ONCE')
    ).rejects.toThrow();
    const [invite] = await listInviteCodes();
    expect(invite.uses).toBe(0);
    expect(await createInvitedUser(newUser('alice'), 'ONCE')).not.toBeNull();
  });
});

describe('ACCESS_CODE fallback', () => {
  it('accepts the environment code only while no invite code exists', async () => {
    expect(await checkInviteCode('shared', 'shared')).toBe('active');
    const alice = await createInvitedUser(newUser('alice'), 'shared', 'shared');
    expect(alice).not.toBeNull();
    const [row] = await db<{ invitedBy: string | null }>(
      `SELECT invited_by_code_id AS "invitedBy" FROM app_user WHERE id = $1`,
      [alice!.id]
    );
    expect(row.invitedBy).toBeNull();

    // Any code at all turns it off, even a disabled one.
    const admin = await makeUser('admin');
    const first = await makeInvite(admin, 'FIRST');
    await setInviteCodeDisabled(first, true);
    expect(await checkInviteCode('shared', 'shared')).toBe('unknown');
    expect(await createInvitedUser(newUser('bob'), 'shared', 'shared')).toBeNull();
  });

  it('is exact, and an unset or empty one never matches', async () => {
    expect(await checkInviteCode('SHARED', 'shared')).toBe('unknown');
    expect(await checkInviteCode('', '')).toBe('unknown');
    expect(await checkInviteCode('anything')).toBe('unknown');
    expect(await createInvitedUser(newUser('alice'), '', '')).toBeNull();
  });

  it('does not stop an invite code that happens to equal it', async () => {
    const admin = await makeUser('admin');
    await makeInvite(admin, 'shared', { maxUses: 1 });
    expect(await createInvitedUser(newUser('alice'), 'shared', 'shared')).not.toBeNull();
    // Used up, and the fallback is off now that codes exist.
    expect(await createInvitedUser(newUser('bob'), 'shared', 'shared')).toBeNull();
  });
});
