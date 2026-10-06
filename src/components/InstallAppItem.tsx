'use client';

import { useState, useSyncExternalStore } from 'react';
import { Download, Share } from 'react-feather';
import styles from './NavigationBar.module.scss';
import {
  canPromptInstall,
  isInstalled,
  isIos,
  promptInstall,
  subscribeInstallPrompt,
} from '@/util/installPrompt';

type InstallWay = 'prompt' | 'ios' | null;

function installWay(): InstallWay {
  if (isInstalled()) {
    return null;
  }
  if (canPromptInstall()) {
    return 'prompt';
  }
  return isIos() ? 'ios' : null;
}

// "Install app" in the user menu. Where the browser can install (Chrome and Edge) it opens
// the browser's own dialog; on iPhone, where only Safari's Share menu can, it says how.
// Hidden inside the installed app and in browsers that cannot install at all.
export default function InstallAppItem() {
  const way = useSyncExternalStore(subscribeInstallPrompt, installWay, () => null);
  const [showSteps, setShowSteps] = useState(false);

  if (way === null) {
    return null;
  }

  if (way === 'prompt') {
    return (
      <button type="button" className={styles['menu-item']} role="menuitem" onClick={() => void promptInstall()}>
        <Download size={14} /> Install app
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className={styles['menu-item']}
        role="menuitem"
        aria-expanded={showSteps}
        onClick={() => setShowSteps((open) => !open)}
      >
        <Download size={14} /> Install app
      </button>
      {showSteps && (
        <p className={styles['menu-note']}>
          In Safari, tap <Share size={12} aria-label="Share" /> Share, then Add to Home Screen.
        </p>
      )}
    </>
  );
}
