'use client';

import { useRef, useState } from 'react';
import ReactCrop, { type PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import styles from '../main.module.scss';
import { analyzeImage } from '@/util/cropImage';
import { type Box, type Edges, snapCrop } from '@/util/imageEdges';

// How close, in screen pixels, a crop edge has to come to a detected line to snap onto it.
const SNAP_DISTANCE_PX = 10;

const toBox = (crop: PercentCrop): Box => ({
  x: crop.x / 100,
  y: crop.y / 100,
  width: crop.width / 100,
  height: crop.height / 100,
});

const toCrop = (box: Box): PercentCrop => ({
  unit: '%',
  x: box.x * 100,
  y: box.y * 100,
  width: box.width * 100,
  height: box.height * 100,
});

// The upload preview with a free-form crop box. Drag on the image to select; edges snap to
// lines detected in the image (screenshot bars, panel borders, caption blocks). Reports the
// crop as fractions of the image, or null for no crop.
export default function CropEditor(props: {
  src: string;
  onChange: (crop: Box | null) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<PercentCrop | undefined>(undefined);
  const [edges, setEdges] = useState<Edges | null>(null);

  const update = (next: PercentCrop | undefined) => {
    setCrop(next);
    props.onChange(next && next.width > 0 && next.height > 0 ? toBox(next) : null);
  };

  const onChange = (_: unknown, percent: PercentCrop) => {
    const img = imgRef.current;
    if (!edges || !img || percent.width === 0 || percent.height === 0) {
      update(percent);
      return;
    }
    const snapped = snapCrop(toBox(percent), crop ? toBox(crop) : null, edges, {
      x: SNAP_DISTANCE_PX / img.width,
      y: SNAP_DISTANCE_PX / img.height,
    });
    update(toCrop(snapped));
  };

  const content = edges?.content;
  const hasBorder =
    content !== undefined &&
    (content.x > 0.005 ||
      content.y > 0.005 ||
      content.width < 0.99 ||
      content.height < 0.99);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}
      // The detected snap lines, for inspecting what the crop will snap to.
      data-snap-rows={edges?.rows.map((r) => r.toFixed(3)).join(' ')}
      data-snap-cols={edges?.cols.map((c) => c.toFixed(3)).join(' ')}
    >
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--sub-text-color)', fontSize: '14px' }}>
          Drag on the image to crop. Edges snap to lines in the image.
        </span>
        {hasBorder && content && (
          <button
            type="button"
            className={`${styles['button']} ${styles['button-secondary']} ${styles['button-small']}`}
            onClick={() => update(toCrop(content))}
          >
            Auto-trim borders
          </button>
        )}
        {crop && crop.width > 0 && (
          <button
            type="button"
            className={`${styles['button']} ${styles['button-secondary']} ${styles['button-small']}`}
            onClick={() => update(undefined)}
          >
            Reset crop
          </button>
        )}
      </div>
      {/* Shrink to the image: crop percentages are measured against this box, and in a
          stretched flex column it was wider than the image, so crops ran off its side. */}
      <ReactCrop
        crop={crop}
        onChange={onChange}
        keepSelection={false}
        style={{ alignSelf: 'flex-start', maxWidth: '100%' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={props.src}
          alt="Preview of the selected file"
          style={{ maxWidth: '100%', maxHeight: '70vh' }}
          onLoad={(e) => setEdges(analyzeImage(e.currentTarget))}
        />
      </ReactCrop>
    </div>
  );
}
