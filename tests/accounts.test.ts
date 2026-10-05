import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { createAccessToken, validateAccessToken } from '@/auth/lib';
import { usernameProblem } from '@/auth/username';
import { anonymiseUser } from '@/db/queries/accounts';
import { getMeme, getMemeMedia, listMemes } from '@/db/queries/memes';
import { createSession, listSessions } from '@/db/queries/sessions';
import { getSettings, setSetting } from '@/db/queries/settings';
import { getTakedown } from '@/db/queries/takedowns';
import { getProfile, getUserForLogin, isUsernameTaken } from '@/db/queries/users';
import { renameUser } from '@/db/queries/usernames';
import { deleteAccount, takeDownMeme } from '@/server/accounts';
import { HttpError } from '@/server/route';
import { DeleteS3ObjectByKey } from '@/util/s3/DeleteS3ObjectByKey';
import { makeMeme, makeUser, resetDatabase } from './fixtures';

// Storage is never called for real.
vi.mock('@/util/s3/DeleteS3ObjectByKey', () => ({
  DeleteS3ObjectByKey: vi.fn(async () => ({})),
}));
const deleteObject = vi.mocked(DeleteS3ObjectByKey);

beforeEach(async () => {
  await resetDatabase();
  deleteObject.mockReset();
  deleteObject.mockResolvedValue({} as Awaited<ReturnType<typeof DeleteS3ObjectByKey>>);
});

async function count(sql: string, params: unknown[]) {
  const [row] = await db<{ count: number }>(`SELECT count(*)::int AS count FROM ${sql}`, params);
  return row.count;
}

// Alice has a bit of everything: an upload with a tag, a transcription and a comment, a
// like and a save of Bob's meme, a followed tag, a setting, an invite code, an old name, a
// notification, an avatar and an open session.
async function busyAlice() {
  const alice = await makeUser('alice');
  const bob = await makeUser('bob');
  const upload = await makeMeme(alice);
  const bobsMeme = await makeMeme(bob);
  const [tag] = await db<{ id: string }>(
    `INSERT INTO tag (name, created_by) VALUES ('cats', $1) RETURNING id`,
    [alice]
  );
  await db(`INSERT INTO meme_tag (meme_id, tag_id, added_by) VALUES ($1, $2, $3)`, [
    bobsMeme,
    tag.id,
    alice,
  ]);
  await db(`INSERT INTO meme_tag_vote (meme_id, tag_id, voter_id, vote) VALUES ($1, $2, $3, 1)`, [
    bobsMeme,
    tag.id,
    alice,
  ]);
  await db(`INSERT INTO meme_transcription (meme_id, text, edited_by) VALUES ($1, 'hi', $2)`, [
    bobsMeme,
    alice,
  ]);
  await db(`INSERT INTO meme_comment (meme_id, author_id, body) VALUES ($1, $2, 'nice')`, [
    bobsMeme,
    alice,
  ]);
  await db(`INSERT INTO meme_like (meme_id, user_id) VALUES ($1, $2)`, [bobsMeme, alice]);
  await db(`INSERT INTO meme_save (meme_id, user_id) VALUES ($1, $2)`, [bobsMeme, alice]);
  await db(`INSERT INTO tag_preference (user_id, tag_id, kind) VALUES ($1, $2, 'follow')`, [
    alice,
    tag.id,
  ]);
  await setSetting(alice, 'theme', 'dark');
  await db(`INSERT INTO invite_code (code, created_by) VALUES ('ALICE1', $1)`, [alice]);
  await db(
    `INSERT INTO notification (user_id, kind, actor_id, meme_id) VALUES ($1, 'like', $2, $3)`,
    [alice, bob, upload]
  );
  // Alice liked Bob's meme: his notification stays, from "deleted user".
  await db(
    `INSERT INTO notification (user_id, kind, actor_id, meme_id) VALUES ($1, 'like', $2, $3)`,
    [bob, alice, bobsMeme]
  );
  await db(
    `INSERT INTO username_history (user_id, old_username, new_username) VALUES ($1, 'alice_old', 'alice')`,
    [alice]
  );
  await db(`UPDATE app_user SET avatar_s3_key = 'avatars/alice-1', password_hash = 'hash' WHERE id = $1`, [
    alice,
  ]);
  const sessionId = await createSession({ userId: alice, userAgent: null, ip: null });
  const token = await createAccessToken({
    id: alice,
    username: 'alice',
    email: 'alice@example.test',
    role: 'user',
    sessionId,
  });
  return { alice, bob, upload, bobsMeme, tagId: tag.id, token };
}

