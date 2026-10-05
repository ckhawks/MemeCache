import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { supportedVideoTypes } from '@/constants/mimeTypes';

// Reads what a meme's file is like (migration 019): pixel size, a video's length, and
// whether it has a sound track. Videos go through ffprobe, images through sharp.
//
// Never fails the upload: anything that goes wrong comes back as unknown (nulls), and an
// unknown video is treated as having sound, so it keeps its player controls.

const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const PROBE_TIMEOUT_MS = 20_000;

export interface MediaInfo {
  width: number | null;
  height: number | null;
  durationMs: number | null;
  hasAudio: boolean | null;
}

const UNKNOWN: MediaInfo = {
  width: null,
  height: null,
  durationMs: null,
  hasAudio: null,
};

export async function probeMedia(bytes: Buffer, contentType: string): Promise<MediaInfo> {
  try {
    if (supportedVideoTypes.includes(contentType)) {
      return await probeVideo(bytes);
    }
    const meta = await sharp(bytes, { animated: true }).metadata();
    return {
      width: meta.width ?? null,
      // An animated image's height covers every frame stacked; pageHeight is one frame.
      height: meta.pageHeight ?? meta.height ?? null,
      durationMs: null,
      hasAudio: null,
    };
  } catch (error) {
    console.error('Could not read media info:', error);
    return UNKNOWN;
  }
}

async function probeVideo(bytes: Buffer): Promise<MediaInfo> {
  // ffprobe wants a file it can seek in; a pipe cannot hold an mp4 whose index is at the end.
  const dir = await mkdtemp(path.join(os.tmpdir(), 'memecache-probe-'));
  try {
    const file = path.join(dir, 'media');
    await writeFile(file, bytes);
    const output = await run(FFPROBE, [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_streams',
      '-show_format',
      file,
    ]);
    return parseFfprobe(JSON.parse(output));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

interface FfprobeOutput {
  streams?: {
    codec_type?: string;
    width?: number;
    height?: number;
    duration?: string;
    tags?: { rotate?: string };
    side_data_list?: { rotation?: number }[];
  }[];
  format?: { duration?: string };
}

export function parseFfprobe(probe: FfprobeOutput): MediaInfo {
  const streams = probe.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  const seconds = Number(probe.format?.duration ?? video?.duration);
  // Phone videos store portrait as landscape plus a rotation; report what is shown.
  const rotation = Math.abs(Number(video?.tags?.rotate ?? video?.side_data_list?.[0]?.rotation ?? 0)) % 180;
  const sideways = rotation === 90;
  return {
    width: (sideways ? video?.height : video?.width) ?? null,
    height: (sideways ? video?.width : video?.height) ?? null,
    durationMs: Number.isFinite(seconds) ? Math.round(seconds * 1000) : null,
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
  };
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // An argument array and no shell.
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), PROBE_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${command} exited with ${code}: ${stderr.slice(-300)}`));
      }
    });
  });
}
