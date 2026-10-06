import Link from 'next/link';
import { Shuffle } from 'react-feather';
import styles from './FeedSort.module.scss';
import Tooltip from './Tooltip';
import type { FeedSort as Sort } from '@/db/queries/memes';

// Explore's ordering: newest, most liked, a shuffle, or For you (the tags and people you follow
// first).
// Plain links, so a sort is a URL that can be shared. A shuffle carries its seed in the URL
// so paging keeps the same order; `freshSeed` is a new one for "Random" and "Shuffle again".
// For you needs an account, so visitors see it greyed out.
export default function FeedSort(props: {
  basePath: string;
  sort: Sort;
  freshSeed: string;
  signedIn: boolean;
}) {
  const options: { sort: Sort; label: string; href: string }[] = [
    { sort: 'new', label: 'Newest', href: props.basePath },
    { sort: 'top', label: 'Top', href: `${props.basePath}?sort=top` },
    { sort: 'random', label: 'Random', href: `${props.basePath}?sort=random&seed=${props.freshSeed}` },
  ];
  if (props.signedIn) {
    options.push({ sort: 'foryou', label: 'For you', href: `${props.basePath}?sort=foryou` });
  }

  return (
    <div className={styles.wrap}>
      <nav className={styles.sort} aria-label="Sort">
        {options.map((option) => (
          <Link
            key={option.sort}
            href={option.href}
            className={`${styles.option} ${props.sort === option.sort ? styles.active : ''}`}
            aria-current={props.sort === option.sort ? 'page' : undefined}
          >
            {option.label}
          </Link>
        ))}
        {!props.signedIn && (
          <Tooltip label="Log in to get a feed from the tags and people you follow">
            <span className={`${styles.option} ${styles.disabled}`} aria-disabled="true">
              For you
            </span>
          </Tooltip>
        )}
      </nav>
      {props.sort === 'random' && (
        <Link href={`${props.basePath}?sort=random&seed=${props.freshSeed}`} className={styles.shuffle}>
          <Shuffle size={14} /> Shuffle again
        </Link>
      )}
    </div>
  );
}
