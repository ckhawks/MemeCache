import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from '@/constants/mimeTypes';
import { HttpError } from './route';

// Fetching a post's media from a link, for the upload page. Videos go through yt-dlp
// (with ffmpeg to merge separate video and audio streams); photo-only tweets, which
// yt-dlp refuses, go through X's public embed endpoint.
//
// Only links to the sites below are accepted, and yt-dlp is told not to fall back to its
// generic extractor, so a link cannot make the server fetch an arbitrary address.

const YT_DLP = process.env.YT_DLP_PATH || 'yt-dlp';
// yt-dlp finds ffmpeg on PATH by itself; --ffmpeg-location wants a real path, not a name.
const FFMPEG = process.env.FFMPEG_PATH;

// A stuck download is killed after this long.
const DOWNLOAD_TIMEOUT_MS = 90_000;

// Images are recompressed in the browser before upload, so an import may bring in a larger
// original than the upload limit allows; the upload route still enforces MAX_IMAGE_BYTES.
const MAX_IMPORTED_IMAGE_BYTES = 4 * MAX_IMAGE_BYTES;

// Prefer H.264 and AAC in MP4, which every browser plays, at up to 720p on the short side.
const FORMAT_SORT = 'vcodec:h264,res:720,acodec:aac,ext:mp4:m4a';

const VIDEO_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
};

export interface ImportedMedia {
  bytes: Buffer;
  contentType: string;
  fileName: string;
}

// Hosts as they appear after normalizeHost. Mirror and fix-embed domains people paste
// (fxtwitter and friends) are rewritten to x.com first.
const SITE_BY_HOST: Record<
  string,
  'x' | 'instagram' | 'tiktok' | 'youtube' | 'reddit'
> = {
  'x.com': 'x',
  'instagram.com': 'instagram',
  'tiktok.com': 'tiktok',
  'vm.tiktok.com': 'tiktok',
  'vt.tiktok.com': 'tiktok',
  'youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'reddit.com': 'reddit',
  'redd.it': 'reddit',
};

const X_ALIASES = [
  'twitter.com',
  'fxtwitter.com',
  'vxtwitter.com',
  'fixupx.com',
  'fixvx.com',
];

function normalizeHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^(www|m|mobile|old|new)\./, '');
  return X_ALIASES.includes(host) ? 'x.com' : host;
}

// Parses a pasted link and returns the one URL this post is stored and looked up under,
// or throws a 400 when it is not a link to a supported site. The same post shared as
// twitter.com or x.com, youtu.be or /shorts/, reel or p, comes out the same.
export function normalizeImportUrl(input: string): {
  url: string;
  site: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new HttpError(400, "That doesn't look like a link.");
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.port
  ) {
    throw new HttpError(400, "That doesn't look like a link.");
  }

  const host = normalizeHost(parsed.hostname);
  const site = SITE_BY_HOST[host];
  if (!site) {
    throw new HttpError(
      400,
      'Links from X, Instagram, TikTok, YouTube and Reddit can be imported.'
    );
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  let url: string;

  if (site === 'x') {
    // x.com/<user>/status/<id>/photo/1 -> x.com/i/status/<id>. The username can change.
    const at = parts.indexOf('status');
    const id = at >= 0 ? parts[at + 1] : undefined;
    if (!id || !/^\d+$/.test(id)) {
      throw new HttpError(400, 'Link to a single post on X.');
    }
    url = `https://x.com/i/status/${id}`;
  } else if (site === 'youtube') {
    const id =
      host === 'youtu.be'
        ? parts[0]
        : parts[0] === 'shorts' || parts[0] === 'live'
          ? parts[1]
          : parsed.searchParams.get('v');
    if (!id || !/^[\w-]{6,}$/.test(id)) {
      throw new HttpError(400, 'Link to a single YouTube video or short.');
    }
    url = `https://www.youtube.com/watch?v=${id}`;
  } else if (site === 'instagram') {
    const at = parts.findIndex((p) => ['p', 'reel', 'reels', 'tv'].includes(p));
    const code = at >= 0 ? parts[at + 1] : undefined;
    if (!code) {
      throw new HttpError(400, 'Link to a single Instagram post or reel.');
    }
    url = `https://www.instagram.com/p/${code}/`;
  } else if (site === 'reddit' && host === 'reddit.com') {
    // reddit.com/r/<sub>/comments/<id>/<slug> -> reddit.com/comments/<id>
    const at = parts.indexOf('comments');
    const id = at >= 0 ? parts[at + 1] : undefined;
    if (!id) {
      throw new HttpError(400, 'Link to a single Reddit post.');
    }
    url = `https://www.reddit.com/comments/${id}/`;
  } else {
    // TikTok and short links (redd.it, vm.tiktok.com): keep the path, drop tracking params.
    url = `https://${host === 'tiktok.com' ? 'www.tiktok.com' : host}/${parts.join('/')}`;
  }

  return { url, site };
}

function run(
  command: string,
  args: string[]
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    // An argument array and no shell: nothing in the link is ever interpreted.
    const child = spawn(command, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      // Keep the tail only; yt-dlp can be chatty.
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.stdout.resume();
    const timer = setTimeout(() => child.kill('SIGKILL'), DOWNLOAD_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code: signal ? -1 : (code ?? -1), stderr });
    });
  });
}

