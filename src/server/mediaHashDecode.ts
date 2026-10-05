import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { ANALYSIS_SIZE, computeFingerprint, type Fingerprint } from '@/server/mediaHash';

// Turns a stored or uploaded file into a fingerprint (src/server/mediaHash.ts). Images are
// decoded with sharp; a GIF or animated WebP by its first frame. A video is fingerprinted
// by one frame, one second in (or its first frame when it is shorter), taken with ffmpeg:
// that catches the same clip uploaded again, not the same clip trimmed differently.

// A frame grab that has not finished by then is abandoned.
const FFMPEG_TIMEOUT_MS = 20_000;
// Decoding stops at this many pixels, so a crafted image cannot exhaust memory.
const MAX_INPUT_PIXELS = 100_000_000;

export async function fingerprintImage(file: Buffer): Promise<Fingerprint> {
  const { data, info } = await sharp(file, { animated: false, limitInputPixels: MAX_INPUT_PIXELS })
    // Phone photos carry their rotation as metadata.
    .rotate()
    // Transparent areas read as white, which is how the site shows them.
    .flatten({ background: '#ffffff' })
    .resize(ANALYSIS_SIZE, ANALYSIS_SIZE, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return computeFingerprint({
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
    width: info.width,
    height: info.height,
  });
}

// FFMPEG_PATH (shared with the link import) may name the binary or the folder it is in.
async function ffmpegCommand(): Promise<string> {
  const configured = process.env.FFMPEG_PATH;
  if (!configured) {
    return 'ffmpeg';
  }
  const info = await stat(configured).catch(() => null);
  return info?.isDirectory() ? path.join(configured, 'ffmpeg') : configured;
}

// One frame as PNG, or an empty buffer when the video has no frame at that time.
function grabFrame(command: string, input: string, seconds: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      command,
      [
        '-v',
        'error',
        '-ss',
        String(seconds),
        '-i',
        input,
        '-frames:v',
        '1',
        '-f',
        'image2pipe',
        '-vcodec',
        'png',
        '-',
      ],
      { windowsHide: true }
    );
    const chunks: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), FFMPEG_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

export async function videoFrame(file: Buffer): Promise<Buffer> {
  // Written to disk: an MP4 whose index sits at the end cannot be read from a pipe.
  const dir = await mkdtemp(path.join(os.tmpdir(), 'memecache-frame-'));
  try {
    const input = path.join(dir, 'video');
    await writeFile(input, file);
    const command = await ffmpegCommand();
    const frame = await grabFrame(command, input, 1);
    if (frame.length > 0) {
      return frame;
    }
    const first = await grabFrame(command, input, 0);
    if (first.length === 0) {
      throw new Error('ffmpeg found no frame in the video.');
    }
    return first;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function fingerprintMedia(file: Buffer, contentType: string): Promise<Fingerprint> {
  if (contentType.startsWith('video/')) {
    return fingerprintImage(await videoFrame(file));
  }
  return fingerprintImage(file);
}
