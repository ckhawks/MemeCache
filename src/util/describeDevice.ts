// A user agent string as a person would say it: "Firefox on Windows", "Safari on iPhone".
// Rough on purpose. It only has to let someone tell their own devices apart in the list of
// places they are logged in, so it knows the common browsers and systems and says
// "Unknown browser" for the rest. Order matters: Edge and Opera also claim to be Chrome,
// and Chrome claims to be Safari.

const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X|Macintosh/, 'Mac'],
  [/Linux/, 'Linux'],
];

export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) {
    return 'Unknown device';
  }
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser && system) {
    return `${browser} on ${system}`;
  }
  return browser ?? system ?? 'Unknown device';
}