describe('deleting an account', () => {
  it('keeps the content and removes the identity', async () => {
    const { alice, bob, upload, bobsMeme, token } = await busyAlice();

    const username = await deleteAccount({ userId: alice, deletedBy: alice });
    expect(username).toBe('deleted-' + alice.replace(/-/g, '').slice(0, 8));

    // Identity gone.
    const [row] = await db<Record<string, unknown>>(
      `SELECT username, email, password_hash, avatar_s3_key, deleted_at, deleted_by, deletion_reason
         FROM app_user WHERE id = $1`,
      [alice]
    );
    expect(row.username).toBe(username);
    expect(row.email).toMatch(/@deleted\.invalid$/);
    expect(row.password_hash).toBeNull();
    expect(row.avatar_s3_key).toBeNull();
    expect(row.deleted_at).not.toBeNull();
    expect(row.deleted_by).toBe(alice);
    expect(row.deletion_reason).toBeNull();
    expect(deleteObject).toHaveBeenCalledWith('avatars/alice-1');
    expect(await count(`username_history WHERE user_id = $1`, [alice])).toBe(0);
    expect(await getProfile(username)).toMatchObject({ id: alice, avatarS3Key: null });
    expect((await getProfile(username))?.deletedAt).not.toBeNull();
    expect(await getProfile('alice')).toBeNull();

    // What was only theirs is gone.
    expect(await count(`meme_save WHERE user_id = $1`, [alice])).toBe(0);
    expect(await count(`tag_preference WHERE user_id = $1`, [alice])).toBe(0);
    expect(await count(`user_setting WHERE user_id = $1`, [alice])).toBe(0);
    expect(await count(`notification WHERE user_id = $1`, [alice])).toBe(0);
    expect(await count(`invite_code WHERE created_by = $1 AND disabled_at IS NULL`, [alice])).toBe(0);
    expect(await getSettings(alice)).toEqual({ warning_display: 'blur', theme: null });

    // What they gave everyone stays.
    expect(await getMeme(upload)).toMatchObject({ uploaderId: alice, username });
    expect(await count(`meme_tag WHERE added_by = $1`, [alice])).toBe(1);
    expect(await count(`meme_tag_vote WHERE voter_id = $1`, [alice])).toBe(1);
    expect(await count(`meme_transcription WHERE edited_by = $1`, [alice])).toBe(1);
    expect(await count(`meme_comment WHERE author_id = $1 AND deleted_at IS NULL`, [alice])).toBe(1);
    expect(await count(`meme_like WHERE user_id = $1`, [alice])).toBe(1);
    expect(await count(`notification WHERE user_id = $1 AND actor_id = $2`, [bob, alice])).toBe(1);
    expect(await getMeme(bobsMeme)).not.toBeNull();

    // Logged out everywhere, and can never log in again.
    expect(await validateAccessToken(token)).toBeNull();
    expect(await listSessions(alice)).toEqual([]);
    expect(await getUserForLogin('alice@example.test')).toBeNull();
    expect(await getUserForLogin(row.email as string)).toBeNull();
    // A token for a session made after the fact (it cannot be, but still) is refused.
    const late = await createSession({ userId: alice, userAgent: null, ip: null });
    expect(
      await validateAccessToken(
        await createAccessToken({ id: alice, username, email: '', role: 'user', sessionId: late })
      )
    ).toBeNull();
  });

  it('never lets anyone else have the placeholder name', async () => {
    const { alice, bob } = await busyAlice();
    const username = await deleteAccount({ userId: alice, deletedBy: alice });

    expect(await isUsernameTaken(username)).toBe(true);
    expect(await isUsernameTaken(username.toUpperCase())).toBe(true);
    // Any name that looks like a deleted account's, not just this one.
    expect(await isUsernameTaken('deleted-somebody')).toBe(true);
    expect(usernameProblem('deleted-somebody')).not.toBeNull();
    expect(await renameUser({ userId: bob, username, byAdmin: true })).toMatchObject({
      ok: false,
      reason: 'taken',
    });
    // And the deleted account cannot be renamed out of it.
    expect(await renameUser({ userId: alice, username: 'alice2', byAdmin: true })).toMatchObject({
      ok: false,
      reason: 'not-found',
    });
    // Their old name, on the other hand, is free.
    expect(await isUsernameTaken('alice')).toBe(false);
  });

  it('records an admin deletion and its reason, and refuses to do it twice', async () => {
    const { alice } = await busyAlice();
    const admin = await makeUser('admin');
    await deleteAccount({ userId: alice, deletedBy: admin, reason: 'Spam account' });
    const [row] = await db<{ deletedBy: string; reason: string }>(
      `SELECT deleted_by AS "deletedBy", deletion_reason AS reason FROM app_user WHERE id = $1`,
      [alice]
    );
    expect(row).toEqual({ deletedBy: admin, reason: 'Spam account' });

    await expect(deleteAccount({ userId: alice, deletedBy: admin })).rejects.toMatchObject({
      status: 409,
    });
    expect(await anonymiseUser({ userId: 'nope', deletedBy: admin })).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });
});

