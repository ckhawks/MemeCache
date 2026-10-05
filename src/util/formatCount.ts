// A count short enough for a metadata line: 950, 1.2k, 12k, 3.4m. One decimal below ten,
// none above, and never "1000k": a number that rounds up to the next unit moves to it.
export function formatCount(count: number): string {
  if (count < 1000) {
    return String(count);
  }
  const units: [number, string][] = [
    [1e9, 'b'],
    [1e6, 'm'],
    [1e3, 'k'],
  ];
  for (let i = 0; i < units.length; i++) {
    const [size, suffix] = units[i];
    if (count < size) {
      continue;
    }
    const value = count / size;
    const shown = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
    if (shown >= 1000 && i > 0) {
      return formatCount(units[i - 1][0]);
    }
    return `${shown}${suffix}`;
  }
  return String(count);
}
