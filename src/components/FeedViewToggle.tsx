'use client';

import { useRouter } from 'next/navigation';
import { Grid, Square } from 'react-feather';
import styles from './FeedViewToggle.module.scss';
import Tooltip from './Tooltip';
import type { FeedView } from '@/server/feedView';

// Switches galleries between the multi-column grid and a single-column feed. The choice
// goes in a cookie and the server re-renders, so every gallery page follows it.
export default function FeedViewToggle(props: { view: FeedView }) {
  const router = useRouter();

  const choose = (view: FeedView) => {
    if (view === props.view) {
      return;
    }
    document.cookie = `feedView=${view}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  };

  return (
    <div className={styles['toggle']} role="group" aria-label="Layout">
      <Tooltip label="Grid">
        <button
          type="button"
          className={`${styles['option']} ${props.view === 'grid' ? styles['active'] : ''}`}
          aria-label="Grid"
          aria-pressed={props.view === 'grid'}
          onClick={() => choose('grid')}
        >
          <Grid size={14} />
        </button>
      </Tooltip>
      <Tooltip label="Feed" align="end">
        <button
          type="button"
          className={`${styles['option']} ${props.view === 'feed' ? styles['active'] : ''}`}
          aria-label="Feed"
          aria-pressed={props.view === 'feed'}
          onClick={() => choose('feed')}
        >
          <Square size={14} />
        </button>
      </Tooltip>
    </div>
  );
}
