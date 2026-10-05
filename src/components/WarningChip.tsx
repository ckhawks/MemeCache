import { AlertTriangle, X } from 'react-feather';
import styles from './TagChip.module.scss';
import { WARNING_LABELS, type ContentWarning } from '@/constants/contentWarnings';

// A content warning on the meme page. Looks like a tag chip, with a warning icon and no
// score or link: warnings are not voted on and have no page of their own. The remove button
// sits in the same hover popover tag chips use.
export function WarningChip(props: {
  warning: ContentWarning;
  // Shown on hover when there is nothing to do: who added it.
  hint?: string;
  // Given when the viewer may take it off: they added it, or they are a moderator.
  onRemove?: (warning: ContentWarning) => void;
}) {
  const label = WARNING_LABELS[props.warning] ?? props.warning;
  return (
    <span className={styles['wrap']}>
      <span className={styles['tag-chip']}>
        <AlertTriangle size={12} aria-hidden="true" />
        {label}
      </span>
      {props.onRemove ? (
        <span className={styles['popover']} role="group" aria-label={`Actions for ${label}`}>
          <button
            type="button"
            className={`${styles['tag-action']} ${styles['remove']}`}
            aria-label={`Remove the ${label} warning`}
            title="Remove warning"
            onClick={() => props.onRemove?.(props.warning)}
          >
            <X size={14} />
          </button>
        </span>
      ) : (
        props.hint && <span className={`${styles['popover']} ${styles['hint']}`}>{props.hint}</span>
      )}
    </span>
  );
}
