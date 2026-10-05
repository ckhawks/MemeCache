'use client';

import { useState } from 'react';
import { EyeOff } from 'react-feather';
import styles from './WarningCover.module.scss';
import { blursMeme, WARNING_LABELS, type ContentWarning } from '@/constants/contentWarnings';
import { useWarningDisplay } from '@/contexts/WarningDisplayContext';

export function warningLabels(warnings: readonly ContentWarning[]) {
  return warnings.map((warning) => WARNING_LABELS[warning] ?? warning).join(' · ');
}

// Blurs a meme that carries content warnings, with its labels on top, until the viewer
// chooses to see it. Clicking reveals this one meme only. The viewer's setting (from the
// account, via WarningDisplayContext) can instead reveal it while hovered, or never blur;
// touch screens have no hover, so there 'hover' behaves like 'blur'. A video under the
// cover only ever shows its first frame, blurred: nothing autoplays.
//
// Labels that do not blur (AI-made), and every label for a viewer who chose never to blur,
// show as a small badge in the corner instead.
//
// `compact` is for small thumbnails inside a link: just the labels, and no button of its
// own, so a click follows the link to the meme page (which is blurred too).
export default function WarningCover(props: {
  warnings: readonly ContentWarning[] | undefined;
  children: React.ReactNode;
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
  // Called when the viewer uncovers it (click, or hover in 'hover' mode), e.g. to count a view.
  onReveal?: () => void;
}) {
  const display = useWarningDisplay();
  const [revealed, setRevealed] = useState(false);
  const warnings = props.warnings ?? [];
  const blurring = display === 'show' ? [] : warnings.filter(blursMeme);
  const badges = warnings.filter((warning) => !blurring.includes(warning));

  if (warnings.length === 0) {
    return <>{props.children}</>;
  }

  if (blurring.length === 0) {
    return (
      <div className={`${styles.labelled} ${props.className ?? ''}`} style={props.style}>
        {props.children}
        <span className={`${styles.badge} ${props.compact ? styles.badgeCompact : ''}`}>
          {warningLabels(badges)}
        </span>
      </div>
    );
  }

  // Under a blur every label is named, AI-made included.
  const labels = warningLabels(warnings);
  const classes = [
    styles.cover,
    display === 'hover' ? styles.hover : '',
    revealed ? styles.revealed : '',
    props.compact ? styles.compact : '',
    props.className ?? '',
  ].join(' ');

  return (
    <div
      className={classes}
      style={props.style}
      onMouseEnter={display === 'hover' ? props.onReveal : undefined}
    >
      {/* Out of the tab order and away from screen readers while covered, so a video's
          controls cannot be reached through the blur. Hover mode leaves it live: the
          pointer is the reveal. */}
      <div className={styles.content} inert={!revealed && display !== 'hover'}>
        {props.children}
      </div>
      {!revealed &&
        (props.compact ? (
          <div className={styles.overlay}>
            <EyeOff size={14} aria-hidden="true" />
            <span className={styles.labels}>{labels}</span>
          </div>
        ) : (
          <button
            type="button"
            className={styles.overlay}
            aria-label={`Show meme marked ${labels}`}
            onClick={(e) => {
              // A feed card opens the meme page on click; this click only reveals.
              e.preventDefault();
              e.stopPropagation();
              setRevealed(true);
              props.onReveal?.();
            }}
          >
            <EyeOff size={20} aria-hidden="true" />
            <span className={styles.labels}>{labels}</span>
            <span className={styles.action}>
              <span className={styles.click}>
                {display === 'hover' ? 'Hover to show' : 'Click to show'}
              </span>
              <span className={styles.tap}>Tap to show</span>
            </span>
          </button>
        ))}
    </div>
  );
}
