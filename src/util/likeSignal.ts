// Double tap to like: the meme's media and its like button live in different components
// (and on the meme page, different parts of the page), so the media asks for a like with a
// window event and the LikeButton for that meme answers it. A double tap only ever likes;
// it never takes a like back.
const EVENT = 'memecache:like';

export function requestLike(memeId: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: memeId }));
}

export function onLikeRequest(memeId: string, handler: () => void) {
  const listener = (event: Event) => {
    if ((event as CustomEvent<string>).detail === memeId) {
      handler();
    }
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

// Telling one click from two: a single click waits this long before acting.
export const DOUBLE_TAP_MS = 250;
