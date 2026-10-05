import { usernameProblem } from '@/auth/username';
import { renameUser } from '@/db/queries/usernames';
import { HttpError } from '@/server/route';

function day(date: Date) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// The rename both routes share: check the name, change it, and turn a refusal into the
// message the form shows. Returns the new name.
export async function renameOrThrow(options: {
  userId: string;
  username: string;
  byAdmin?: boolean;
}): Promise<string> {
  const username = options.username.trim();
  const problem = usernameProblem(username);
  if (problem) {
    throw new HttpError(400, problem);
  }

  const result = await renameUser({ ...options, username });
  if (result.ok) {
    return result.username;
  }
  switch (result.reason) {
    case 'not-found':
      throw new HttpError(404, 'That user does not exist.');
    case 'same':
      throw new HttpError(400, 'That is already the username.');
    case 'taken':
      throw new HttpError(409, 'That username is taken.');
    case 'reserved':
      throw new HttpError(
        409,
        `That username belonged to someone else until recently and is held for them until ${day(result.until)}.`
      );
    case 'cooldown':
      throw new HttpError(429, `You can change your username again on ${day(result.until)}.`);
  }
}
