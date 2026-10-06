'use client';

import { useState } from 'react';
import { Check, Send } from 'react-feather';
import localStyles from './LikeButton.module.scss';
import Tooltip from './Tooltip';
import { track } from '@/util/track';
import { memeFilename } from '@/constants/mimeTypes';

// Hands the meme itself to the phone's share sheet (iMessage, Discord, ...). Where the
// browser cannot share files, which is most desktops, it copies the meme's link instead.
// Each tap records meme_send, and then share or meme_copy_link for what came of it
// (src/constants/events.ts).
export default function SendMemeButton(props: {
  memeId: string;
  // For the copied link: /meme/<slug>.
  slug: string;
  contentType: string;
  labeled?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/meme/${props.slug}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    track('meme_copy_link', { memeId: props.memeId });
  };

  const onSend = async (event: React.MouseEvent) => {
    event.stopPropagation();
    track('meme_send', { memeId: props.memeId });

    try {
      if (typeof navigator.canShare === 'function') {
        // The feed already loaded this file, and the media route marks it immutable, so
        // this comes from the browser cache. Fetching it lazily keeps the feed light.
        const response = await fetch(`/api/resource/${props.memeId}`);
        const blob = await response.blob();
        const file = new File([blob], memeFilename(props.slug, props.contentType), {
          type: props.contentType,
        });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          track('share', { memeId: props.memeId });
          return;
        }
      }
      await copyLink();
    } catch (error) {
      // AbortError is the user closing the share sheet. Anything else (Safari can refuse
      // a share that starts too long after the tap): fall back to the link.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      await copyLink().catch(() => undefined);
    }
  };

  if (props.labeled) {
    return (
      <button type="button" onClick={onSend} className={localStyles['pill']} aria-label={copied ? 'Link copied' : 'Send'}>
        {copied ? <Check size={16} /> : <Send size={16} />}
        {copied ? 'Link copied' : 'Send'}
      </button>
    );
  }

  return (
    <Tooltip label={copied ? 'Link copied' : 'Send'}>
      <button
        type="button"
        onClick={onSend}
        className={localStyles['wrapper']}
        aria-label={copied ? 'Link copied' : 'Send'}
      >
        {copied ? (
          <Check size={14} className={localStyles['icon']} />
        ) : (
          <Send size={14} className={localStyles['icon']} />
        )}
      </button>
    </Tooltip>
  );
}