describe('taking a meme down', () => {
  it('deletes the file, hides the meme, and keeps the row with why', async () => {
    const alice = await makeUser('alice');
    const admin = await makeUser('admin');
    const meme = await makeMeme(alice);
    const [{ slug, s3Key }] = await db<{ slug: string; s3Key: string }>(
      `SELECT slug, s3_key AS "s3Key" FROM meme WHERE id = $1`,
      [meme]
    );
    await db(`INSERT INTO meme_transcription (meme_id, text, edited_by) VALUES ($1, 'words', $2)`, [
      meme,
      alice,
    ]);

    await takeDownMeme({ memeId: meme, reason: 'copyright', note: 'Notice #12', adminId: admin });

    expect(deleteObject).toHaveBeenCalledWith(s3Key);
    expect(await getMeme(meme)).toBeNull();
    expect(await getMemeMedia(meme)).toBeNull();
    expect((await listMemes({})).memes).toEqual([]);
    expect(await getTakedown(slug)).toMatchObject({ id: meme, reason: 'copyright' });
    expect(await getTakedown(meme)).toMatchObject({ slug });
    const [row] = await db<Record<string, unknown>>(
      `SELECT takedown_note, taken_down_by, deleted_at FROM meme WHERE id = $1`,
      [meme]
    );
    expect(row).toMatchObject({ takedown_note: 'Notice #12', taken_down_by: admin });
    expect(row.deleted_at).not.toBeNull();
    // The rows about it stay, for the record.
    expect(await count(`meme_transcription WHERE meme_id = $1`, [meme])).toBe(1);
  });

  it('is not the same as a plain delete', async () => {
    const alice = await makeUser('alice');
    const meme = await makeMeme(alice);
    await db(`UPDATE meme SET deleted_at = now() WHERE id = $1`, [meme]);
    expect(await getTakedown(meme)).toBeNull();
  });

  it('says so when the file could not be deleted, and a retry tries the file again', async () => {
    const alice = await makeUser('alice');
    const admin = await makeUser('admin');
    const meme = await makeMeme(alice);

    deleteObject.mockResolvedValueOnce(undefined);
    const failed = takeDownMeme({ memeId: meme, reason: 'privacy', note: null, adminId: admin });
    await expect(failed).rejects.toBeInstanceOf(HttpError);
    await expect(failed).rejects.toMatchObject({ status: 502 });
    // Marked anyway, so it is already hidden.
    expect(await getTakedown(meme)).toMatchObject({ reason: 'privacy' });

    // The retry keeps the first record.
    await takeDownMeme({ memeId: meme, reason: 'other', note: 'again', adminId: admin });
    expect(deleteObject).toHaveBeenCalledTimes(2);
    expect(await getTakedown(meme)).toMatchObject({ reason: 'privacy' });
  });

  it('404s for a meme that does not exist', async () => {
    const admin = await makeUser('admin');
    await expect(
      takeDownMeme({ memeId: '00000000-0000-4000-8000-000000000000', reason: 'copyright', note: null, adminId: admin })
    ).rejects.toMatchObject({ status: 404 });
    expect(deleteObject).not.toHaveBeenCalled();
  });
});
