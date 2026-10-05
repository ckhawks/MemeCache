'use client';

import { useEffect, useSyncExternalStore } from 'react';
import s from './CooldownTimer.module.scss';

const SECOND = 1000;

// One clock for every timer on the page. Checked four times a second but only changes
// when the second does, so components re-render once a second, on the second.
function subscribe(onChange: () => void) {
  const id = setInterval(onChange, SECOND / 4);
  return () => clearInterval(id);
}

function currentSecond() {
  return Math.floor(Date.now() / SECOND) * SECOND;
}

function never() {
  return () => undefined;
}

// Each digit is keyed by its value, so a change mounts a new span and its entry animation
// plays. Digits that did not change keep their element and stay still.
function Digits(props: { value: string; label: string }) {
  return (
    <span className={s.unit}>
      <span className={s.digits}>
        {props.value.split('').map((digit, i) => (
          <span key={`${i}-${digit}`} className={s.digit}>
            {digit}
          </span>
        ))}
      </span>
      <span className={s.unitLabel}>{props.label}</span>
    </span>
  );
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// A live countdown to `until`, with a bar filling from `since` (when the wait started).
// Used for the username cooldown. `now` is the server's time at render, so the first paint
// matches between server and browser; without it the digits show dashes until mounted.
export default function CooldownTimer(props: {
  since: string | Date;
  until: string | Date;
  now?: string | Date;
  label?: string;
  onDone?: () => void;
}) {
  const start = new Date(props.since).getTime();
  const end = new Date(props.until).getTime();
  const serverNow = props.now ? new Date(props.now).getTime() : null;
  const now = useSyncExternalStore(subscribe, currentSecond, () => serverNow);

  const remaining = now === null ? null : Math.max(0, end - now);
  const done = remaining === 0;
  const { onDone } = props;
  useEffect(() => {
    if (done) {
      onDone?.();
    }
  }, [done, onDone]);

  const progress = now === null ? 0 : Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)));
  const totalSeconds = remaining === null ? 0 : Math.ceil(remaining / SECOND);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  // The stopwatch hand moves forward with elapsed time, never wrapping back, so its
  // transition always ticks clockwise.
  const elapsedSeconds = now === null ? 0 : Math.floor((now - start) / SECOND);

  // The unlock time is shown in the viewer's time zone, which the server does not know, so
  // it is left out of the server render and filled in once hydrated.
  const hydrated = useSyncExternalStore(never, () => true, () => false);
  const unlocks = hydrated
    ? new Date(end).toLocaleString('en-US', {
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';
  const percent = Math.round(progress * 100);
  const blank = remaining === null;

  return (
    <div className={s.timer} data-done={done || undefined}>
      <div className={s.top}>
        <svg className={s.watch} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="13" r="8" />
          <line x1="12" y1="2" x2="12" y2="5" />
          <line x1="10" y1="2" x2="14" y2="2" />
          <line
            className={s.hand}
            x1="12"
            y1="13"
            x2="12"
            y2="8"
            style={{ transform: `rotate(${elapsedSeconds * 6}deg)` }}
          />
        </svg>
        <span className={s.label}>{props.label ?? 'Available again in'}</span>
      </div>

      {/* Read out once, not every second: the visible digits are hidden from screen readers. */}
      <span className={s.srOnly}>
        {done ? 'Available now.' : unlocks && `Available again on ${unlocks}.`}
      </span>
      <div className={s.clock} aria-hidden="true">
        <Digits value={blank ? '--' : String(days)} label={days === 1 ? 'day' : 'days'} />
        <Digits value={blank ? '--' : pad(hours)} label="hrs" />
        <span className={s.colon}>:</span>
        <Digits value={blank ? '--' : pad(minutes)} label="min" />
        <span className={s.colon}>:</span>
        <Digits value={blank ? '--' : pad(seconds)} label="sec" />
      </div>

      <div
        className={s.track}
        role="progressbar"
        aria-label="Cooldown"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={s.fill} style={{ width: `${progress * 100}%` }} />
      </div>
      <div className={s.foot}>
        <span>{done ? 'Ready' : unlocks && `Unlocks ${unlocks}`}</span>
        <span>{percent}%</span>
      </div>
    </div>
  );
}
