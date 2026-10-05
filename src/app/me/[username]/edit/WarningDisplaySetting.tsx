'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import main from '../../../main.module.scss';
import list from '@/components/MemeTagsEditor.module.scss';
import f from '@/components/AuthForm.module.scss';
import { api } from '@/util/api';
import { WARNING_DISPLAYS, type WarningDisplay } from '@/constants/contentWarnings';

const OPTIONS: Record<WarningDisplay, { label: string; description: string }> = {
  blur: {
    label: 'Blur',
    description: 'Memes with a content warning stay blurred until you click one.',
  },
  hover: {
    label: 'Show on hover',
    description:
      'Blurred, and shown while your pointer is over them. On a touch screen you still tap to see one.',
  },
  show: {
    label: 'Never blur',
    description: 'Show them as they are. The warning labels stay on the meme page.',
  },
};

// How memes with content warnings are shown to you. The choice saves straight away and the
// page refreshes, so every feed picks it up.
export default function WarningDisplaySetting(props: { display: WarningDisplay }) {
  const router = useRouter();
  const [display, setDisplay] = useState<WarningDisplay>(props.display);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const change = async (next: WarningDisplay) => {
    setError('');
    setBusy(true);
    try {
      await api('/api/user/warning-display', { body: { display: next } });
      setDisplay(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the setting.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={f.form}>
      <div className={list['tags-list']} role="group" aria-label="Content warnings">
        {WARNING_DISPLAYS.map((option) => (
          <button
            key={option}
            type="button"
            className={`${main['button']} ${main['button-small']} ${
              display === option ? '' : main['button-secondary']
            }`}
            aria-pressed={display === option}
            disabled={busy}
            onClick={() => change(option)}
          >
            {OPTIONS[option].label}
          </button>
        ))}
      </div>
      <span className={f.hint}>{OPTIONS[display].description}</span>
      {error && <span className={f.error}>{error}</span>}
    </div>
  );
}
