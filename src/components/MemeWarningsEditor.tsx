'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'react-feather';
import main from '@/app/main.module.scss';
import styles from './MemeTagsEditor.module.scss';
import { WarningChip } from './WarningChip';
import { WarningToggles } from './WarningToggles';
import { api } from '@/util/api';
import { CONTENT_WARNINGS, type ContentWarning } from '@/constants/contentWarnings';
import type { MemeWarning } from '@/db/queries/warnings';

// The meme's content warnings on its page, ending in a "+ Content warning" chip that opens
// a button per type. Any member can add one; whoever added it, or a moderator, can take it
// off. After a change the page refreshes, so the meme above is blurred (or not) to match.
export default function MemeWarningsEditor(props: {
  memeId: string;
  userId: string;
  initial: MemeWarning[];
  canModerate?: boolean;
}) {
  const router = useRouter();
  const [warnings, setWarnings] = useState<MemeWarning[]>(props.initial);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signedIn = props.userId !== '';

  // Visitors only see warnings that are there; nothing to show, nothing to render.
  if (!signedIn && warnings.length === 0) {
    return null;
  }

  const change = async (request: () => Promise<unknown>, failure: string) => {
    setError('');
    setBusy(true);
    try {
      await request();
      const data = await api<{ warnings: MemeWarning[] }>(`/api/meme/${props.memeId}/warnings`);
      setWarnings(data.warnings);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    } finally {
      setBusy(false);
    }
  };

  const add = (warning: ContentWarning) => {
    setAdding(false);
    change(
      () => api(`/api/meme/${props.memeId}/warnings`, { body: { warning } }),
      'Failed to add the warning.'
    );
  };

  const remove = (warning: ContentWarning) =>
    change(
      () => api(`/api/meme/${props.memeId}/warnings/${warning}`, { method: 'DELETE' }),
      'Failed to remove the warning.'
    );

  const present = warnings.map((w) => w.warning);

  return (
    <section className={styles.section}>
      <div className={styles['tags-list']}>
        {warnings.map((w) => (
          <WarningChip
            key={w.warning}
            warning={w.warning}
            hint={w.addedByUsername ? `Added by ${w.addedByUsername}` : undefined}
            onRemove={w.own || props.canModerate ? remove : undefined}
          />
        ))}
        {signedIn && !adding && present.length < CONTENT_WARNINGS.length && (
          <button
            type="button"
            className={styles['add-chip']}
            onClick={() => setAdding(true)}
            disabled={busy}
          >
            <Plus size={12} /> Content warning
          </button>
        )}
      </div>
      {adding && (
        <div className={styles['tags-list']}>
          <WarningToggles selected={[]} exclude={present} onToggle={add} disabled={busy} />
          <button
            type="button"
            className={`${main['button']} ${main['button-secondary']} ${main['button-small']}`}
            onClick={() => setAdding(false)}
          >
            Cancel
          </button>
        </div>
      )}
      {error && <div className={styles.error}>{error}</div>}
    </section>
  );
}
