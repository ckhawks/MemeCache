'use client';

import Form from 'next/form';
import { useEffect, useRef } from 'react';
import { Search } from 'react-feather';
import styles from './SearchBox.module.scss';

// A search field that goes to /search?q=. `compact` is the top bar's size. With `shortcut`,
// pressing "/" anywhere outside a text field focuses it; when two are on the page (the top
// bar and Explore), the first visible one takes it. `quietShortcut` keeps the "/" hint off a
// box that sits under the top bar's own.
export default function SearchBox(props: {
  defaultValue?: string;
  compact?: boolean;
  shortcut?: boolean;
  quietShortcut?: boolean;
  autoFocus?: boolean;
  className?: string;
  // Where it submits, and what it says while empty. The site-wide search by default; the
  // Library searches itself.
  action?: string;
  placeholder?: string;
}) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!props.shortcut) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
        return;
      }
      // Hidden (the top bar's box on phones): leave it to another.
      if (!input.current || input.current.offsetParent === null) {
        return;
      }
      event.preventDefault();
      input.current.focus();
      input.current.select();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [props.shortcut]);

  return (
    <Form
      action={props.action ?? '/search'}
      role="search"
      className={`${styles['box']} ${props.compact ? styles['compact'] : ''} ${props.className ?? ''}`}
    >
      <Search size={props.compact ? 14 : 16} className={styles['icon']} aria-hidden />
      <input
        ref={input}
        type="search"
        name="q"
        // Remounts with a new query, so going back and forth between searches shows the one
        // on screen.
        key={props.defaultValue}
        defaultValue={props.defaultValue}
        placeholder={props.placeholder ?? (props.compact ? 'Search' : 'Search memes')}
        aria-label="Search memes"
        autoFocus={props.autoFocus}
        enterKeyHint="search"
        autoComplete="off"
        maxLength={200}
        className={styles['input']}
      />
      {props.shortcut && !props.quietShortcut && (
        <kbd className={styles['hint']} aria-hidden>
          /
        </kbd>
      )}
    </Form>
  );
}
