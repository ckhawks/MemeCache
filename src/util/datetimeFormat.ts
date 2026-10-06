// datetimeFormat.ts

// Add this new function
export function getServerSideRelativeTime(date: Date): string {
  const now = new Date();
  return getRelativeTimeString(date, now);
}

/**
 * Convert a date to a relative time string, such as
 * "a minute ago", "in 2 hours", "yesterday", "3 months ago", etc.
 * using Intl.RelativeTimeFormat
 */
export function getRelativeTimeString(
  date: Date,
  now: Date = new Date()
): string {
  // Stored times are timestamptz (migration 002), so a Date here is already the right
  // instant. This used to subtract 5 hours for a central-time column that no longer exists,
  // which made everything read 5 hours older, and it changed the caller's Date in place.
  const timeMs = typeof date === 'number' ? date : new Date(date).getTime();

  // Get the amount of seconds between the given date and now
  const deltaSeconds = Math.round((timeMs - now.getTime()) / 1000);

  // Array reprsenting one minute, hour, day, week, month, etc in seconds
  const cutoffs = [
    60,
    3600,
    86400,
    86400 * 7,
    86400 * 30,
    86400 * 365,
    Infinity,
  ];

  // Array equivalent to the above but in the string representation of the units
  const units: Intl.RelativeTimeFormatUnit[] = [
    'second',
    'minute',
    'hour',
    'day',
    'week',
    'month',
    'year',
  ];

  // Grab the ideal cutoff unit
  const unitIndex = cutoffs.findIndex(
    (cutoff) => cutoff > Math.abs(deltaSeconds)
  );

  // Get the divisor to divide from the seconds. E.g. if our unit is "day" our divisor
  // is one day in seconds, so we can divide our seconds by this to get the # of days
  const divisor = unitIndex ? cutoffs[unitIndex - 1] : 1;

  // Intl.RelativeTimeFormat do its magic
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  // trunc, not floor: floor rounds a past time away from zero, so 90 seconds ago read as
  // "2 minutes ago".
  return rtf.format(Math.trunc(deltaSeconds / divisor), units[unitIndex]);
}

// "just now", "5 minutes ago", "yesterday", "3 weeks ago". Unlike the two above it leaves
// its argument alone and applies no time zone offset: timestamptz values arrive as the
// right instant already. Takes a string too, for dates that came through JSON.
export function timeAgo(value: Date | string, now: number = Date.now()): string {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  if (Math.abs(seconds) < 60) {
    return 'just now';
  }
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 86400 * 365],
    ['month', 86400 * 30],
    ['week', 86400 * 7],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const [unit, size] = units.find(([, unitSeconds]) => Math.abs(seconds) >= unitSeconds)!;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  return rtf.format(Math.trunc(seconds / size), unit);
}

// The compact form for feed cards: "now", "5m", "3h", "2d", "3w", then the date itself
// ("Sep 4", or "Sep 4, 2025" for an earlier year), which says more than "5 months ago".
export function shortTimeAgo(value: Date | string, now: number = Date.now()): string {
  const date = new Date(value);
  const seconds = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (seconds < 60) {
    return 'now';
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h`;
  }
  if (seconds < 86400 * 7) {
    return `${Math.floor(seconds / 86400)}d`;
  }
  if (seconds < 86400 * 30) {
    return `${Math.floor(seconds / (86400 * 7))}w`;
  }
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
