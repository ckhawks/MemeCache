'use client';

import { useState } from 'react';
import { supportedImageTypes, supportedVideoTypes } from '@/constants/mimeTypes';
import d from './MemeDetail.module.scss';

// The meme on its own page: scaled to fill the column, small memes included, but never taller
// than 75% of the screen. CSS alone cannot do both without knowing the shape (it would stretch
// or crop), so the aspect ratio is read when the media loads and the width becomes
// min(column, 75vh x ratio). Until then it fills the column, which is right for the common
// wide and square memes.
export default function DetailMedia(props: {
  meme: { id: string; contentType: string; username: string };
}) {
  const [ratio, setRatio] = useState<number | null>(null);
  const src = '/api/resource/' + props.meme.id;
  const style = ratio ? { width: `min(100%, calc(75vh * ${ratio}))` } : undefined;

  if (supportedImageTypes.includes(props.meme.contentType)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={`Meme by ${props.meme.username}`}
        className={d.media}
        style={style}
        // A cached image can finish loading before React attaches onLoad, so also read it
        // when the element mounts already complete.
        ref={(img) => {
          if (img && img.complete && img.naturalWidth && ratio === null) {
            setRatio(img.naturalWidth / img.naturalHeight);
          }
        }}
        onLoad={(e) => {
          const img = e.currentTarget;
          setRatio(img.naturalWidth / img.naturalHeight);
        }}
      />
    );
  }

  if (supportedVideoTypes.includes(props.meme.contentType)) {
    return (
      <video
        controls
        loop
        preload="metadata"
        className={d.media}
        style={style}
        onLoadedMetadata={(e) => {
          const video = e.currentTarget;
          setRatio(video.videoWidth / video.videoHeight);
        }}
      >
        <source src={src + '#t=0.1'} />
      </video>
    );
  }

  return <div>Unsupported media type {props.meme.contentType}.</div>;
}
