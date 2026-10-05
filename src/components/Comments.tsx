'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Image as ImageIcon } from 'react-feather';
import styles from './Comments.module.scss';
import main from '../app/main.module.scss';
import TranscriptionField from './TranscriptionField';
import MemeRefCard from './MemeRefCard';
import MemePicker from './MemePicker';
import { api } from '@/util/api';
import { avatarUrl } from '@/util/avatarUrl';
import { timeAgo } from '@/util/datetimeFormat';
import { parseMemeLink } from '@/util/memeLink';
import { COMMENT_EDIT_MINUTES, COMMENT_MAX } from '@/constants/comments';
import type { MemeComment, MemeRef } from '@/db/queries/comments';

// Comments under a meme (migration 014): flat, oldest first. Dates arrive as strings when a
// comment comes back from the API.
type Comment = Omit<MemeComment, 'createdAt' | 'editedAt'> & {
  createdAt: Date | string;
  editedAt: Date | string | null;
};

// The counter shows once the text is this close to the cap.
const COUNTER_FROM = COMMENT_MAX - 200;

// Text and an optional meme, for a new comment or an edit. Pasting a link to a meme page
// into the text attaches that meme and takes the link back out. Ctrl/Cmd+Enter sends.
export function CommentComposer(props: {
  // The meme being commented on, which cannot be attached to itself.
  memeId: string;
  initialBody?: string;
  initialRef?: MemeRef | null;
  submitLabel: string;
  // The text box's accessible name.
  label?: string;
  onSubmit: (body: string, ref: MemeRef | null) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState(props.initialBody ?? '');
  const [ref, setRef] = useState<MemeRef | null>(props.initialRef ?? null);
  const [picking, setPicking] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const empty = !body.trim() && !ref;

  const submit = async () => {
    if (empty || processing) {
      return;
    }
    setProcessing(true);
    setError('');
    try {
      await props.onSubmit(body.trim(), ref);
      setBody('');
      setRef(null);
      setPicking(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the comment.');
    } finally {
      setProcessing(false);
    }
  };

  // Lets the link paste as usual, then swaps it for the meme once it is found.
  const onPaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData.getData('text');
    if (!parseMemeLink(pasted)) {
      return;
    }
    try {
      const { memes } = await api<{ memes: MemeRef[] }>(`/api/search?q=${encodeURIComponent(pasted)}`);
      const found = memes[0];
      if (!found || found.id === props.memeId) {
        return;
      }
      setRef(found);
      setPicking(false);
      setBody((current) => current.replace(pasted, '').trim());
    } catch {
      // Leaves the link in the text, which still works as a link.
    }
  };

  return (
    <form
      className={styles['composer']}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <TranscriptionField
        value={body}
        onChange={setBody}
        onSubmit={submit}
        onPaste={onPaste}
        rows={2}
        maxLength={COMMENT_MAX}
        autoFocus={props.autoFocus}
        label={props.label ?? 'Comment'}
        placeholder="Add a comment, or paste a link to a meme"
      />
      {ref && <MemeRefCard meme={ref} onRemove={() => setRef(null)} />}
      {picking && (
        <MemePicker
          excludeId={props.memeId}
          autoFocus
          onClose={() => setPicking(false)}
          onPick={(meme) => {
            setRef(meme);
            setPicking(false);
          }}
        />
      )}
      {error && <div className={styles['error']}>{error}</div>}
      <div className={styles['composer-bar']}>
        <button
          type="button"
          className={styles['attach']}
          aria-expanded={picking}
          onClick={() => setPicking((open) => !open)}
        >
          <ImageIcon size={15} />
          {ref ? 'Pick a different meme' : 'Reply with a meme'}
        </button>
        {body.length >= COUNTER_FROM && (
          <span className={styles['counter']}>
            {body.length}/{COMMENT_MAX}
          </span>
        )}
        <span className={styles['composer-buttons']}>
          {props.onCancel && (
            <button
              type="button"
              className={`${main['button']} ${main['button-secondary']} ${main['button-small']}`}
              onClick={props.onCancel}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className={`${main['button']} ${main['button-success']} ${main['button-small']}`}
            disabled={empty || processing}
          >
            {props.submitLabel}
          </button>
        </span>
      </div>
    </form>
  );
}

function editableUntil(comment: Comment) {
  return new Date(comment.createdAt).getTime() + COMMENT_EDIT_MINUTES * 60_000;
}

// One comment: who, when, what, and Edit and Delete for whoever may. Delete asks once more
// in place. A deleted comment keeps its place with a note instead of its text.
export function CommentItem(props: {
  comment: Comment;
  viewerId: string;
  canModerate: boolean;
  onEdit: (body: string, ref: MemeRef | null) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { comment } = props;
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  // Re-rendered every so often, so the time and the Edit button keep up.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const own = !!props.viewerId && comment.authorId === props.viewerId;
  const canEdit = own && !comment.deleted && now < editableUntil(comment);
  const canDelete = !comment.deleted && (own || props.canModerate);
  const profile = '/me/' + encodeURIComponent(comment.username);

  const remove = async () => {
    setError('');
    try {
      await props.onDelete();
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the comment.');
    }
  };

  return (
    <li className={`${styles['comment']} ${comment.deleted ? styles['deleted'] : ''}`}>
      <Link href={profile} className={styles['avatar-link']} tabIndex={-1} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarUrl(comment.username, comment.avatarKey)}
          alt=""
          width={32}
          height={32}
          loading="lazy"
          className={styles['avatar']}
        />
      </Link>
      <div className={styles['main']}>
        <div className={styles['meta']}>
          <Link href={profile} className={styles['author']}>
            {comment.username}
          </Link>
          <span className={styles['karma']} title="Karma">
            {comment.karma.toLocaleString()}
          </span>
          <span aria-hidden>·</span>
          {/* Server and browser clocks can disagree by a minute at the edge. */}
          <time dateTime={new Date(comment.createdAt).toISOString()} suppressHydrationWarning>
            {timeAgo(comment.createdAt, now)}
          </time>
          {comment.editedAt && !comment.deleted && (
            <>
              <span aria-hidden>·</span>
              <span>edited</span>
            </>
          )}
          {!editing && (canEdit || canDelete) && (
            <span className={styles['actions']}>
              {confirming ? (
                <>
                  <span>Delete this comment?</span>
                  <button type="button" className={`${styles['action']} ${styles['danger']}`} onClick={remove}>
                    Delete
                  </button>
                  <button type="button" className={styles['action']} onClick={() => setConfirming(false)}>
                    Keep
                  </button>
                </>
              ) : (
                <>
                  {canEdit && (
                    <button type="button" className={styles['action']} onClick={() => setEditing(true)}>
                      Edit
                    </button>
                  )}
                  {canDelete && (
                    <button type="button" className={styles['action']} onClick={() => setConfirming(true)}>
                      Delete
                    </button>
                  )}
                </>
              )}
            </span>
          )}
        </div>
        {comment.deleted ? (
          <div className={styles['note']}>
            {comment.deleted === 'moderator' ? 'Removed by a moderator.' : 'Deleted.'}
          </div>
        ) : editing ? (
          <CommentComposer
            memeId={comment.memeId}
            initialBody={comment.body}
            initialRef={comment.ref}
            submitLabel="Save"
            label="Edit comment"
            autoFocus
            onCancel={() => setEditing(false)}
            onSubmit={async (body, ref) => {
              await props.onEdit(body, ref);
              setEditing(false);
            }}
          />
        ) : (
          <>
            {comment.body && <p className={styles['body']}>{comment.body}</p>}
            {comment.ref && <MemeRefCard meme={comment.ref} />}
            {comment.refGone && <div className={styles['note']}>The meme replied with was deleted.</div>}
          </>
        )}
        {error && <div className={styles['error']}>{error}</div>}
      </div>
    </li>
  );
}

// The section on the meme page. Anyone can read; members can comment.
export default function Comments(props: {
  memeId: string;
  memeSlug: string;
  initial: Comment[];
  viewerId: string;
  canModerate: boolean;
}) {
  const [comments, setComments] = useState<Comment[]>(props.initial);
  const standing = comments.filter((c) => !c.deleted).length;
  const base = `/api/meme/${props.memeId}/comments`;

  const replace = (updated: Comment) =>
    setComments((current) => current.map((c) => (c.id === updated.id ? updated : c)));

  return (
    <section id="comments" className={styles['section']}>
      <h2 className={styles['title']}>
        Comments
        {standing > 0 && <span className={styles['count']}>{standing}</span>}
      </h2>
      {comments.length > 0 ? (
        <ul className={styles['list']}>
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              viewerId={props.viewerId}
              canModerate={props.canModerate}
              onEdit={async (body, ref) => {
                const result = await api<{ comment: Comment }>(`${base}/${comment.id}`, {
                  method: 'PUT',
                  body: {
                    body,
                    meme: ref?.id ?? null,
                  },
                });
                replace(result.comment);
              }}
              onDelete={async () => {
                const result = await api<{ comment: Comment }>(`${base}/${comment.id}`, {
                  method: 'DELETE',
                });
                replace(result.comment);
              }}
            />
          ))}
        </ul>
      ) : (
        <p className={styles['empty']}>No comments yet.</p>
      )}
      {props.viewerId ? (
        <CommentComposer
          memeId={props.memeId}
          submitLabel="Comment"
          onSubmit={async (body, ref) => {
            const result = await api<{ comment: Comment }>(base, {
              body: {
                body,
                meme: ref?.id ?? null,
              },
            });
            setComments((current) => [...current, result.comment]);
          }}
        />
      ) : (
        <p className={styles['empty']}>
          <Link href={'/login?next=' + encodeURIComponent(`/meme/${props.memeSlug}#comments`)}>Log in</Link> to comment.
        </p>
      )}
    </section>
  );
}
