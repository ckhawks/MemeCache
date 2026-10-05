'use client';

import { useState } from 'react';
import { supportedImageTypes, supportedVideoTypes } from '@/constants/mimeTypes';
import WarningCover from '@/components/WarningCover';
import { blursMeme, type ContentWarning } from '@/constants/contentWarnings';
import { useWarningDisplay } from '@/contexts/WarningDisplayContext';
import d from './MemeDetail.module.scss';
import { useViewBeacon } from './useViewBeacon';

// The meme on its own page: scaled to fill the column, small memes included, but never taller
// than 75% of the screen. CSS alone cannot do both without knowing the shape (it would stretch
// or crop), so the aspect ratio is read when the media loads and the width becomes
// min(column, 75vh x ratio). Until then it fills the column, which is right for the common
// wide and square memes.
//
// A meme with content warnings sits under a WarningCover, which takes that width instead,
// and the media fills it.
//
// It also counts the view (useViewBeacon): after a second on screen, or when the video starts.
export default function DetailMedia(props: {
  meme: { id: string; contentType: string; username: string; warnings?: ContentWarning[] };
}) {
  const [ratio, setRatio] = useState<number | null>(null);
  const display = useWarningDisplay();
  // A blurred meme has not been seen yet, so its view waits for the reveal.
  const blurred = (props.meme.warnings ?? []).some(blursMeme) && display !== 'show';
  const [revealed, setRevealed] = useState(false);
  const countView = useViewBeacon(props.meme.id, !blurred || revealed);
  const src = '/api/resource/' + props.meme.id;
  const width = ratio ? { width: `min(100%, calc(75vh * ${ratio}))` } : undefined;
  const covered = (props.meme.warnings?.length ?? 0) > 0 && display !== 'show';
  const style = covered ? undefined : width;

  let media: React.ReactNode;
  if (supportedImageTypes.includes(props.meme.contentType)) {
    media = (
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
  } else if (supportedVideoTypes.includes(props.meme.contentType)) {
    media = (
      <video
        controls
        loop
        preload="metadata"
        className={d.media}
        style={style}
        onPlay={countView}
        onLoadedMetadata={(e) => {
          const video = e.currentTarget;
          setRatio(video.videoWidth / video.videoHeight);
        }}
      >
        <source src={src + '#t=0.1'} />
      </video>
    );
  } else {
    return <div>Unsupported media type {props.meme.contentType}.</div>;
  }

  if (!covered) {
    return media;
  }
  return (
    <WarningCover
      warnings={props.meme.warnings}
      className={d.covered}
      style={width}
      onReveal={() => setRevealed(true)}
    >
      {media}
    </WarningCover>
  );
}
