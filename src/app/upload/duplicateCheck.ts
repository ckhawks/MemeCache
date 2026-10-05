import imageCompression from 'browser-image-compression';
import { supportedVideoTypes } from '@/constants/mimeTypes';
import { api } from '@/util/api';
import type { ThumbMeme } from '@/components/MemeThumbStrip';

// Asks the server whether a picked file looks like a meme already here (/api/upload/check).
// What is sent is a small still: the server looks at 256px, so a 512px copy loses nothing
// and keeps a large file from being uploaded twice. A video sends the frame one second in,
// the frame stored videos are fingerprinted by.

const CHECK_SIZE = 512;
// The frame grab gives up after this long (a video the browser cannot decode).
const FRAME_TIMEOUT_MS = 10_000;

function videoFrame(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (finish: () => void) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      finish();
    };
    const timer = setTimeout(() => done(() => reject(new Error('Timed out reading the video.'))), FRAME_TIMEOUT_MS);
    video.muted = true;
    video.preload = 'auto';
    video.onerror = () => done(() => reject(new Error('The browser could not read the video.')));
    video.onloadedmetadata = () => {
      // Shorter than a second: the first frame, as on the server.
      video.currentTime = video.duration >= 1 ? 1 : 0;
    };
    video.onseeked = () => {
      const scale = Math.min(1, CHECK_SIZE / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => done(() => (blob ? resolve(blob) : reject(new Error('No frame.')))), 'image/png');
    };
    video.src = url;
  });
}

async function stillFor(file: File): Promise<Blob> {
  if (supportedVideoTypes.includes(file.type)) {
    return videoFrame(file);
  }
  try {
    return await imageCompression(file, {
      maxWidthOrHeight: CHECK_SIZE,
      useWebWorker: true,
    });
  } catch {
    // The file as it is: the server reads a GIF's first frame by itself.
    return file;
  }
}

// Memes that look like this file. Empty when there are none or the check could not run:
// the warning is a courtesy, never a reason to block an upload.
export async function findLookalikes(file: File): Promise<ThumbMeme[]> {
  try {
    const still = await stillFor(file);
    const formData = new FormData();
    formData.append('file', still, 'still');
    const result = await api<{ duplicates: ThumbMeme[] }>('/api/upload/check', { body: formData });
    return result.duplicates;
  } catch (error) {
    console.error('The duplicate check failed:', error);
    return [];
  }
}
