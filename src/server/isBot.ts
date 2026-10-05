// Obvious bots, by user agent: crawlers, link preview fetchers, headless browsers and
// scripts. Not a defence, just a filter for the ones that say what they are. A request with
// no user agent at all is treated as one too; every browser sends one.
const BOT_PATTERN =
  /bot|crawl|spider|slurp|scrape|preview|facebookexternalhit|embedly|headless|lighthouse|curl|wget|python|httpclient|okhttp|node-fetch|axios|go-http|java\//i;

export function isBot(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT_PATTERN.test(userAgent);
}
