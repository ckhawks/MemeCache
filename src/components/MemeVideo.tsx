'use client';

import { useEffect, useRef, useState } from 'react';

// A meme's video. Most are what sites turn GIFs into: short and silent. Those (hasAudio is
// false, migration 019) play like a GIF: muted, looping, no controls, running only while
// on screen so a feed of them does not play everything at once. Everything else, including
// a video whose sound is unknown, gets normal controls and never autoplays.
//
// `hold` keeps a GIF still, e.g. while it is blurred behind a content warning. Viewers who
// ask for reduced motion get controls instead of autoplay.
export default function MemeVideo(props: {
  src: string;
  hasAudio: boolean | null | undefined;
  hold?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onPlay?: () => void;
  onLoadedMetadata?: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
  // GIF mode only: a video with controls keeps its clicks for the player.
  onClick?: (event: React.MouseEvent<HTMLVideoElement>) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const gif = props.hasAudio === false && !reducedMotion;

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const video = ref.current;
    if (!gif || !video) {
      return;
    }
    if (props.hold) {
      video.pause();
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Muted autoplay is allowed everywhere; a rejected play() just leaves it still.
          video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [gif, props.hold]);

  if (gif) {
    return (
      <video
        ref={ref}
        muted
        loop
        playsInline
        preload="metadata"
        className={props.className}
        style={props.style}
        onPlay={props.onPlay}
        onLoadedMetadata={props.onLoadedMetadata}
        onClick={props.onClick}
      >
        <source src={props.src} />
      </video>
    );
  }

  return (
    <video
      ref={ref}
      controls
      loop
      preload="metadata"
      className={props.className}
      style={props.style}
      // Clicks on the controls stay here: a feed card opens the meme page on click.
      onClick={(e) => e.stopPropagation()}
      onPlay={props.onPlay}
      onLoadedMetadata={props.onLoadedMetadata}
    >
      {/* #t=0.1 shows the first frame instead of a blank box. */}
      <source src={props.src + '#t=0.1'} />
    </video>
  );
}
