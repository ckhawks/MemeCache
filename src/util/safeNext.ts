// Where to go after logging in, from ?next=. Only a path on this site: "//evil.com" and
// "/\evil.com" are protocol-relative to a browser, so a second slash or a backslash right
// after the first is refused and the home page is used instead.
export function safeNext(next: unknown): string {
  if (typeof next !== 'string' || !/^\/(?![/\\])/.test(next)) {
    return '/';
  }
  return next;
}
