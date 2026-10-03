import { listMemes } from '@/db/queries/memes';
import { supportedImageTypes } from '@/constants/mimeTypes';
import styles from './MemeWall.module.scss';

const COLUMNS = 4;

// A slowly drifting wall of real memes, for the login, register and signed-out home
// pages. Pure CSS animation; each column is doubled so the loop is seamless, and it
// holds still for people who prefer reduced motion. Decorative, so hidden from screen
// readers.
export default async function MemeWall(props: { className?: string }) {
  const { memes } = await listMemes({}, null, 40);
  const images = memes.filter((m) => supportedImageTypes.includes(m.contentType)).slice(0, 16);
  if (images.length === 0) {
    return <div className={`${styles.wall} ${props.className ?? ''}`} aria-hidden="true" />;
  }

  const columns = Array.from({ length: COLUMNS }, (_, c) =>
    images.filter((_, i) => i % COLUMNS === c)
  ).filter((column) => column.length > 0);

  return (
    <div className={`${styles.wall} ${props.className ?? ''}`} aria-hidden="true">
      <div className={styles.tilt}>
        {columns.map((column, c) => (
          <div
            key={c}
            className={`${styles.column} ${c % 2 === 1 ? styles.reverse : ''}`}
            style={{ animationDuration: `${70 + c * 12}s` }}
          >
            {[...column, ...column].map((meme, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${meme.id}-${i}`}
                src={`/api/resource/${meme.id}`}
                alt=""
                className={styles.tile}
                loading={i < column.length ? 'eager' : 'lazy'}
              />
            ))}
          </div>
        ))}
      </div>
      <div className={styles.shade} />
    </div>
  );
}
