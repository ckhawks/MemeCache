import Link from 'next/link';
import { Shuffle } from 'react-feather';
import styles from './FeedSort.module.scss';
import Tooltip from './Tooltip';
import type { FeedSort as Sort } from '@/db/queries/memes';

// Explore's ordering: newest, most liked, or a shuffle. Plain links, so a sort is a URL that
// can be shared. A shuffle carries its seed in the URL so paging keeps the same order;
// `freshSeed` is a new one for "Random" and "Shuffle again".
export default function FeedSort(props: { basePath: string; sort: Sort; freshSeed: string }) {
  const options: { sort: Sort; label: string; href: string }[] = [
    { sort: 'new', label: 'Newest', href: props.basePath },
    { sort: 'top', label: 'Top', href: `${props.basePath}?sort=top` },
    { sort: 'random', label: 'Random', href: `${props.basePath}?sort=random&seed=${props.freshSeed}` },
  ];

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
        <Tooltip label="Coming later: picked from what you like and the tags you follow">
          <span className={`${styles.option} ${styles.disabled}`} aria-disabled="true">
            For you
          </span>
        </Tooltip>
      </nav>
      {props.sort === 'random' && (
        <Link href={`${props.basePath}?sort=random&seed=${props.freshSeed}`} className={styles.shuffle}>
          <Shuffle size={14} /> Shuffle again
        </Link>
      )}
    </div>
  );
}
