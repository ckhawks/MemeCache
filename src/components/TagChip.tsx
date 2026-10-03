import { ArrowUp, ArrowDown } from 'react-feather';
import styles from './TagChip.module.scss';
import Link from 'next/link';

interface Tag {
  id: string;
  name: string;
  score: number;
}

interface TagChipProps {
  tag: Tag;
  onVote: (tagId: string, vote: number) => void;
  disableVote?: boolean;
}

export function TagChip({ tag, onVote, disableVote }: TagChipProps) {
  const vote = (event: React.MouseEvent, value: number) => {
    // The chip is a link to the tag page. Without preventDefault a vote also navigates.
    event.preventDefault();
    event.stopPropagation();
    onVote(tag.id, value);
  };

  return (
    <Link
      href={`/t/${encodeURIComponent(tag.name)}`}
      // A tag at 0 or below does not list this meme on its tag page, so it reads as
      // unconfirmed rather than as a dead end.
      className={`${styles['tag-chip']} ${tag.score <= 0 ? styles['unconfirmed'] : ''}`}
    >
      <span>
        {tag.name} {tag.score}
      </span>
      {!disableVote && (
        <span className={styles['tag-actions']}>
          <button
            type="button"
            className={styles['tag-action']}
            aria-label={`Upvote ${tag.name}`}
            onClick={(e) => vote(e, 1)}
          >
            <ArrowUp size={12} className={styles['tag-action-icon']} />
          </button>
          <button
            type="button"
            className={styles['tag-action']}
            aria-label={`Downvote ${tag.name}`}
            onClick={(e) => vote(e, -1)}
          >
            <ArrowDown size={12} className={styles['tag-action-icon']} />
          </button>
        </span>
      )}
    </Link>
  );
}
