'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import styles from './MemeTagsEditor.module.scss';
import { api } from '@/util/api';
import type { TagSuggestion } from '@/db/queries/tags';

// Wait this long after the last keystroke before asking for suggestions.
const SUGGEST_DELAY_MS = 120;

// The tag field: stays open after each add so several tags go in one after another, and
// suggests existing tags as you type. Enter adds the highlighted suggestion, or the typed
// text when nothing is highlighted; a comma adds the typed text. Escape closes it.
export default function TagInput(props: {
  // Names already on the meme, left out of the suggestions.
  exclude: string[];
  onAdd: (name: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Only the latest request may set the list, so a slow early response cannot win.
  const requestRef = useRef(0);
  const listId = useId();

  const excluded = new Set(props.exclude.map((name) => name.toLowerCase()));
  const shown = suggestions.filter((s) => !excluded.has(s.name.toLowerCase()));

  useEffect(() => {
    const request = ++requestRef.current;
    const timer = setTimeout(async () => {
      try {
        const data = await api<{ tags: TagSuggestion[] }>(
          '/api/tags?q=' + encodeURIComponent(value.trim())
        );
        if (request === requestRef.current) {
          setSuggestions(data.tags);
          setHighlight(-1);
        }
      } catch {
        // Suggestions are a convenience; typing a tag still works without them.
      }
    }, SUGGEST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value]);

  const add = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || busy) {
      return;
    }
    setBusy(true);
    const ok = await props.onAdd(trimmed);
    setBusy(false);
    if (ok) {
      setValue('');
    }
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && shown.length > 0) {
      e.preventDefault();
      setHighlight((h) => (h + 1) % shown.length);
    } else if (e.key === 'ArrowUp' && shown.length > 0) {
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? shown.length - 1 : h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      add(highlight >= 0 && shown[highlight] ? shown[highlight].name : value);
    } else if (e.key === ',') {
      e.preventDefault();
      add(value);
    } else if (e.key === 'Escape') {
      props.onClose();
    }
  };

  return (
    <div className={styles['add-form']}>
      <input
        ref={inputRef}
        type="text"
        placeholder="Add a tag"
        aria-label="Add a tag"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        aria-activedescendant={highlight >= 0 ? `${listId}-${highlight}` : undefined}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => !value.trim() && props.onClose()}
        className={styles['tag-input']}
        maxLength={50}
        autoFocus
        // Not disabled while saving: that would drop focus and end the run of adds.
        aria-busy={busy}
      />
      {shown.length > 0 && (
        <ul id={listId} role="listbox" className={styles.suggestions}>
          {shown.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlight}
              className={styles.suggestion}
              // mousedown, not click, so the input keeps focus and does not close first.
              onMouseDown={(e) => {
                e.preventDefault();
                add(s.name);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span>{s.name}</span>
              <span className={styles['suggestion-uses']}>{s.uses}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
