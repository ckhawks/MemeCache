'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Edit2, SkipForward, X } from 'react-feather';
import globals from '../main.module.scss';
import d from '../meme/[memeId]/MemeDetail.module.scss';
import q from './Queue.module.scss';
import DetailMedia from '../meme/[memeId]/DetailMedia';
import DuplicateReview from './DuplicateReview';
import MemeTagsEditor from '@/components/MemeTagsEditor';
import TranscriptionField from '@/components/TranscriptionField';
import TranscriptionGuidelines from '@/components/TranscriptionGuidelines';
import { api } from '@/util/api';
import { displayUsername } from '@/auth/username';
import { CONFIRMATIONS_NEEDED, type MatchAnswer, type QueueTask } from '@/constants/queue';
import type { QueueItem } from '@/db/queries/queue';
import type { MatchPair } from '@/db/queries/duplicates';
import type { MemeTag } from '@/db/queries/tags';

const TASKS: { task: QueueTask; label: string; empty: string }[] = [
  {
    task: 'transcription',
    label: 'Transcription',
    empty: 'Nothing to type out or check right now.',
  },
  { task: 'tag', label: 'Tags', empty: 'Every meme has its tags settled.' },
  {
    task: 'duplicate',
    label: 'Duplicates',
    empty: 'No look-alike memes to check right now.',
  },
];

// Keys that act on the review card. Ignored while typing in a field.
const REVIEW_KEYS: Record<string, 'confirm' | 'reject' | 'fix' | 'skip'> = {
  c: 'confirm',
  r: 'reject',
  f: 'fix',
  s: 'skip',
};

async function fetchNext(task: QueueTask) {
  const data = await api<{
    item: QueueItem | null;
    pair: MatchPair | null;
    counts: Record<QueueTask, number>;
  }>(`/api/queue?task=${task}`);
  const tagData =
    task === 'tag' && data.item
      ? await api<{ tags: MemeTag[] }>(`/api/meme/${data.item.meme.id}/tags`)
      : null;
  return { item: data.item, pair: data.pair, counts: data.counts, tags: tagData?.tags ?? null };
}

