/**
 * Single source of truth for the quality grades (A+ … F-) and their colours.
 *
 * All functions take the index as delivered by the API and tile features
 * (e.g. 42 for a ratio of 0.42). The thresholds below apply to `index / 100`.
 *
 * The scale follows h(x) = 0.2511169 · 1.122178^x for x = 1 … 18: the upper bound of the
 * x-th sub-grade is h(x), rounded to two decimals (0.28, 0.32, 0.35, …, 1.78).
 */

export const GRADE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type GradeLetter = (typeof GRADE_LETTERS)[number];

/** The 18 sub-grades, best first. */
export const SUB_GRADES = [
  'A+', 'A', 'A-',
  'B+', 'B', 'B-',
  'C+', 'C', 'C-',
  'D+', 'D', 'D-',
  'E+', 'E', 'E-',
  'F+', 'F', 'F-',
] as const;

/** Exclusive upper bounds (on index / 100) of SUB_GRADES[0 … 16]; everything above is F-. */
export const SUB_GRADE_THRESHOLDS = [
  0.28, 0.32, 0.35,
  0.4, 0.45, 0.5,
  0.56, 0.63, 0.71,
  0.8, 0.9, 1.0,
  1.12, 1.26, 1.41,
  1.59, 1.78,
] as const;

/** Exclusive upper bounds (on index / 100) of grades A … E; everything above is F. */
export const GRADE_THRESHOLDS = [0.35, 0.5, 0.71, 1.0, 1.41] as const;

/** Colour channels per grade letter (A … F). */
export const GRADE_RGB: Readonly<Record<GradeLetter, string>> = {
  A: '50, 97, 45',
  B: '60, 176, 67',
  C: '238, 210, 2',
  D: '237, 112, 20',
  E: '194, 24, 7',
  F: '150, 86, 162',
};

/** Colour for missing or invalid values. */
export const NO_GRADE_RGB = '128, 128, 128';

/** Opacity of the grade colours on the map, and of legend swatches that mirror it. */
export const MAP_GRADE_ALPHA = 0.7;

function isValidIndex(index: number): boolean {
  return Number.isFinite(index) && index > 0;
}

/** Grade step 0 (A) … 5 (F), or -1 for missing or invalid values. */
export function getGradeStep(index: number): number {
  if (!isValidIndex(index)) return -1;
  const ratio = index / 100;
  const step = GRADE_THRESHOLDS.findIndex(threshold => ratio < threshold);
  return step === -1 ? GRADE_THRESHOLDS.length : step;
}

/** Grade letter A … F, or null for missing or invalid values. */
export function getGradeLetter(index: number): GradeLetter | null {
  const step = getGradeStep(index);
  return step === -1 ? null : GRADE_LETTERS[step];
}

/** Sub-grade A+ … F-, or null for missing or invalid values. */
export function getGrade(index: number): string | null {
  if (!isValidIndex(index)) return null;
  const ratio = index / 100;
  const step = SUB_GRADE_THRESHOLDS.findIndex(threshold => ratio < threshold);
  return SUB_GRADES[step === -1 ? SUB_GRADE_THRESHOLDS.length : step];
}

export function getGradeLetterColor(letter: GradeLetter, alpha = 1): string {
  return `rgba(${GRADE_RGB[letter]}, ${alpha})`;
}

/** Grade colour for an API index; grey for missing or invalid values. */
export function getGradeColor(index: number, alpha = 1): string {
  const letter = getGradeLetter(index);
  return `rgba(${letter ? GRADE_RGB[letter] : NO_GRADE_RGB}, ${alpha})`;
}

/** A … F with their colours, for legends. */
export function getGradePalette(alpha = 1): Array<{ letter: GradeLetter; color: string }> {
  return GRADE_LETTERS.map(letter => ({ letter, color: getGradeLetterColor(letter, alpha) }));
}

/**
 * MapLibre expression colouring features by their `index` property.
 * Invalid values get `invalidColor` (transparent by default).
 */
export function buildGradeColorExpression(
  alpha = MAP_GRADE_ALPHA,
  invalidColor = `rgba(${NO_GRADE_RGB}, 0)`,
): unknown[] {
  const ratio = ['/', ['get', 'index'], 100];
  const expression: unknown[] = ['case', ['<=', ratio, 0], invalidColor];
  GRADE_THRESHOLDS.forEach((threshold, step) => {
    expression.push(['<', ratio, threshold], getGradeLetterColor(GRADE_LETTERS[step], alpha));
  });
  expression.push(getGradeLetterColor('F', alpha));
  return expression;
}

/** MapLibre filter expression matching features whose `index` falls into grade `letter`. */
export function buildGradeFilterExpression(letter: GradeLetter): unknown[] {
  const ratio = ['/', ['get', 'index'], 100];
  const step = GRADE_LETTERS.indexOf(letter);
  const lower = step > 0 ? ['>=', ratio, GRADE_THRESHOLDS[step - 1]] : null;
  const upper = step < GRADE_THRESHOLDS.length ? ['<', ratio, GRADE_THRESHOLDS[step]] : null;
  if (lower && upper) return ['all', lower, upper];
  return (lower ?? upper)!;
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
