// Content warnings: the fixed set of labels a meme can carry, separate from tags. A meme
// with any label in BLURRING_WARNINGS is blurred until the viewer chooses to look (see
// WarningCover); the rest, like AI-made, are only shown as a badge. To add a type, add it
// here with its label; the database takes any value this list allows.
export const CONTENT_WARNINGS = [
  'nsfw',
  'gore',
  'flashing',
  'spoiler',
  'ai',
] as const;

export type ContentWarning = (typeof CONTENT_WARNINGS)[number];

export const WARNING_LABELS: Record<ContentWarning, string> = {
  nsfw: 'NSFW',
  gore: 'Gore',
  flashing: 'Flashing lights',
  spoiler: 'Spoiler',
  ai: 'AI-made',
};

// Labels that hide the meme until clicked. AI-made only says what it is.
export const BLURRING_WARNINGS: readonly ContentWarning[] = [
  'nsfw',
  'gore',
  'flashing',
  'spoiler',
];

export function blursMeme(warning: ContentWarning) {
  return BLURRING_WARNINGS.includes(warning);
}

export function isContentWarning(value: unknown): value is ContentWarning {
  return typeof value === 'string' && (CONTENT_WARNINGS as readonly string[]).includes(value);
}

// A member's choice of how warned memes are shown. Visitors always get 'blur'.
export const WARNING_DISPLAYS = [
  'blur',
  'hover',
  'show',
] as const;

export type WarningDisplay = (typeof WARNING_DISPLAYS)[number];
