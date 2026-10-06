'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { SkipForward } from 'react-feather';
import globals from '../main.module.scss';
import q from './Queue.module.scss';
import DetailMedia from '../meme/[memeId]/DetailMedia';
import { displayUsername } from '@/auth/username';
import { CONFIRMATIONS_NEEDED, MATCH_ANSWER_LABELS, type MatchAnswer } from '@/constants/queue';
import type { MatchPair } from '@/db/queries/duplicates';

// Keys that answer. Ignored while typing in a field.
const ANSWER_KEYS: Record<string, MatchAnswer | 'skip'> = {
  m: 'same_meme',
  t: 'same_template',
  d: 'different',
  s: 'skip',
};

function formatDate(value: string) {
  // UTC on server and browser alike, so the two renders agree.
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// The queue's Duplicates tab (migration 021): two memes the fingerprints matched, side by
// side, older first, and one question about them. The answer is settled once
// CONFIRMATIONS_NEEDED people other than the two uploaders agree; a settled "same meme"
// goes to the moderators to merge.
export default function DuplicateReview(props: {
  pair: MatchPair;
  busy: boolean;
  canModerate: boolean;
  onAnswer: (answer: MatchAnswer | 'skip') => void;
}) {
  const { pair, busy, onAnswer } = props;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || target.closest('input, textarea')) {
        return;
      }
      const answer = ANSWER_KEYS[e.key.toLowerCase()];
      if (!answer || busy) {
        return;
      }
      e.preventDefault();
      onAnswer(answer);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onAnswer]);

  const buttonSecondary = `${globals.button} ${globals['button-secondary']} ${globals['button-small']}`;
  const buttonPrimary = `${globals.button} ${globals['button-small']}`;

  return (
    <div className={q.panel}>
      <div className={q.pair}>
        {pair.memes.map((meme, i) => (
          <figure key={meme.id} className={q.pairMeme}>
            <div className={q.pairFrame}>
              <DetailMedia meme={meme} />
            </div>
            <figcaption className={q.meta}>
              {i === 0 ? 'Older' : 'Newer'}: posted by {displayUsername(meme.username)} on {formatDate(meme.createdAt)} ·{' '}
              <Link href={`/meme/${meme.slug}`} target="_blank">
                Open meme
              </Link>
            </figcaption>
          </figure>
        ))}
      </div>

      <h2 className={q.title}>Is this the exact same meme, or just the same template?</h2>
      <p className={q.hint}>
        Same meme: the same picture with the same text, even if one is bigger, cropped a little or more compressed. Same template: the same picture with different text, or used in a bigger meme. Different: not related.
      </p>
      <div className={q.actions}>
        {(['same_meme', 'same_template', 'different'] as const).map((answer) => (
          <button
            key={answer}
            type="button"
            className={answer === 'same_meme' ? buttonPrimary : buttonSecondary}
            onClick={() => onAnswer(answer)}
            disabled={busy}
          >
            {MATCH_ANSWER_LABELS[answer]}
          </button>
        ))}
        <button type="button" className={buttonSecondary} onClick={() => onAnswer('skip')} disabled={busy}>
          <SkipForward size={14} /> Skip
        </button>
      </div>
      <p className={q.hint}>
        Keys: M same meme, T same template, D different, S skip. A pair is settled once {CONFIRMATIONS_NEEDED} people agree; moderators then merge the same meme into the older copy.
        {props.canModerate && (
          <>
            {' '}
            Moderators can settle and merge pairs directly on <Link href="/admin/duplicates">Duplicates</Link>.
          </>
        )}
      </p>
    </div>
  );
}
