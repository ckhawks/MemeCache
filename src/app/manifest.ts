import type { MetadataRoute } from 'next';

// Makes the site installable. The share target puts MemeCache in Android's share sheet;
// public/sw.js receives the shared file. iOS supports installing but not share targets.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MemeCache',
    short_name: 'MemeCache',
    description: 'Your meme library: find the right one, send it fast.',
    start_url: '/explore',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#171717',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    // Cast: Next 14's manifest type predates file sharing (no `files` in params). Next
    // serializes this object as-is, so the spec shape reaches the browser unchanged.
    share_target: {
      action: '/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        files: [
          {
            name: 'file',
            accept: [
              'image/png',
              'image/jpeg',
              'image/gif',
              'image/webp',
              'video/mp4',
              'video/webm',
            ],
          },
        ],
      },
    } as unknown as MetadataRoute.Manifest['share_target'],
  };
}
