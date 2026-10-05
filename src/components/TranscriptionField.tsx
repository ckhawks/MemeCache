'use client';

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Smile } from 'react-feather';
import { Theme, type EmojiClickData } from 'emoji-picker-react';
import styles from './MemeTranscriptionEditor.module.scss';

// The picker is large, so it loads the first time someone opens it.
const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

// The text box for a meme's transcription, used on the meme page and in the queue, and for
// comments (with their own label and placeholder). Memes are full of emoji, so a picker sits
// in the corner and inserts at the cursor.
export default function TranscriptionField(props: {
  value: string;
  onChange: (value: string) => void;
  // Ctrl/Cmd+Enter, for keyboard-driven flows like the queue.
  onSubmit?: () => void;
  autoFocus?: boolean;
  rows?: number;
  // Defaults are the transcription's.
  label?: string;
  placeholder?: string;
  maxLength?: number;
  onPaste?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
}) {
  const [picking, setPicking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Where the cursor was when the picker opened: focus moves into the picker after that.
  const selectionRef = useRef<[number, number]>([0, 0]);

  useEffect(() => {
    if (!picking) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setPicking(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPicking(false);
        textareaRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [picking]);

  const openPicker = () => {
    const textarea = textareaRef.current;
    selectionRef.current = textarea
      ? [textarea.selectionStart, textarea.selectionEnd]
      : [props.value.length, props.value.length];
    setPicking((open) => !open);
  };

  // Stays open, so several emoji go in one after another.
  const insert = (data: EmojiClickData) => {
    const [start, end] = selectionRef.current;
    const next = props.value.slice(0, start) + data.emoji + props.value.slice(end);
    const cursor = start + data.emoji.length;
    selectionRef.current = [cursor, cursor];
    props.onChange(next);
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(cursor, cursor);
    });
  };

  const dark =
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';

  return (
    <div ref={wrapRef} className={styles['field-wrap']}>
      <textarea
        ref={textareaRef}
        className={styles['transcription-area']}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && props.onSubmit) {
            e.preventDefault();
            props.onSubmit();
          }
        }}
        onPaste={props.onPaste}
        rows={props.rows ?? 4}
        autoFocus={props.autoFocus}
        maxLength={props.maxLength}
        aria-label={props.label ?? 'Transcription'}
        placeholder={props.placeholder ?? 'Type the text on the meme, top to bottom.'}
      />
      <button
        type="button"
        className={styles['emoji-button']}
        aria-label="Insert emoji"
        aria-expanded={picking}
        title="Insert emoji"
        onClick={openPicker}
      >
        <Smile size={16} />
      </button>
      {picking && (
        <div className={styles['emoji-popover']}>
          <EmojiPicker
            onEmojiClick={insert}
            theme={dark ? Theme.DARK : Theme.LIGHT}
            lazyLoadEmojis
            previewConfig={{ showPreview: false }}
            width={320}
            height={380}
          />
        </div>
      )}
    </div>
  );
}