// yt-dlp's errors, turned into something a person can act on.
function explainYtDlpError(stderr: string): string {
  const line = stderr
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.startsWith('ERROR:'));
  const text = (line ?? '').toLowerCase();
  if (
    text.includes('no video could be found') ||
    text.includes('no media found') ||
    text.includes('there is no video')
  ) {
    return 'That post has no video, and only videos and X photos can be imported. Save the image and upload it instead.';
  }
  if (
    text.includes('login') ||
    text.includes('cookies') ||
    text.includes('private') ||
    text.includes('rate-limit')
  ) {
    return "That site wouldn't share the post without a login. Download it yourself and upload the file.";
  }
  if (text.includes('max-filesize') || text.includes('larger than max')) {
    return `That video is over ${MAX_VIDEO_BYTES / (1024 * 1024)} MB.`;
  }
  if (
    text.includes('unavailable') ||
    text.includes('not found') ||
    text.includes('404')
  ) {
    return 'That post is gone or unavailable.';
  }
  return "Couldn't get the media from that link.";
}

async function downloadVideo(url: string): Promise<ImportedMedia> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'memecache-import-'));
  try {
    const { code, stderr } = await run(YT_DLP, [
      '--no-playlist',
      '--no-update',
      '--no-progress',
      '--no-mtime',
      '--no-config',
      // The site list is checked above; never let a link fall through to "any web page".
      '--use-extractors',
      'default,-generic',
      '--socket-timeout',
      '15',
      '--max-filesize',
      String(MAX_VIDEO_BYTES),
      '-f',
      'bv*+ba/b',
      '-S',
      FORMAT_SORT,
      '--merge-output-format',
      'mp4',
      ...(FFMPEG ? ['--ffmpeg-location', FFMPEG] : []),
      // YouTube needs a JavaScript runtime now; the one running this app will do.
      '--js-runtimes',
      `node:${process.execPath}`,
      '-o',
      path.join(dir, 'media.%(ext)s'),
      '--',
      url,
    ]);

    // --max-filesize skips an oversized download but still exits 0.
    const files = (await readdir(dir)).filter(
      (f) => f.startsWith('media.') && !f.endsWith('.part')
    );
    if (code !== 0 || files.length === 0) {
      if (code === -1) {
        throw new HttpError(504, 'That took too long to download.');
      }
      if (code === 0) {
        throw new HttpError(
          413,
          `That video is over ${MAX_VIDEO_BYTES / (1024 * 1024)} MB.`
        );
      }
      console.error('yt-dlp failed for', url, stderr);
      throw new HttpError(422, explainYtDlpError(stderr));
    }

    // A failed merge leaves separate video and audio files; take a playable one if any.
    const file = path.join(
      dir,
      files.find((f) => VIDEO_TYPES[path.extname(f).slice(1)]) ?? files[0]
    );
    const ext = path.extname(file).slice(1).toLowerCase();
    const contentType = VIDEO_TYPES[ext];
    if (!contentType) {
      throw new HttpError(
        422,
        `That came out as ${ext.toUpperCase()}, which can't be uploaded.`
      );
    }
    if ((await stat(file)).size > MAX_VIDEO_BYTES) {
      throw new HttpError(
        413,
        `That video is over ${MAX_VIDEO_BYTES / (1024 * 1024)} MB.`
      );
    }
    return {
      bytes: await readFile(file),
      contentType,
      fileName: `import.${ext}`,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// X's embed endpoint (what embedded tweets use) lists a tweet's photos without a login.
// The token is the one its own embed script derives from the id.
async function downloadXPhoto(statusId: string): Promise<ImportedMedia | null> {
  const token = ((Number(statusId) / 1e15) * Math.PI)
    .toString(36)
    .replace(/(0+|\.)/g, '');
  const response = await fetch(
    `https://cdn.syndication.twimg.com/tweet-result?id=${statusId}&token=${token}`,
    { signal: AbortSignal.timeout(15_000) }
  );
  if (!response.ok) {
    return null;
  }
  const tweet = (await response.json()) as { photos?: { url: string }[] };
  const photo = tweet.photos?.[0]?.url;
  if (!photo || new URL(photo).hostname !== 'pbs.twimg.com') {
    return null;
  }

  // name=large is the biggest size X serves without a login.
  const image = await fetch(`${photo}?name=large`, {
    signal: AbortSignal.timeout(15_000),
  });
  const contentType = image.headers.get('content-type')?.split(';')[0] ?? '';
  if (
    !image.ok ||
    !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(
      contentType
    )
  ) {
    return null;
  }
  const bytes = Buffer.from(await image.arrayBuffer());
  if (bytes.length > MAX_IMPORTED_IMAGE_BYTES) {
    throw new HttpError(413, 'That image is too large.');
  }
  return {
    bytes,
    contentType,
    fileName: `import.${contentType.split('/')[1]}`,
  };
}

// Downloads the media behind a normalized link (from normalizeImportUrl).
export async function importMedia(
  url: string,
  site: string
): Promise<ImportedMedia> {
  try {
    return await downloadVideo(url);
  } catch (error) {
    // A photo tweet: yt-dlp only does video, so try the photo before giving up.
    if (site === 'x' && error instanceof HttpError && error.status === 422) {
      const photo = await downloadXPhoto(url.split('/').pop()!).catch(
        () => null
      );
      if (photo) {
        return photo;
      }
    }
    if (
      !(error instanceof HttpError) &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      console.error('yt-dlp is not installed or YT_DLP_PATH is wrong:', error);
      throw new HttpError(
        503,
        'Importing from links is not set up on this server.'
      );
    }
    throw error;
  }
}
