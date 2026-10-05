// Shared by the report form, its API route, the queries and the review page. The ids match
// the CHECK constraint on meme_report.reason (migration 008).

export type ReportReason =
  | 'nsfw_unlabelled'
  | 'not_funny'
  | 'spam'
  | 'private_person'
  | 'illegal'
  | 'other';

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'nsfw_unlabelled', label: 'Not labelled NSFW, or a content warning is missing' },
  { id: 'not_funny', label: 'Not funny: influencer, brand or engagement slop' },
  { id: 'spam', label: 'Spam or a duplicate' },
  { id: 'private_person', label: 'Exposes a private person' },
  { id: 'illegal', label: 'Illegal content' },
  { id: 'other', label: 'Something else' },
];

export const REPORT_REASON_IDS = REPORT_REASONS.map((r) => r.id) as [ReportReason, ...ReportReason[]];

export function reportReasonLabel(id: string): string {
  return REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
}

// The optional note. Same cap as the database's CHECK.
export const REPORT_DETAILS_MAX = 500;

export type ReportStatus = 'open' | 'dismissed' | 'actioned';
