import { Image } from 'react-bootstrap';
import styles from '../app/main.module.scss';
import {
  supportedImageTypes,
  supportedVideoTypes,
} from '@/constants/mimeTypes';

export default function MemeMediaRenderer(props: {
  meme: { id: string; contentType: string };
}) {
  if (supportedImageTypes.indexOf(props.meme?.contentType) > -1) {
    return (
      <div className={styles['meme-media']}>
        <Image
          src={'/api/resource/' + props.meme.id}
          alt=":("
          className={styles['meme-media-item']}
        />
      </div>
    );
  }

  if (supportedVideoTypes.indexOf(props.meme?.contentType) > -1) {
    return (
      <div className={styles['meme-media']}>
        <video
          controls
          className={styles['meme-media-item']}
          loop
          style={{ display: 'block' }}
        >
          <source src={'/api/resource/' + props.meme.id} />
        </video>
      </div>
    );
  }

  return (
    <div className={styles['meme-media']}>
      Unsupported media type <b>{props.meme.contentType}</b>.
    </div>
  );
}
