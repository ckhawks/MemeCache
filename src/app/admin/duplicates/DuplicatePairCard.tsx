'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from '../../main.module.scss';
import r from '../reports/Reports.module.scss';
import s from './Duplicates.module.scss';
import { api } from '@/util/api';
import { displayUsername } from '@/auth/username';
import { supportedVideoTypes } from '@/constants/mimeTypes';
import { MATCH_ANSWER_LABELS, MATCH_ANSWERS, type MatchAnswer } from '@/constants/queue';
import type { AdminMatchPair } from '@/db/queries/duplicates';

function formatDate(value: string) {
  // UTC on server and browser alike, so the two renders agree.
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// One pair on /admin/duplicates. Settled as the same meme: pick the original (the older one
// to start with) and merge, or say it is not a duplicate. Not settled: answer it.
export default function DuplicatePairCard(props: { pair: AdminMatchPair; settled: boolean }) {
  const { pair } = props;
  const [original, setOriginal] = useState(pair.memes[0].id);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const run = async (action: () => Promise<unknown>) => {
    setProcessing(true);
    setError('');
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setProcessing(false);
    }
  };

  const answer = (value: MatchAnswer) =>
    run(() => api('/api/admin/duplicates', { body: { memeId: pair.memeId, otherId: pair.otherId, answer: value } }));

  const merge = () => {
    const duplicate = pair.memes.find((m) => m.id !== original)!;
    const into = pair.memes.find((m) => m.id === original)!;
    if (!window.confirm(`Merge ${duplicate.slug} into ${into.slug}? ${duplicate.slug} is deleted and its link goes to ${into.slug}.`)) {
      return;
    }
    run(() => api(`/api/meme/${duplicate.id}/merge`, { body: { into: into.id } }));
  };

  const tally = MATCH_ANSWERS.filter((a) => pair.tally[a] > 0)
    .map((a) => `${MATCH_ANSWER_LABELS[a]} ${pair.tally[a]}`)
    .join(', ');

  return (
    <article className={`${r.card} ${s.card}`}>
      <div className={s.pair}>
        {pair.memes.map((meme) => (
          <div key={meme.id} className={s.meme}>
            <Link href={`/meme/${meme.slug}`} className={`${r.thumb} ${s.thumb}`} target="_blank">
              {supportedVideoTypes.includes(meme.contentType) ? (
                <video src={`/api/resource/${meme.id}#t=1`} preload="metadata" muted />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/resource/${meme.id}`} alt="" loading="lazy" />
              )}
            </Link>
            <div className={r.meta}>
              {meme.slug} · <Link href={'/me/' + encodeURIComponent(meme.username)}>{displayUsername(meme.username)}</Link> ·{' '}
              {formatDate(meme.createdAt)} · {meme.likeCount} {meme.likeCount === 1 ? 'like' : 'likes'}
            </div>
            {props.settled && (
              <label className={s.pick}>
                <input
                  type="radio"
                  name={`original-${pair.memeId}-${pair.otherId}`}
                  checked={original === meme.id}
                  onChange={() => setOriginal(meme.id)}
                  disabled={processing}
                />
                Keep this one as the original
              </label>
            )}
          </div>
        ))}
      </div>

      <div className={r.meta}>
        The fingerprints said {pair.kind === 'duplicate' ? 'same meme' : 'same template'}.{' '}
        {props.settled
          ? pair.byModerator
            ? 'A moderator said same meme.'
            : 'The queue settled it as the same meme.'
          : tally
            ? `Answers so far: ${tally}.`
            : 'Nobody has answered yet.'}
        {props.settled && tally && ` Answers: ${tally}.`}
      </div>

      <div className={r.buttons}>
        {props.settled ? (
          <>
            <button
              type="button"
              className={`${styles.button} ${styles['button-danger']} ${styles['button-small']}`}
              disabled={processing}
              onClick={merge}
            >
              Merge
            </button>
            <span className={s.label}>Not a duplicate:</span>
            {(['same_template', 'different'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`${styles.button} ${styles['button-secondary']} ${styles['button-small']}`}
                disabled={processing}
                onClick={() => answer(value)}
              >
                {MATCH_ANSWER_LABELS[value]}
              </button>
            ))}
          </>
        ) : (
          MATCH_ANSWERS.map((value) => (
            <button
              key={value}
              type="button"
              className={`${styles.button} ${value === 'same_meme' ? '' : styles['button-secondary']} ${styles['button-small']}`}
              disabled={processing}
              onClick={() => answer(value)}
            >
              {MATCH_ANSWER_LABELS[value]}
            </button>
          ))
        )}
      </div>
      {error && <div className={r.error}>{error}</div>}
    </article>
  );
}
