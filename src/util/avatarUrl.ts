// Every upload stores the avatar under a new S3 key ending in a random UUID, so the key's
// tail names one exact image. Putting it in the URL means a new avatar gets a new URL,
// and the avatar route can let browsers cache each version forever.
export function avatarUrl(username: string, avatarKey: string | null) {
  const version = avatarKey ? avatarKey.slice(-12) : 'default';
  return '/api/resource/avatar/' + encodeURIComponent(username) + '?v=' + encodeURIComponent(version);
}
