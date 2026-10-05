// What a username may be. No server imports, so the edit form can check as you type and the
// server checks the same rules.
//
// Registration only requires a name to be non-empty. A new name chosen by renaming also
// has to be usable in a URL without surprises (/me/<name>), so it is limited to letters,
// digits, dots, dashes and underscores. Names people already have are left alone.

export const USERNAME_MAX_LENGTH = 32;

const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

// The problem with a name, or null when it is fine. Trim before calling.
export function usernameProblem(username: string): string | null {
  if (username === '') {
    return 'Please provide a username.';
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return `A username can be at most ${USERNAME_MAX_LENGTH} characters.`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return 'A username can only use letters, numbers, dots, dashes and underscores.';
  }
  return null;
}
