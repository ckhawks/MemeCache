// Why a meme was taken down (migration 018). No server imports, so the admin's form can use
// the same list the route checks against. To add a reason, add it here and to the CHECK on
// meme.takedown_reason.
export const TAKEDOWN_REASONS = [
  'copyright',
  'privacy',
  'legal',
  'other',
] as const;

export type TakedownReason = (typeof TAKEDOWN_REASONS)[number];

// What the admin picks from.
export const TAKEDOWN_REASON_LABELS: Record<TakedownReason, string> = {
  copyright: 'Copyright claim (DMCA)',
  privacy: 'Private information',
  legal: 'Other legal request',
  other: 'Other',
};

// What everyone sees on the meme's page instead of the meme.
export const TAKEDOWN_NOTICES: Record<TakedownReason, string> = {
  copyright: 'This meme was removed because of a copyright claim.',
  privacy: "This meme was removed because it shared someone's private information.",
  legal: 'This meme was removed in response to a legal request.',
  other: 'This meme was removed by the MemeCache admins.',
};
