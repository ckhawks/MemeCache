import { ArrowUp, ArrowDown } from 'react-feather';
import styles from './TagChip.module.scss';
import Link from 'next/link';

interface Tag {
  id: string;
  name: string;
  score: number;
  // The viewer's vote on it: 1, -1, or 0 for none.
  myVote?: number;
}

interface TagChipProps {
  tag: Tag;
  onVote: (tagId: string, vote: number) => void;
  disableVote?: boolean;
  // Why voting is off (your own tag, signed out), shown on hover instead of the vote control.
  voteHint?: string;
}

// Every chip looks the same: the tag and its score. Voting lives in a small popover above
// the chip on hover, so chips never change size and rows never jump. Touch screens have no
// hover, so there the arrows sit inline.
export function TagChip({ tag, onVote, disableVote, voteHint }: TagChipProps) {
  const vote = (event: React.MouseEvent, value: number) => {
    event.preventDefault();
    event.stopPropagation();
    // Voting the same way again takes nothing back; the API keeps one vote per person.
    onVote(tag.id, value);
  };

  return (
    <span className={styles['wrap']}>
      <Link
        href={`/t/${encodeURIComponent(tag.name)}`}
        // A tag at 0 or below does not list this meme on its tag page, so it reads as
        // unconfirmed rather than as a dead end.
        className={`${styles['tag-chip']} ${tag.score <= 0 ? styles['unconfirmed'] : ''}`}
      >
        {tag.name}
        <span className={styles['score']}>{tag.score}</span>
      </Link>
      {disableVote ? (
        voteHint && <span className={`${styles['popover']} ${styles['hint']}`}>{voteHint}</span>
      ) : (
        <span className={styles['popover']} role="group" aria-label={`Vote on ${tag.name}`}>
          <button
            type="button"
            className={`${styles['tag-action']} ${tag.myVote === 1 ? styles['voted'] : ''}`}
            aria-label={`Upvote ${tag.name}`}
            aria-pressed={tag.myVote === 1}
            onClick={(e) => vote(e, 1)}
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            className={`${styles['tag-action']} ${tag.myVote === -1 ? styles['voted'] : ''}`}
            aria-label={`Downvote ${tag.name}`}
            aria-pressed={tag.myVote === -1}
            onClick={(e) => vote(e, -1)}
          >
            <ArrowDown size={14} />
          </button>
        </span>
      )}
    </span>
  );
}
