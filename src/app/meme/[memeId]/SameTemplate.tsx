import MemeThumbStrip from '@/components/MemeThumbStrip';
import type { MatchedMeme } from '@/db/queries/mediaHash';
import d from './MemeDetail.module.scss';

// Other memes on the same picture: the same template with other text, a meme using it as
// one panel, or the same meme uploaded again (those first). Found by comparing the media
// (src/server/mediaHash.ts), not by tags.
export default function SameTemplate(props: { memes: MatchedMeme[] }) {
  if (props.memes.length === 0) {
    return null;
  }
  return (
    <section className={d.related}>
      <h2 className={d.relatedTitle}>Same template</h2>
      <MemeThumbStrip memes={props.memes} />
    </section>
  );
}
