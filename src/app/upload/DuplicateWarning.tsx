import MemeThumbStrip, { type ThumbMeme } from '@/components/MemeThumbStrip';
import u from './Upload.module.scss';
import s from './DuplicateWarning.module.scss';

// Shown on the upload card when the picked file looks like a meme already here. A warning,
// not a block: a better copy or a deliberate repost can still go up. exact: it is the very
// same picture, which the upload refuses, so the warning says that instead.
export default function DuplicateWarning(props: { memes: ThumbMeme[]; exact?: boolean }) {
  const one = props.memes.length === 1;
  if (props.exact) {
    return (
      <div className={`${u.note} ${s.warning}`} role="status">
        <MemeThumbStrip memes={props.memes} size="small" newTab />
        <div>
          <div className={s.title}>This meme is already here.</div>
          <div className={u.muted}>The same picture is up already, so it cannot be uploaded again. Open it to see it there.</div>
        </div>
      </div>
    );
  }
  return (
    <div className={`${u.note} ${s.warning}`} role="status">
      <MemeThumbStrip memes={props.memes} size="small" newTab />
      <div>
        <div className={s.title}>
          {one ? 'This looks like a meme that is already here.' : 'This looks like memes that are already here.'}
        </div>
        <div className={u.muted}>
          {one ? 'Open it to compare' : 'Open them to compare'}, or upload anyway if yours is different or better.
        </div>
      </div>
    </div>
  );
}
