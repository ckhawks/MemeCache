import Link from 'next/link';
import s from './MemeThumbStrip.module.scss';

export interface ThumbMeme {
  id: string;
  slug: string;
  contentType: string;
}

// A row of square thumbnails, each a link to its meme. Small (56px) inside a notice, medium
// (120px) as a section of a page. Scrolls sideways when the row is longer than the space.
// newTab opens the meme without leaving the page, for the upload page, where leaving would
// lose the picked file.
export default function MemeThumbStrip(props: {
  memes: ThumbMeme[];
  size?: 'small' | 'medium';
  newTab?: boolean;
}) {
  return (
    <div className={`${s.strip} ${props.size === 'small' ? s.small : ''}`}>
      {props.memes.map((meme) => (
        <Link
          key={meme.id}
          href={`/meme/${meme.slug}`}
          className={s.thumb}
          target={props.newTab ? '_blank' : undefined}
          aria-label="Open this meme"
        >
          {meme.contentType.startsWith('video/') ? (
            <video src={`/api/resource/${meme.id}#t=1`} preload="metadata" muted playsInline className={s.media} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/resource/${meme.id}`} alt="" loading="lazy" className={s.media} />
          )}
        </Link>
      ))}
    </div>
  );
}
