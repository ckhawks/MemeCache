import Link from 'next/link';
import styles from '../../main.module.scss';
import r from './Reports.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import BackButton from '@/components/BackButton';
import { requireModerator } from '@/server/requireAdmin';
import { isAdmin } from '@/auth/role';
import { countOpenReports, listReportGroups, type ReportGroup } from '@/db/queries/reports';
import { reportReasonLabel } from '@/constants/reports';
import { supportedVideoTypes } from '@/constants/mimeTypes';
import ReportActions from './ReportActions';

export const metadata = {
  title: 'Reports',
};

const STATUS_LABELS = {
  open: 'Open',
  dismissed: 'Dismissed',
  actioned: 'Deleted',
};

// UTC on purpose, and said so: moderators are not all in one place.
function formatWhen(date: Date) {
  return (
    new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }) + ' UTC'
  );
}

// Reported memes, grouped by meme, the most recently reported first. Moderators dismiss the
// reports or delete the meme; either closes every open report on it. The Resolved tab is
// the record of what was decided.
export default async function Reports(props: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireModerator();
  const searchParams = await props.searchParams;
  const view = searchParams.view === 'resolved' ? 'resolved' : 'open';

  const [groups, counts] = await Promise.all([listReportGroups(view), countOpenReports()]);

  const tabClass = (active: boolean) =>
    `${styles.button} ${styles['button-small']} ${active ? '' : styles['button-secondary']}`;

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            {/* The admin index is for admins only. Moderators land here directly. */}
            {isAdmin(user) && <BackButton to="/admin" text="Admin" />}
            <h1>Reports</h1>
            <p style={{ color: 'var(--sub-text-color)' }}>
              Memes members reported. Dismiss leaves the meme up; Delete meme hides it everywhere
              and keeps the file. Both close every open report on that meme.
            </p>
          </div>

          <div className={r.reports}>
            <nav className={r.tabs} aria-label="Reports">
              <Link href="/admin/reports" className={tabClass(view === 'open')} aria-current={view === 'open' ? 'page' : undefined}>
                Open <span className={r.count}>{counts.memes}</span>
              </Link>
              <Link
                href="/admin/reports?view=resolved"
                className={tabClass(view === 'resolved')}
                aria-current={view === 'resolved' ? 'page' : undefined}
              >
                Resolved
              </Link>
            </nav>

            {groups.length === 0 ? (
              <p className={r.muted}>{view === 'open' ? 'Nothing reported right now.' : 'No resolved reports yet.'}</p>
            ) : (
              groups.map((group) => <ReportCard key={group.meme.id} group={group} open={view === 'open'} />)
            )}
          </div>
        </div>
      </main>
      <FooterBar />
    </>
  );
}

function ReportCard(props: { group: ReportGroup; open: boolean }) {
  const { meme, reasons, reports } = props.group;
  const isVideo = supportedVideoTypes.includes(meme.contentType);

  return (
    <article className={r.card}>
      <Link href={`/meme/${meme.slug}`} className={r.thumb}>
        {/* A deleted meme's file is no longer served. */}
        {meme.deleted ? (
          <span className={r.thumbGone}>Deleted</span>
        ) : isVideo ? (
          <video src={`/api/resource/${meme.id}#t=0.1`} preload="metadata" muted />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/resource/${meme.id}`} alt="" loading="lazy" />
        )}
      </Link>

      <div className={r.body}>
        <div className={r.meta}>
          Posted by <Link href={'/me/' + encodeURIComponent(meme.uploaderUsername)}>{meme.uploaderUsername}</Link>
          {' · '}
          {reports.length} {reports.length === 1 ? 'report' : 'reports'}
          {props.open && meme.deleted && ' · already deleted'}
        </div>

        <ul className={r.reasons}>
          {reasons.map((reason) => (
            <li key={reason.reason} className={r.reason}>
              {reportReasonLabel(reason.reason)}
              {reason.count > 1 && <span className={r.count}>{reason.count}</span>}
            </li>
          ))}
        </ul>

        <ul className={r.list}>
          {reports.map((report) => (
            <li key={report.id} className={r.item}>
              <div className={r.meta}>
                <Link href={'/me/' + encodeURIComponent(report.reporterUsername)}>{report.reporterUsername}</Link>
                {' · '}
                {reportReasonLabel(report.reason)}
                {' · '}
                {formatWhen(report.createdAt)}
              </div>
              {report.details && <p className={r.details}>{report.details}</p>}
              {report.status !== 'open' && (
                <div className={r.meta}>
                  {STATUS_LABELS[report.status]}
                  {report.resolvedByUsername && ` by ${report.resolvedByUsername}`}
                  {report.resolvedAt && `, ${formatWhen(report.resolvedAt)}`}
                  {report.resolutionNote && `: ${report.resolutionNote}`}
                </div>
              )}
            </li>
          ))}
        </ul>

        {props.open && <ReportActions memeId={meme.id} />}
      </div>
    </article>
  );
}
