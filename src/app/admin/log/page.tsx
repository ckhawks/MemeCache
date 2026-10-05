import Link from 'next/link';
import styles from '../../main.module.scss';
import l from './Log.module.scss';
import NavigationBar from '@/components/NavigationBar';
import FooterBar from '@/components/FooterBar';
import BackButton from '@/components/BackButton';
import { requireAdmin } from '@/server/requireAdmin';
import {
  listModerationActions,
  type ModerationActionKind,
  type ModerationLogRow,
} from '@/db/queries/moderation';
import { WARNING_LABELS, type ContentWarning } from '@/constants/contentWarnings';

export const metadata = {
  title: 'Moderation log',
};

const ACTION_LABELS: Record<ModerationActionKind, string> = {
  meme_delete: 'deleted a meme',
  report_resolve: 'resolved reports on a meme',
  trust_override: 'changed trust for',
  user_rename: 'renamed',
  invite_create: 'made an invite code',
  invite_disable: 'turned off an invite code',
  invite_enable: 'turned on an invite code',
  tag_remove: 'removed a tag from a meme',
  comment_delete: 'deleted a comment',
  warning_remove: 'removed a content warning from a meme',
};

// UTC on purpose, and said so, like the reports page.
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

function trustLabel(value: unknown) {
  return value === 'trusted' ? 'trusted' : value === 'held' ? 'held' : 'their record';
}

// Everything moderators and admins did with those powers, newest first (migration 017).
// Read-only. Admins only.
export default async function ModerationLog(props: { searchParams: Promise<{ before?: string }> }) {
  await requireAdmin();
  const { before } = await props.searchParams;
  const { rows, nextBefore } = await listModerationActions({ before });

  return (
    <>
      <NavigationBar />
      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.description}>
            <BackButton to="/admin" text="Admin" />
            <h1>Moderation log</h1>
            <p style={{ color: 'var(--sub-text-color)' }}>
              Every action a moderator or admin took on someone else&apos;s content or account, newest first. Nothing here can be changed.
            </p>
          </div>

          <div className={l.log}>
            {rows.length === 0 ? (
              <p className={l.muted}>{before ? 'Nothing older.' : 'Nothing logged yet.'}</p>
            ) : (
              rows.map((row) => <LogRow key={row.id} row={row} />)
            )}
            {nextBefore && (
              <div className={l.pager}>
                <Link
                  href={`/admin/log?before=${nextBefore}`}
                  className={`${styles.button} ${styles['button-small']} ${styles['button-secondary']}`}
                >
                  Older
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>
      <FooterBar />
    </>
  );
}

function LogRow(props: { row: ModerationLogRow }) {
  const { row } = props;
  return (
    <div className={l.row}>
      <div className={l.when}>{formatWhen(row.createdAt)}</div>
      <div className={l.what}>
        {row.actorUsername ? (
          <Link href={'/me/' + encodeURIComponent(row.actorUsername)}>{row.actorUsername}</Link>
        ) : (
          'A deleted account'
        )}{' '}
        <span className={l.action}>{ACTION_LABELS[row.action] ?? row.action}</span> <Target row={row} />
      </div>
      {row.reason && <p className={l.reason}>{row.reason}</p>}
      <Details row={row} />
    </div>
  );
}

function Target(props: { row: ModerationLogRow }) {
  const { row } = props;
  if (row.targetType === 'user') {
    return row.targetUsername ? (
      <Link href={'/me/' + encodeURIComponent(row.targetUsername)}>{row.targetUsername}</Link>
    ) : (
      <>a deleted account</>
    );
  }
  if (row.targetType === 'invite') {
    return typeof row.data.code === 'string' ? <code>{row.data.code}</code> : null;
  }
  // Memes, and comments by the meme they were on. A deleted meme's page no longer opens.
  if (!row.memeSlug) {
    return null;
  }
  return row.memeDeleted ? (
    <span>({row.memeSlug}, now deleted)</span>
  ) : (
    <Link href={`/meme/${row.memeSlug}${row.targetType === 'comment' ? '#comments' : ''}`}>{row.memeSlug}</Link>
  );
}

function Details(props: { row: ModerationLogRow }) {
  const { row } = props;
  const data = row.data;
  let text: string | null = null;
  switch (row.action) {
    case 'trust_override':
      text = `From ${trustLabel(data.from)} to ${trustLabel(data.to)}`;
      break;
    case 'user_rename':
      text = `From ${data.from ?? 'unknown'} to ${data.to}`;
      break;
    case 'tag_remove':
      text = data.tagName ? `Tag: ${data.tagName}` : null;
      break;
    case 'warning_remove':
      text = `Warning: ${WARNING_LABELS[data.warning as ContentWarning] ?? data.warning}`;
      break;
    case 'report_resolve':
      text = `${data.status === 'actioned' ? 'Deleted the meme' : 'Dismissed'}, closing ${data.reports} ${data.reports === 1 ? 'report' : 'reports'}`;
      break;
  }
  return text ? <div className={l.details}>{text}</div> : null;
}
