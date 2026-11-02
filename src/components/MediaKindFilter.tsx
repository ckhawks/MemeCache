import Link from 'next/link';
import styles from './FeedSort.module.scss';
import type { MediaKind } from '@/db/queries/memes';

// Explore's file type filter: everything, still images, GIFs (and silent videos, which play
// like them), or videos. Plain links like FeedSort, so a filter is a URL that can be shared.
// `params` is the sort (and a shuffle's seed), kept when the type changes. Paging starts over.
export default function MediaKindFilter(props: {
  basePath: string;
  kind: MediaKind | undefined;
  params?: Record<string, string>;
}) {
  const options: { kind: MediaKind | undefined; label: string }[] = [
    { kind: undefined, label: 'All' },
    { kind: 'image', label: 'Images' },
    { kind: 'gif', label: 'GIFs' },
    { kind: 'video', label: 'Videos' },
  ];
  const href = (kind: MediaKind | undefined) => {
    const query = new URLSearchParams(props.params);
    if (kind) {
      query.set('type', kind);
    }
    const text = query.toString();
    return text ? `${props.basePath}?${text}` : props.basePath;
  };

  return (
    <nav className={styles.sort} aria-label="File type">
      {options.map((option) => (
        <Link
          key={option.label}
          href={href(option.kind)}
          className={`${styles.option} ${props.kind === option.kind ? styles.active : ''}`}
          aria-current={props.kind === option.kind ? 'page' : undefined}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
