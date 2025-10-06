// import { Plus } from 'react-feather';
// import styles from '../app/main.module.scss';

// export function TagChip(props: { tag: string }) {
//   //  ${styles.active} goes on tag-chip

//   return (
//     <div className={`${styles['tag-chip']}`}>
//       <span>{props.tag}</span>
//       <Plus size={12} className={`${styles['tag-action-icon']}`} />
//     </div>
//   );
// }

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
  return (
    <Link href={`/t/${tag.name}`} className={`${styles['tag-chip']}`}>
      <span>
        {tag.name} {tag.score}
      </span>
      {disableVote && (
        <div className={styles['tag-actions']}>
          <ArrowUp
            size={12}
            className={styles['tag-action-icon']}
            onClick={(e) => { e.stopPropagation(); onVote(tag.id, 1) }}
          />
          <ArrowDown
            size={12}
            className={styles['tag-action-icon']}
            onClick={(e) => { e.stopPropagation(); onVote(tag.id, -1) }}
          />
        </div>
      )}
    </Link>
  );
}
