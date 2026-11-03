// Every upload stores the avatar under a new S3 key ending in a random UUID, so the key's
// tail names one exact image. Putting it in the URL means a new avatar gets a new URL,
// and the avatar route can let browsers cache each version forever.
//
// Without an upload the route draws the member's pattern (src/server/identicon.ts). That
// version is 'pattern' rather than the old 'default', which browsers were told to keep for a
// year and would otherwise go on showing as the one shared placeholder.
export function avatarUrl(username: string, avatarKey: string | null) {
  const version = avatarKey ? avatarKey.slice(-12) : 'pattern';
  return '/api/resource/avatar/' + encodeURIComponent(username) + '?v=' + encodeURIComponent(version);
}
