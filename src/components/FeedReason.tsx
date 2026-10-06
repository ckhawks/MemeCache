import Link from 'next/link';
import styles from './FeedReason.module.scss';

// What put a meme where it is in For you: the people (by display name) and tags the viewer
// follows behind it. Both empty for the memes after the followed part.
export interface FeedReasons {
  followedUsers: string[];
  followedTags: string[];
}

// Why a meme is where it is in For you, under its card's title row: the followed people and
// tags behind it, linked, or a plain line for the memes after them. The feed shows its work.
export default function FeedReason(props: FeedReasons) {
  const links = [
    ...props.followedUsers.map((name) => ({
      key: `@${name}`,
      href: `/me/${encodeURIComponent(name)}`,
      label: `@${name}`,
    })),
    ...props.followedTags.map((name) => ({
      key: `#${name}`,
      href: `/t/${encodeURIComponent(name)}`,
      label: `#${name}`,
    })),
  ];
  if (links.length === 0) {
    return <p className={styles.reason}>Outside what you follow</p>;
  }
  return (
    <p className={styles.reason}>
      Because you follow{' '}
      {links.map((link, i) => (
        <span key={link.key}>
          {i > 0 && (i === links.length - 1 ? ' and ' : ', ')}
          <Link href={link.href} className={styles.tag} onClick={(e) => e.stopPropagation()}>
            {link.label}
          </Link>
        </span>
      ))}
    </p>
  );
}
