import Link from 'next/link';
import styles from './FeedReason.module.scss';

// Why a meme is where it is in For you, under its card's title row: the followed tags it
// carries, linked, or a plain line for the memes after them. The feed shows its work.
export default function FeedReason(props: { followedTags: string[] }) {
  if (props.followedTags.length === 0) {
    return <p className={styles.reason}>Outside the tags you follow</p>;
  }
  return (
    <p className={styles.reason}>
      Because you follow{' '}
      {props.followedTags.map((name, i) => (
        <span key={name}>
          {i > 0 && (i === props.followedTags.length - 1 ? ' and ' : ', ')}
          <Link
            href={`/t/${encodeURIComponent(name)}`}
            className={styles.tag}
            onClick={(e) => e.stopPropagation()}
          >
            #{name}
          </Link>
        </span>
      ))}
    </p>
  );
}
