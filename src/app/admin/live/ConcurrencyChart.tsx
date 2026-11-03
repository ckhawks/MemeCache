'use client';

import { useRef, useState } from 'react';
import l from './Live.module.scss';
import type { ConcurrencyPoint, ConcurrencyRange } from '@/db/queries/visits';

const WIDTH = 720;
const HEIGHT = 160;

// What one step covers, for the tooltip.
const STEP_WORDS: Record<ConcurrencyRange, string> = {
  day: 'these 5 minutes',
  week: 'this hour',
  month: 'this day',
};

function label(at: Date | string, range: ConcurrencyRange) {
  const date = new Date(at);
  if (range === 'day') {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (range === 'week') {
    return date.toLocaleString([], { weekday: 'short', hour: 'numeric' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// People on the site per step, as a stepped line over a light fill, with a crosshair and
// tooltip on hover. One series, so no legend: the heading names it.
export default function ConcurrencyChart({ points, range }: { points: ConcurrencyPoint[]; range: ConcurrencyRange }) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return null;
  }
  const max = Math.max(1, ...points.map((p) => p.people));
  const stepWidth = WIDTH / points.length;
  const y = (value: number) => HEIGHT - (value / max) * (HEIGHT - 8);

  // A step line: flat across each step, straight up or down between them.
  let line = '';
  points.forEach((p, i) => {
    const x0 = i * stepWidth;
    const x1 = x0 + stepWidth;
    line += `${i === 0 ? 'M' : 'L'}${x0},${y(p.people)} L${x1},${y(p.people)} `;
  });
  const area = `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;

  const onMove = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const index = Math.floor(((clientX - rect.left) / rect.width) * points.length);
    setHover(Math.min(points.length - 1, Math.max(0, index)));
  };

  const hovered = hover === null ? null : points[hover];
  const peak = points.reduce((best, p) => (p.people > best.people ? p : best), points[0]);

  return (
    <div className={l.chart}>
      <div className={l.yMax}>{max.toLocaleString()}</div>
      <div
        ref={box}
        className={l.plot}
        onMouseMove={(event) => onMove(event.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchMove={(event) => onMove(event.touches[0].clientX)}
        onTouchEnd={() => setHover(null)}
        role="img"
        aria-label={`People on the site, peaking at ${peak.people} around ${label(peak.at, range)}.`}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className={l.svg}>
          <line x1={0} x2={WIDTH} y1={y(max)} y2={y(max)} className={l.grid} />
          <line x1={0} x2={WIDTH} y1={y(max / 2)} y2={y(max / 2)} className={l.grid} />
          <path d={area} className={l.area} />
          <path d={line} className={l.line} vectorEffect="non-scaling-stroke" />
          {hover !== null && hovered && (
            <line
              x1={(hover + 0.5) * stepWidth}
              x2={(hover + 0.5) * stepWidth}
              y1={0}
              y2={HEIGHT}
              className={l.crosshair}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {hover !== null && hovered && (
          <>
            <div
              className={l.marker}
              style={{
                left: `${((hover + 0.5) / points.length) * 100}%`,
                top: `${(y(hovered.people) / HEIGHT) * 100}%`,
              }}
            />
            <div
              className={l.chartTooltip}
              style={{
                left: `${((hover + 0.5) / points.length) * 100}%`,
                // Kept inside the chart at either end.
                transform: `translateX(${hover < points.length * 0.2 ? '-10%' : hover > points.length * 0.8 ? '-90%' : '-50%'})`,
              }}
            >
              <strong>{label(hovered.at, range)}</strong>
              <br />
              {hovered.people.toLocaleString()} {hovered.people === 1 ? 'person' : 'people'} in {STEP_WORDS[range]}
              <br />
              <span className={l.muted}>{hovered.members.toLocaleString()} {hovered.members === 1 ? 'member' : 'members'}</span>
            </div>
          </>
        )}
      </div>
      <div className={l.axis}>
        <span>{label(points[0].at, range)}</span>
        <span>{label(points[Math.floor(points.length / 2)].at, range)}</span>
        <span>now</span>
      </div>
    </div>
  );
}
