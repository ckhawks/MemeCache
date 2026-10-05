import Link from 'next/link';
import styles from './Notifications.module.scss';
import { avatarUrl } from '@/util/avatarUrl';
import { supportedVideoTypes } from '@/constants/mimeTypes';
import type { NotificationGroup } from '@/db/queries/notifications';

// The lines in the bell's popover and on /notifications. No hooks, so the page renders it
// on the server and the popover on the client. Dates arrive as strings from the API.
type Group = Omit<NotificationGroup, 'createdAt'> & { createdAt: Date | string };

// "alice", "alice and bob", "alice and 3 others".
function people(group: Group) {
  const [first, second] = group.actors;
  if (!first) {
    return <>Someone</>;
  }
  if (group.actorCount === 1) {
    return <strong>{first.username}</strong>;
  }
  if (group.actorCount === 2 && second) {
    return (
      <>
        <strong>{first.username}</strong> and <strong>{second.username}</strong>
      </>
    );
  }
  return (
    <>
      <strong>{first.username}</strong> and {group.actorCount - 1} others
    </>
  );
}

// "cat", "cat and dog", "cat, dog and 2 more".
function tags(names: string[]) {
  if (names.length === 0) {
    return null;
  }
  if (names.length === 1) {
    return <strong>{names[0]}</strong>;
  }
  const shown = names.slice(0, 2);
  const rest = names.length - shown.length;
  return (
    <>
      <strong>{shown[0]}</strong>
      {rest > 0 ? ', ' : ' and '}
      <strong>{shown[1]}</strong>
      {rest > 0 && ` and ${rest} more`}
    </>
  );
}

function sentence(group: Group) {
  switch (group.kind) {
    case 'like':
      return <>{people(group)} liked your meme</>;
    case 'meme_tagged':
      return <>{people(group)} tagged your meme {tags(group.tagNames)}</>;
    case 'meme_transcribed':
      return <>{people(group)} transcribed your meme</>;
    case 'transcription_confirmed':
      return <>{people(group)} confirmed your transcription</>;
    case 'transcription_rejected':
      return <>{people(group)} rejected your transcription</>;
    case 'transcription_fixed':
      return <>{people(group)} fixed your transcription</>;
    case 'tag_confirmed':
      return <>Your tag {tags(group.tagNames)} was confirmed</>;
    case 'tag_removed':
      return <>A moderator removed your tag {tags(group.tagNames)}</>;
    case 'comment':
      return <>{people(group)} commented on your meme</>;
    case 'meme_quoted':
      return <>{people(group)} replied with your meme in a comment</>;
  }
}

// These open the meme page at its comments.
const COMMENT_KINDS: NotificationGroup['kind'][] = ['comment', 'meme_quoted'];

// "just now", "5m", "3h", "2d", then the date.
function ago(value: Date | string) {
  const date = new Date(value);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  if (minutes < 60 * 24) {
    return `${Math.floor(minutes / 60)}h`;
  }
  if (minutes < 60 * 24 * 7) {
    return `${Math.floor(minutes / (60 * 24))}d`;
  }
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

export default function NotificationList(props: { groups: Group[] }) {
  return (
    <ul className={styles['list']}>
      {props.groups.map((group) => {
        const actor = group.actors[0];
        return (
          <li key={group.kind + group.id}>
            <Link
              href={`/meme/${group.memeSlug}${COMMENT_KINDS.includes(group.kind) ? '#comments' : ''}`}
              className={`${styles['item']} ${group.unread ? styles['unread'] : ''}`}
            >
              {actor && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl(actor.username, actor.avatarKey)}
                  width={28}
                  height={28}
                  alt=""
                  className={styles['avatar']}
                />
              )}
              <span className={styles['text']}>
                <span>{sentence(group)}</span>
                <span className={styles['time']}>{ago(group.createdAt)}</span>
              </span>
              {group.unread && <span className={styles['dot']} aria-label="Unread" />}
              {supportedVideoTypes.includes(group.memeContentType) ? (
                <video
                  src={`/api/resource/${group.memeId}#t=0.1`}
                  preload="metadata"
                  muted
                  className={styles['thumb']}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/resource/${group.memeId}`}
                  alt=""
                  loading="lazy"
                  className={styles['thumb']}
                />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
