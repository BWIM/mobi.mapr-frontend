import {
  ScoreColorConfig,
  ScoreLegendItem,
  buildLegendItems,
} from './score-colors.util';

/**
 * Diverging difference palette (signed diff = left − right; lower values are better):
 *  - negative → left map better  → magenta ramp
 *  - ~0       → about the same    → muted neutral (recedes so changes stand out)
 *  - positive → right map better → teal ramp
 * Teal ↔ magenta stays distinguishable for common colour-vision deficiencies and
 * does not clash with the green→red grade colours.
 */
export const DIFFERENCE_NEUTRAL = 'rgba(150, 150, 165, 0.35)';
const LEFT_BETTER_RAMP = ['#f2b8db', '#e27bbd', '#c8449b', '#9b1d78', '#650c50'];
const RIGHT_BETTER_RAMP = ['#a8e0d6', '#5fc2b2', '#22998a', '#0f7166', '#064943'];

/** Quality index break points (on index/100), matching map quality legend. */
export const QUALITY_DIFF_THRESHOLDS = [0.35, 0.5, 0.71, 1.0, 1.41] as const;
export const QUALITY_DIFF_BRACKET_IDS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/** One magnitude bracket; colours differ by which side is better. */
export interface DifferenceColorStep {
  bracketId: string;
  /** Inclusive lower bound of the absolute difference. */
  lowerBound: number;
  /** Exclusive upper bound; null = open-ended. */
  upperBound: number | null;
  /** Colour when the left map is better (unused for the first, neutral step). */
  leftBetterColor: string;
  /** Colour when the right map is better (unused for the first, neutral step). */
  rightBetterColor: string;
  segmentLabel: string;
}

export interface DifferenceColorConfig {
  /** Magnitude brackets, ascending; steps[0] is the neutral "about the same" bracket. */
  steps: DifferenceColorStep[];
  neutralColor: string;
}

