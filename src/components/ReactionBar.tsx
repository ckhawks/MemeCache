'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Smile } from 'react-feather';
import { Theme, type EmojiClickData } from 'emoji-picker-react';
import styles from './ReactionBar.module.scss';
import { api } from '@/util/api';
import { QUICK_REACTIONS } from '@/constants/reactions';
import type { ReactionSummary } from '@/db/queries/reactions';

// The full picker is large, so it loads the first time someone asks for more.
const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

function tooltip(reaction: ReactionSummary) {
  const shown = reaction.names.join(', ');
  const rest = reaction.count - reaction.names.length;
  return `${shown}${rest > 0 ? ` and ${rest} more` : ''} reacted with ${reaction.emoji}`;
}

// The reactions on a meme or a comment (migration 023): a chip per emoji with its count,
// pressed when the viewer is one of them, and a button to add one, which offers a quick row
// and then the full picker. Tapping a chip adds or takes back the viewer's. Changes show at
// once and are put right from the server's answer. Logged out, the chips only show and the
// add button asks them to log in.
export default function ReactionBar(props: {
  // PUT { emoji, reacted } here answers { reactions }.
  endpoint: string;
  initial: ReactionSummary[];
  // Null when logged out.
  viewerName: string | null;
  // Where to send someone logged out who tries to react.
  loginHref: string;
  // Smaller chips, for comments.
  compact?: boolean;
  // The add button's accessible name.
  label?: string;
}) {
  const [reactions, setReactions] = useState(props.initial);
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [error, setError] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const pending = useRef(0);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = async (emoji: string, reacted: boolean) => {
    if (!props.viewerName) {
      return;
    }
    setError('');
    const before = reactions;
    // Shown at once, in the order the server will give.
    setReactions((current) => {
      const found = current.find((r) => r.emoji === emoji);
      if (reacted) {
        if (found) {
          return found.mine
            ? current
            : current.map((r) =>
                r === found ? { ...r, count: r.count + 1, mine: true, names: [...r.names, props.viewerName!] } : r
              );
        }
        return [...current, { emoji, count: 1, mine: true, names: [props.viewerName!] }];
      }
      if (!found || !found.mine) {
        return current;
      }
      return found.count <= 1
        ? current.filter((r) => r !== found)
        : current.map((r) =>
            r === found ? { ...r, count: r.count - 1, mine: false, names: r.names.filter((n) => n !== props.viewerName) } : r
          );
    });
    pending.current += 1;
    try {
      const result = await api<{ reactions: ReactionSummary[] }>(props.endpoint, {
        method: 'PUT',
        body: { emoji, reacted },
      });
      // A later tap's answer is the one to keep.
      if (pending.current === 1) {
        setReactions(result.reactions);
      }
    } catch (err) {
      setReactions(before);
      setError(err instanceof Error ? err.message : 'Could not react.');
    } finally {
      pending.current -= 1;
    }
  };

  const pick = (emoji: string) => {
    setOpen(false);
    setFull(false);
    const existing = reactions.find((r) => r.emoji === emoji);
    // Picking one already given takes it back, like tapping its chip.
    toggle(emoji, !existing?.mine);
  };

  const dark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  const compact = props.compact ? styles.compact : '';

  return (
    <div ref={wrapRef} className={`${styles.bar} ${compact}`}>
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          className={`${styles.chip} ${reaction.mine ? styles.mine : ''}`}
          aria-pressed={reaction.mine}
          aria-label={`${reaction.emoji} ${reaction.count}. ${tooltip(reaction)}`}
          title={tooltip(reaction)}
          disabled={!props.viewerName}
          onClick={() => toggle(reaction.emoji, !reaction.mine)}
        >
          <span className={styles.emoji}>{reaction.emoji}</span>
          <span className={styles.count}>{reaction.count.toLocaleString()}</span>
        </button>
      ))}
      {props.viewerName ? (
        <button
          type="button"
          className={`${styles.chip} ${styles.add}`}
          aria-label={props.label ?? 'Add a reaction'}
          title={props.label ?? 'Add a reaction'}
          aria-expanded={open}
          onClick={() => {
            setOpen((value) => !value);
            setFull(false);
          }}
        >
          <Smile size={props.compact ? 14 : 16} />
          <span className={styles.plus} aria-hidden>
            +
          </span>
        </button>
      ) : (
        reactions.length === 0 &&
        !props.compact && (
          <Link href={props.loginHref} className={`${styles.chip} ${styles.add}`} aria-label="Log in to react" title="Log in to react">
            <Smile size={16} />
            <span className={styles.plus} aria-hidden>
              +
            </span>
          </Link>
        )
      )}
      {open && (
        <div className={styles.popover} role="dialog" aria-label="Pick a reaction">
          <div className={styles.quick}>
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`${styles.quickButton} ${reactions.find((r) => r.emoji === emoji)?.mine ? styles.mine : ''}`}
                aria-label={emoji}
                onClick={() => pick(emoji)}
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              className={styles.more}
              aria-expanded={full}
              onClick={() => setFull((value) => !value)}
            >
              {full ? 'Less' : 'More'}
            </button>
          </div>
          {full && (
            <div className={styles.picker}>
              <EmojiPicker
                onEmojiClick={(data: EmojiClickData) => pick(data.emoji)}
                theme={dark ? Theme.DARK : Theme.LIGHT}
                lazyLoadEmojis
                previewConfig={{ showPreview: false }}
                width="100%"
                height={360}
              />
            </div>
          )}
        </div>
      )}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
