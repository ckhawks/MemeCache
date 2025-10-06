import { Plus } from 'react-feather';
import styles from '../app/main.module.scss';

export function TagChip(props: { tag: string }) {
  //  ${styles.active} goes on tag-chip

  return (
    <div className={`${styles['tag-chip']}`}>
      <span>{props.tag}</span>
      <Plus size={12} className={`${styles['tag-action-icon']}`} />
    </div>
  );
}
