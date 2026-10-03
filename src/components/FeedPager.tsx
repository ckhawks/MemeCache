import Link from 'next/link';
import styles from '../app/main.module.scss';

// Links to the next page of a keyset-paginated feed. Renders nothing on the last page.
export default function FeedPager(props: { basePath: string; nextCursor: string | null }) {
  if (!props.nextCursor) {
    return null;
  }

  const href = `${props.basePath}?cursor=${encodeURIComponent(props.nextCursor)}`;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0' }}>
      <Link href={href} className={`${styles['button']} ${styles['button-secondary']}`}>
        Older memes
      </Link>
    </div>
  );
}