/** Signed legend cell (left-better … neutral … right-better). */
export interface DifferenceLegendItem extends ScoreLegendItem {
  /** -1 = left better, 0 = about the same, 1 = right better. */
  direction: -1 | 0 | 1;
  /** Index into DifferenceColorConfig.steps. */
  stepIndex: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

/** Pick `count` colours from a ramp, spreading evenly (interpolating when count exceeds the ramp). */
function sampleRamp(ramp: string[], count: number): string[] {
  if (count <= 0) {
    return [];
  }
  if (count === 1) {
    return [ramp[Math.floor(ramp.length / 2)]];
  }
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const pos = (i / (count - 1)) * (ramp.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(ramp.length - 1, lo + 1);
    const t = pos - lo;
    const a = hexToRgb(ramp[lo]);
    const b = hexToRgb(ramp[hi]);
    const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
    out.push(`rgb(${mix(a.r, b.r)}, ${mix(a.g, b.g)}, ${mix(a.b, b.b)})`);
  }
  return out;
}

function withColors(
  brackets: Array<Omit<DifferenceColorStep, 'leftBetterColor' | 'rightBetterColor'>>
): DifferenceColorConfig {
  const nonNeutral = Math.max(0, brackets.length - 1);
  const left = sampleRamp(LEFT_BETTER_RAMP, nonNeutral);
  const right = sampleRamp(RIGHT_BETTER_RAMP, nonNeutral);
  return {
    neutralColor: DIFFERENCE_NEUTRAL,
    steps: brackets.map((bracket, index) => ({
      ...bracket,
      leftBetterColor: index === 0 ? DIFFERENCE_NEUTRAL : left[index - 1],
      rightBetterColor: index === 0 ? DIFFERENCE_NEUTRAL : right[index - 1],
    })),
  };
}

/**
 * Grade step of a quality index (0 = A … 5 = F).
 * @param indexValue index as a ratio (API `index / 100`)
 */
export function getQualityGradeStep(indexValue: number): number {
  const step = QUALITY_DIFF_THRESHOLDS.findIndex((threshold) => indexValue < threshold);
  return step === -1 ? QUALITY_DIFF_THRESHOLDS.length : step;
}

/** Time difference brackets reuse the time legend brackets (in seconds). */
export function buildTimeDifferenceConfig(scoreConfig: ScoreColorConfig): DifferenceColorConfig {
  return withColors(
    scoreConfig.steps.map((step, index) => ({
      bracketId: step.bracketId,
      lowerBound: step.lowerBound,
      upperBound: step.upperBound,
      // Compact labels: neutral "≈", otherwise the lower bound in minutes
      segmentLabel: index === 0 ? '≈' : String(Math.floor(step.lowerBound / 60)),
    }))
  );
}

/**
 * Quality difference is measured in grade steps: 0 = same grade (A vs A),
 * 1 = one grade apart (A vs B), … 5 = A vs F. Bracket ids stay A–F so the
 * existing quality bracket selection keeps working (A ↔ 0 steps, B ↔ 1 step, …).
 */
export function buildQualityDifferenceConfig(): DifferenceColorConfig {
  const bracketIds = [...QUALITY_DIFF_BRACKET_IDS];
  return withColors(
    bracketIds.map((bracketId, index) => ({
      bracketId,
      lowerBound: index,
      upperBound: index < bracketIds.length - 1 ? index + 1 : null,
      segmentLabel: index === 0 ? '=' : String(index),
    }))
  );
}

/** Legend cells from "left much better" through neutral to "right much better". */
export function buildDifferenceLegendItems(config: DifferenceColorConfig): DifferenceLegendItem[] {
  const items: DifferenceLegendItem[] = [];
  for (let i = config.steps.length - 1; i >= 1; i--) {
    const step = config.steps[i];
    items.push({ bracketId: step.bracketId, color: step.leftBetterColor, segmentLabel: step.segmentLabel, direction: -1, stepIndex: i });
  }
  const neutral = config.steps[0];
  if (neutral) {
    items.push({ bracketId: neutral.bracketId, color: config.neutralColor, segmentLabel: neutral.segmentLabel, direction: 0, stepIndex: 0 });
  }
  for (let i = 1; i < config.steps.length; i++) {
    const step = config.steps[i];
    items.push({ bracketId: step.bracketId, color: step.rightBetterColor, segmentLabel: step.segmentLabel, direction: 1, stepIndex: i });
  }
  return items;
}

/** Tiny offset so a value exactly on a negative boundary falls into the smaller bracket. */
const BOUNDARY_EPSILON = 1e-6;

/**
 * MapLibre colour expression on the signed feature-state `diff` (left − right).
 * Features without a comparable value (`hasDiff` false) are transparent.
 */
export function buildDifferenceFillColorExpression(config: DifferenceColorConfig): unknown[] {
  const steps = config.steps;
  const last = steps[steps.length - 1];
  const stepExpression: unknown[] = [
    'step',
    ['to-number', ['feature-state', 'diff'], 0],
    last ? last.leftBetterColor : config.neutralColor,
  ];

  // Left better: diff in (-upper, -lower]  → starts just above -upper (= -lower of the next bracket)
  for (let i = steps.length - 2; i >= 0; i--) {
    const color = i === 0 ? config.neutralColor : steps[i].leftBetterColor;
    stepExpression.push(-steps[i + 1].lowerBound + BOUNDARY_EPSILON, color);
  }
  // Right better: diff in [lower, upper)
  for (let i = 1; i < steps.length; i++) {
    stepExpression.push(steps[i].lowerBound, steps[i].rightBetterColor);
  }

  return [
    'case',
    ['!', ['to-boolean', ['feature-state', 'hasDiff']]],
    'rgba(128, 128, 128, 0)',
    stepExpression,
  ];
}

/** Selection is by magnitude, so a bracket covers both "left better" and "right better". */
export function isDifferenceInSelectedBrackets(
  signedDiff: number,
  config: DifferenceColorConfig,
  selectedBracketIds: string[]
): boolean {
  if (selectedBracketIds.length === 0) {
    return false;
  }
  if (selectedBracketIds.length >= config.steps.length) {
    return true;
  }

  const diff = Math.abs(signedDiff);
  const step = config.steps.find((candidate) => {
    if (diff < candidate.lowerBound) {
      return false;
    }
    if (candidate.upperBound === null) {
      return true;
    }
    return diff < candidate.upperBound;
  });

  return step ? selectedBracketIds.includes(step.bracketId) : false;
}

export function getDifferenceBracketIds(config: DifferenceColorConfig): string[] {
  return config.steps.map((step) => step.bracketId);
}
