import { anonymiseUser } from '@/db/queries/accounts';
import { markTakenDown } from '@/db/queries/takedowns';
import type { TakedownReason } from '@/constants/takedowns';
import { DeleteS3ObjectByKey } from '@/util/s3/DeleteS3ObjectByKey';
import { HttpError } from './route';

// The parts of deleting an account and taking a meme down that touch storage as well as the
// database (migration 018). The database work commits first; the file goes after, since
// storage cannot roll back with it.

// Anonymises an account and deletes its avatar file. Returns the placeholder name.
export async function deleteAccount(options: {
  userId: string;
  deletedBy: string;
  reason?: string | null;
}): Promise<string> {
  const result = await anonymiseUser(options);
  if (!result.ok) {
    throw result.reason === 'not-found'
      ? new HttpError(404, 'That user does not exist.')
      : new HttpError(409, 'That account is already deleted.');
  }
  // Best effort: a leftover file is not linked from anywhere any more (the key was in the
  // row that now holds null). DeleteS3ObjectByKey logs a failure.
  if (result.avatarKey) {
    await DeleteS3ObjectByKey(result.avatarKey);
  }
  return result.username;
}

// Takes a meme down and deletes its file. Throws when the file could not be deleted, after
// the meme is already marked, so the admin knows to try again; trying again only retries
// the file.
export async function takeDownMeme(options: {
  memeId: string;
  reason: TakedownReason;
  note: string | null;
  adminId: string;
}) {
  const marked = await markTakenDown(options);
  if (!marked) {
    throw new HttpError(404, 'That meme does not exist.');
  }
  const deleted = await DeleteS3ObjectByKey(marked.s3Key);
  if (!deleted) {
    throw new HttpError(
      502,
      'The meme is taken down, but its file could not be deleted from storage. Try again.'
    );
  }
}
