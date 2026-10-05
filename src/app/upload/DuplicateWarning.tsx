import MemeThumbStrip, { type ThumbMeme } from '@/components/MemeThumbStrip';
import u from './Upload.module.scss';
import s from './DuplicateWarning.module.scss';

// Shown on the upload card when the picked file looks like a meme already here. A warning,
// not a block: a better copy or a deliberate repost can still go up.
export default function DuplicateWarning(props: { memes: ThumbMeme[] }) {
  const one = props.memes.length === 1;
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
