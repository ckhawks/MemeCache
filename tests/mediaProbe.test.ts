import { describe, expect, it } from 'vitest';
import { parseFfprobe } from '@/server/mediaProbe';

describe('parseFfprobe', () => {
  it('reads size, length and sound', () => {
    const info = parseFfprobe({
      streams: [
        { codec_type: 'video', width: 720, height: 1280 },
        { codec_type: 'audio' },
      ],
      format: { duration: '12.345' },
    });
    expect(info).toEqual({ width: 720, height: 1280, durationMs: 12345, hasAudio: true });
  });

  it('calls a video with no audio stream silent, like a GIF', () => {
    const info = parseFfprobe({ streams: [{ codec_type: 'video', width: 480, height: 270 }], format: { duration: '3' } });
    expect(info.hasAudio).toBe(false);
  });

  it('swaps width and height for a video stored sideways', () => {
    const info = parseFfprobe({
      streams: [{ codec_type: 'video', width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] }],
    });
    expect(info.width).toBe(1080);
    expect(info.height).toBe(1920);
    expect(info.durationMs).toBeNull();
  });
});
