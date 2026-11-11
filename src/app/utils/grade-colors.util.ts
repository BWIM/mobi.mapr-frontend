/**
 * Grade (A–F) colours for the quality index.
 * Must match map.service.ts getIndexFillColorExpression().
 *
 * @param indexValue index as a ratio (e.g. 0.42), i.e. API `index / 100`
 */
export function getGradeRgb(indexValue: number): string {
  if (!(indexValue > 0)) return '128, 128, 128'; // NaN or invalid
  if (indexValue < 0.35) return '50, 97, 45'; // A
  if (indexValue < 0.5) return '60, 176, 67'; // B
  if (indexValue < 0.71) return '238, 210, 2'; // C
  if (indexValue < 1.0) return '237, 112, 20'; // D
  if (indexValue < 1.41) return '194, 24, 7'; // E
  return '150, 86, 162'; // F
}

export function getGradeColor(indexValue: number, alpha = 1): string {
  return `rgba(${getGradeRgb(indexValue)}, ${alpha})`;
}

/** Dark or white text, whichever is readable on the given rgb()/rgba()/hex colour. */
export function getContrastTextColor(color: string | null | undefined): string {
  if (!color) {
    return '#ffffff';
  }
  let r: number, g: number, b: number;
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map(c => c + c).join('') : hex[1];
    [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  } else {
    const m = color.match(/(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/);
    if (!m) {
      return '#ffffff';
    }
    [r, g, b] = [m[1], m[2], m[3]].map(Number);
  }
  // Perceived luminance (ITU-R BT.601)
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1a1a1a' : '#ffffff';
}
