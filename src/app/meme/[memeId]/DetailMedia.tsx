'use client';

import { useRef, useState } from 'react';
import { DOUBLE_TAP_MS, requestLike } from '@/util/likeSignal';
import { supportedImageTypes, supportedVideoTypes } from '@/constants/mimeTypes';
import WarningCover from '@/components/WarningCover';
import MemeVideo from '@/components/MemeVideo';
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
  meme: {
    id: string;
    contentType: string;
    username: string;
    warnings?: ContentWarning[];
    hasAudio?: boolean | null;
  };
}) {
  const [ratio, setRatio] = useState<number | null>(null);
  const display = useWarningDisplay();
  // A blurred meme has not been seen yet, so its view waits for the reveal.
  const blurred = (props.meme.warnings ?? []).some(blursMeme) && display !== 'show';
  const [revealed, setRevealed] = useState(false);
  const countView = useViewBeacon(props.meme.id, !blurred || revealed);
  const src = '/api/resource/' + props.meme.id;
  const width = ratio ? { width: `min(100%, calc(75vh * ${ratio}))` } : undefined;
  const style = blurred ? undefined : width;

  // Double tap or double click the meme to like it (only ever likes).
  const lastTap = useRef(0);
  const onTap = () => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      requestLike(props.meme.id);
    } else {
      lastTap.current = now;
    }
  };

  let media: React.ReactNode;
  if (supportedImageTypes.includes(props.meme.contentType)) {
    media = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={`Meme by ${props.meme.username}`}
        className={d.media}
        style={style}
        onClick={onTap}
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
      <MemeVideo
        src={src}
        hasAudio={props.meme.hasAudio}
        hold={blurred && !revealed}
        className={d.media}
        style={style}
        onClick={onTap}
        onPlay={countView}
        onLoadedMetadata={(e) => {
          const video = e.currentTarget;
          setRatio(video.videoWidth / video.videoHeight);
        }}
      />
    );
  } else {
    return <div>Unsupported media type {props.meme.contentType}.</div>;
  }

  if (!blurred) {
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
