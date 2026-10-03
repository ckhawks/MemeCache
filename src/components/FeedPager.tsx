import Link from 'next/link';
import styles from '../app/main.module.scss';

// Links to the next page of a feed. Newest pages by cursor; Top and Random page by number
// and keep their sort (and a shuffle its seed) in the link. Renders nothing on the last page.
export default function FeedPager(props: {
  basePath: string;
  nextCursor?: string | null;
  nextPage?: number | null;
  sort?: string;
  seed?: string;
}) {
  const params = new URLSearchParams();
  if (props.nextCursor) {
    params.set('cursor', props.nextCursor);
  } else if (props.nextPage != null && props.sort) {
    params.set('sort', props.sort);
    if (props.seed) {
      params.set('seed', props.seed);
    }
    params.set('page', String(props.nextPage));
  } else {
    return null;
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0' }}>
      <Link href={`${props.basePath}?${params}`} className={`${styles['button']} ${styles['button-secondary']}`}>
        {props.nextCursor ? 'Older memes' : 'More memes'}
      </Link>
    </div>
  );
}