export default function QueueClient(props: {
  initialTask: QueueTask;
  userId: string;
  canModerate: boolean;
}) {
  const [task, setTask] = useState<QueueTask>(props.initialTask);
  const [item, setItem] = useState<QueueItem | null>(null);
  // Duplicates task: the pair of memes to compare.
  const [pair, setPair] = useState<MatchPair | null>(null);
  const [tags, setTags] = useState<MemeTag[] | null>(null);
  const [counts, setCounts] = useState<Record<QueueTask, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  // Review only: correcting the text instead of judging it.
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Fetches the next item and swaps it in whole, so the old meme stays up until the new one
  // is ready rather than flashing empty. Every state change happens after the await.
  const load = useCallback(async (next: QueueTask) => {
    try {
      const fetched = await fetchNext(next);
      setItem(fetched.item);
      setPair(fetched.pair);
      setCounts(fetched.counts);
      setTags(fetched.tags);
      setFixing(false);
      setDraft('');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the queue.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Through .then so the effect body itself sets no state.
    Promise.resolve().then(() => load(props.initialTask));
  }, [load, props.initialTask]);

  const switchTask = (next: QueueTask) => {
    setNotice('');
    setLoading(true);
    setItem(null);
    setPair(null);
    setTask(next);
    load(next);
    // Keeps the tab in the URL so a reload or a shared link lands on it.
    window.history.replaceState(null, '', `/queue?task=${next}`);
  };

  // Runs one action on the current item, then moves on to the next one.
  const act = async (action: () => Promise<string | void>) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const message = await action();
      setNotice(message || '');
      await load(task);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const skip = () =>
    act(async () => {
      await api('/api/queue/dismiss', { body: { task, memeId: item!.meme.id } });
    });

  // An empty box saves as "no text on this meme", the same as the No text button.
  const saveTranscription = (fixes?: string, text = draft) =>
    act(async () => {
      const data = await api<{ pending: boolean }>(`/api/meme/${item!.meme.id}/transcription`, {
        body: { text, fixes },
      });
      const saved = text.trim() ? 'Saved.' : 'Saved as no text.';
      return data.pending ? `${saved} It will show once someone confirms it.` : saved;
    });

  const review = (verdict: 1 | -1) =>
    act(async () => {
      await api(`/api/transcription/${item!.transcription!.id}/review`, { body: { verdict } });
      return verdict === 1 ? 'Confirmed.' : 'Rejected.';
    });

  const answerPair = (answer: MatchAnswer | 'skip') =>
    act(async () => {
      await api('/api/queue/duplicates', {
        body: { memeId: pair!.memeId, otherId: pair!.otherId, answer },
      });
    });

  const startFix = () => {
    setDraft(item?.transcription?.text ?? '');
    setFixing(true);
  };

  useEffect(() => {
    if (task !== 'transcription' || !item?.transcription || fixing) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || target.closest('input, textarea')) {
        return;
      }
      const action = REVIEW_KEYS[e.key.toLowerCase()];
      if (!action) {
        return;
      }
      e.preventDefault();
      if (action === 'confirm') review(1);
      if (action === 'reject') review(-1);
      if (action === 'fix') startFix();
      if (action === 'skip') skip();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const current = TASKS.find((t) => t.task === task)!;
  const buttonSecondary = `${globals.button} ${globals['button-secondary']} ${globals['button-small']}`;
  const buttonPrimary = `${globals.button} ${globals['button-small']}`;
  const buttonSuccess = `${globals.button} ${globals['button-success']} ${globals['button-small']}`;

  return (
    <div className={q.queue}>
      {/* Plain design-system buttons: the current task is the primary one. */}
      <nav className={q.tabs} aria-label="Queue task">
        {TASKS.map((t) => (
          <button
            key={t.task}
            type="button"
            className={task === t.task ? buttonPrimary : buttonSecondary}
            aria-current={task === t.task ? 'page' : undefined}
            onClick={() => switchTask(t.task)}
          >
            {t.label}
            {counts && <span className={q.count}>{counts[t.task]}</span>}
          </button>
        ))}
      </nav>

      {notice && <div className={q.notice}>{notice}</div>}
      {error && <div className={q.error}>{error}</div>}

      {loading && !item && !pair ? (
        <p className={q.muted}>Loading...</p>
      ) : task === 'duplicate' ? (
        pair ? (
          <DuplicateReview
            key={`${pair.memeId} ${pair.otherId}`}
            pair={pair}
            busy={busy}
            canModerate={props.canModerate}
            onAnswer={answerPair}
          />
        ) : (
          <p className={q.muted}>{current.empty}</p>
        )
      ) : !item ? (
        <p className={q.muted}>{current.empty}</p>
      ) : (
        <div className={d.post}>
          <div className={d.frame}>
            {/* Keyed so the measured shape resets for each meme. */}
            <DetailMedia key={item.meme.id} meme={item.meme} />
          </div>
          <aside className={d.side}>
            <div className={q.meta}>
              Posted by {displayUsername(item.meme.username)} ·{' '}
              <Link href={`/meme/${item.meme.slug}`} target="_blank">
                Open meme
              </Link>
            </div>

            {task === 'transcription' && !item.transcription && (
              <div className={q.panel}>
                <h2 className={q.title}>Type the text on this meme</h2>
                <TranscriptionField
                  value={draft}
                  onChange={setDraft}
                  onSubmit={() => saveTranscription()}
                  autoFocus
                />
                <div className={q.actions}>
                  <button type="button" className={buttonSecondary} onClick={skip} disabled={busy}>
                    <SkipForward size={14} /> Skip
                  </button>
                  <button
                    type="button"
                    className={buttonSecondary}
                    onClick={() => saveTranscription(undefined, '')}
                    disabled={busy}
                  >
                    No text
                  </button>
                  <button
                    type="button"
                    className={buttonSuccess}
                    onClick={() => saveTranscription()}
                    disabled={busy}
                  >
                    Save and next
                  </button>
                </div>
                <p className={q.hint}>
                  Ctrl+Enter saves. Leaving it empty saves it as having no text.
                </p>
                <TranscriptionGuidelines />
              </div>
            )}

            {task === 'transcription' && item.transcription && (
              <div className={q.panel}>
                <h2 className={q.title}>
                  {item.transcription.text
                    ? 'Is this the text on the meme, all of it?'
                    : 'Is there really no text on this meme?'}
                </h2>
                {fixing ? (
                  <>
                    <TranscriptionField
                      value={draft}
                      onChange={setDraft}
                      onSubmit={() => saveTranscription(item.transcription!.id)}
                      autoFocus
                    />
                    <div className={q.actions}>
                      <button
                        type="button"
                        className={buttonSecondary}
                        onClick={() => setFixing(false)}
                        disabled={busy}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={buttonSuccess}
                        onClick={() => saveTranscription(item.transcription!.id)}
                        disabled={busy}
                      >
                        Save fix
                      </button>
                    </div>
                    <p className={q.hint}>
                      Saving a fix counts as rejecting the version you corrected.
                    </p>
                    <TranscriptionGuidelines />
                  </>
                ) : (
                  <>
                    {item.transcription.text ? (
                      <p className={q.transcription}>{item.transcription.text}</p>
                    ) : (
                      <p className={`${q.transcription} ${q.muted}`}>Marked as having no text.</p>
                    )}
                    <div className={q.meta}>
                      Transcribed by {displayUsername(item.transcription.editedByUsername)} ·{' '}
                      {item.transcription.confirms} of {CONFIRMATIONS_NEEDED} confirmations
                      {item.transcription.rejects > 0 && `, ${item.transcription.rejects} rejected`}
                    </div>
                    <div className={q.actions}>
                      <button type="button" className={buttonSuccess} onClick={() => review(1)} disabled={busy}>
                        <Check size={14} /> Confirm
                      </button>
                      <button type="button" className={buttonSecondary} onClick={() => review(-1)} disabled={busy}>
                        <X size={14} /> Reject
                      </button>
                      <button type="button" className={buttonSecondary} onClick={startFix} disabled={busy}>
                        <Edit2 size={14} /> Fix
                      </button>
                      <button type="button" className={buttonSecondary} onClick={skip} disabled={busy}>
                        <SkipForward size={14} /> Skip
                      </button>
                    </div>
                    <p className={q.hint}>Keys: C confirm, R reject, F fix, S skip.</p>
                    <TranscriptionGuidelines />
                  </>
                )}
              </div>
            )}

            {task === 'tag' && (
              <div className={q.panel}>
                <h2 className={q.title}>Tag this meme</h2>
                <p className={q.hint}>
                  Vote on the tags already here and add any that are missing. A tag is settled
                  once {CONFIRMATIONS_NEEDED} other people agree on it.
                </p>
                {tags ? (
                  <MemeTagsEditor
                    key={item.meme.id}
                    plain
                    memeId={item.meme.id}
                    userId={props.userId}
                    initial={tags}
                    canModerate={props.canModerate}
                  />
                ) : (
                  <p className={q.muted}>Loading tags...</p>
                )}
                <div className={q.actions}>
                  <button type="button" className={buttonSuccess} onClick={skip} disabled={busy}>
                    Next meme
                  </button>
                </div>
                <p className={q.hint}>
                  Good tags are what someone would search for: who is in it, the format, the topic.
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
