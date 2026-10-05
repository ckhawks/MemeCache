import { db } from '@/db/db';
import { isUuid } from './ids';
import type { ReportReason, ReportStatus } from '@/constants/reports';

// Reports on memes (migration 008). A member has at most one open report per meme;
// resolving sets a status on the rows and never deletes them.

export interface OwnReport {
  reason: ReportReason;
  details: string | null;
}

export interface ReportRow {
  id: string;
  reason: ReportReason;
  details: string | null;
  reporterUsername: string;
  createdAt: Date;
  status: ReportStatus;
  resolvedByUsername: string | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
}

export interface ReportGroup {
  meme: {
    id: string;
    slug: string;
    contentType: string;
    uploaderUsername: string;
    // Deleted already, by a moderator here or by its uploader.
    deleted: boolean;
  };
  // Each reason with how many of the group's reports gave it, most given first.
  reasons: { reason: ReportReason; count: number }[];
  // Newest first.
  reports: ReportRow[];
}

export interface ReportCounts {
  reports: number;
  memes: number;
}

// Files a report, or rewrites the member's open report on this meme.
export async function reportMeme(
  memeId: string,
  reporterId: string,
  reason: ReportReason,
  details: string | null
) {
  await db(
    `INSERT INTO meme_report (meme_id, reporter_id, reason, details)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (meme_id, reporter_id) WHERE status = 'open'
     DO UPDATE SET reason = EXCLUDED.reason, details = EXCLUDED.details, created_at = now()`,
    [memeId, reporterId, reason, details]
  );
}

// The member's open report on a meme, to fill the form in again. Null when there is none.
export async function getOwnOpenReport(memeId: string, reporterId: string): Promise<OwnReport | null> {
  if (!isUuid(memeId) || !isUuid(reporterId)) {
    return null;
  }
  const [row] = await db<OwnReport>(
    `SELECT reason, details
       FROM meme_report
      WHERE meme_id = $1 AND reporter_id = $2 AND status = 'open'`,
    [memeId, reporterId]
  );
  return row ?? null;
}

// For the admin index: open reports, and how many memes they are on.
export async function countOpenReports(): Promise<ReportCounts> {
  const [row] = await db<ReportCounts>(
    `SELECT count(*)::int AS reports,
            count(DISTINCT meme_id)::int AS memes
       FROM meme_report
      WHERE status = 'open'`
  );
  return row;
}

// The review page. Open: every open report, grouped by meme, the meme with the newest
// report first. Resolved: the most recent `limit` resolved reports, grouped the same way
// by when they were resolved.
export async function listReportGroups(view: 'open' | 'resolved', limit = 500): Promise<ReportGroup[]> {
  const rows = await db<
    ReportRow & {
      memeId: string;
      slug: string;
      contentType: string;
      uploaderUsername: string;
      deleted: boolean;
    }
  >(
    `SELECT r.id::text AS id,
            r.reason,
            r.details,
            reporter.username AS "reporterUsername",
            r.created_at AS "createdAt",
            r.status,
            resolver.username AS "resolvedByUsername",
            r.resolved_at AS "resolvedAt",
            r.resolution_note AS "resolutionNote",
            m.id AS "memeId",
            m.slug,
            m.content_type AS "contentType",
            uploader.username AS "uploaderUsername",
            m.deleted_at IS NOT NULL AS deleted
       FROM meme_report r
       JOIN meme m ON m.id = r.meme_id
       JOIN app_user uploader ON uploader.id = m.uploader_id
       JOIN app_user reporter ON reporter.id = r.reporter_id
       LEFT JOIN app_user resolver ON resolver.id = r.resolved_by
      WHERE ($1 = 'open') = (r.status = 'open')
      ORDER BY COALESCE(r.resolved_at, r.created_at) DESC, r.id DESC
      LIMIT $2`,
    [view, limit]
  );

  // Rows arrive newest first, so each meme's first row places its group.
  const groups = new Map<string, ReportGroup>();
  for (const row of rows) {
    let group = groups.get(row.memeId);
    if (!group) {
      group = {
        meme: {
          id: row.memeId,
          slug: row.slug,
          contentType: row.contentType,
          uploaderUsername: row.uploaderUsername,
          deleted: row.deleted,
        },
        reasons: [],
        reports: [],
      };
      groups.set(row.memeId, group);
    }
    group.reports.push({
      id: row.id,
      reason: row.reason,
      details: row.details,
      reporterUsername: row.reporterUsername,
      createdAt: row.createdAt,
      status: row.status,
      resolvedByUsername: row.resolvedByUsername,
      resolvedAt: row.resolvedAt,
      resolutionNote: row.resolutionNote,
    });
    const reason = group.reasons.find((r) => r.reason === row.reason);
    if (reason) {
      reason.count++;
    } else {
      group.reasons.push({ reason: row.reason, count: 1 });
    }
  }

  for (const group of groups.values()) {
    group.reasons.sort((a, b) => b.count - a.count);
  }
  return [...groups.values()];
}

// Closes every open report on a meme with one outcome. Returns how many were closed.
export async function resolveReports(
  memeId: string,
  moderatorId: string,
  status: 'dismissed' | 'actioned',
  note: string | null
): Promise<number> {
  if (!isUuid(memeId)) {
    return 0;
  }
  const rows = await db(
    `UPDATE meme_report
        SET status = $3, resolved_by = $2, resolved_at = now(), resolution_note = $4
      WHERE meme_id = $1 AND status = 'open'
      RETURNING id`,
    [memeId, moderatorId, status, note]
  );
  return rows.length;
}
