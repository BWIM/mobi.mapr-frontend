import {
  ScoreColorConfig,
  ScoreLegendItem,
  buildLegendItems,
} from './score-colors.util';
import { GRADE_LETTERS, GRADE_THRESHOLDS, getGradeStep } from './grade.util';

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
  return Math.max(0, getGradeStep(indexValue * 100));
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
  const bracketIds = [...GRADE_LETTERS];
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
 * Score that marks "no data" in tiles (capped travel time, in seconds). Mirrors
 * `NO_DATA_SCORE` in map.service (kept here to avoid an import cycle).
 */
const NO_DATA_SCORE = 15000;

/**
 * Difference tiles (`/diff-tiles/`) carry both sides per feature:
 * `left_score` / `right_score` (seconds) and `left_index` / `right_index` (index × 100).
 * A side is missing (property absent) when only the other profile set has a score.
 */
type DiffSide = 'left' | 'right';
type DiffMetric = 'index' | 'score';

function sideProperty(side: DiffSide, metric: DiffMetric): string {
  return `${side}_${metric}`;
}

/** Grade-step expression (0 = A … 5 = F) on an index × 100; mirrors getQualityGradeStep. */
function gradeStepExpression(indexExpression: unknown[]): unknown[] {
  const expression: unknown[] = ['step', indexExpression, 0];
  GRADE_THRESHOLDS.forEach((threshold, step) => {
    expression.push(Math.round(threshold * 100), step + 1);
  });
  return expression;
}

/** True when the side has a comparable value (score not capped, index > 0). */
function sideValidExpression(side: DiffSide, metric: DiffMetric): unknown[] {
  const key = sideProperty(side, metric);
  const value = ['to-number', ['get', key], metric === 'score' ? NO_DATA_SCORE : 0];
  return metric === 'score'
    ? ['all', ['has', key], ['!=', value, NO_DATA_SCORE]]
    : ['all', ['has', key], ['>', value, 0]];
}

/** True when both sides have a comparable value (otherwise the feature is not drawn). */
export function buildHasDiffExpression(metric: DiffMetric): unknown[] {
  return ['all', sideValidExpression('left', metric), sideValidExpression('right', metric)];
}

/**
 * Signed difference left − right (lower is better for both metrics):
 * > 0 → right better, < 0 → left better. Quality in grade steps, time in seconds.
 * Only meaningful where buildHasDiffExpression is true.
 */
export function buildSignedDiffExpression(metric: DiffMetric): unknown[] {
  const left = ['to-number', ['get', sideProperty('left', metric)], 0];
  const right = ['to-number', ['get', sideProperty('right', metric)], 0];
  return metric === 'index'
    ? ['-', gradeStepExpression(left), gradeStepExpression(right)]
    : ['-', left, right];
}

/** Both sides and the signed diff of a difference-tile feature, as the map colours it. */
export interface FeatureDifference {
  /** Left value: seconds (score) or index × 100; null when missing. */
  left: number | null;
  right: number | null;
  /** Signed left − right (grade steps or seconds); null unless both sides are present. */
  diff: number | null;
}

/** TypeScript twin of the expressions above, e.g. for the hover popup. */
export function getFeatureDifference(
  properties: Record<string, unknown> | null | undefined,
  metric: DiffMetric
): FeatureDifference {
  const read = (side: DiffSide): number | null => {
    const raw = properties?.[sideProperty(side, metric)];
    if (raw === undefined || raw === null || raw === '') {
      return null;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return null;
    }
    if (metric === 'score' ? value === NO_DATA_SCORE : value <= 0) {
      return null;
    }
    return value;
  };
  const left = read('left');
  const right = read('right');
  if (left === null || right === null) {
    return { left, right, diff: null };
  }
  const diff = metric === 'index'
    ? getQualityGradeStep(left / 100) - getQualityGradeStep(right / 100)
    : left - right;
  return { left, right, diff };
}

/**
 * MapLibre colour expression on the signed difference (left − right) computed from the
 * diff-tile properties. Features without a value on both sides are transparent.
 */
export function buildDifferenceFillColorExpression(config: DifferenceColorConfig, metric: DiffMetric): unknown[] {
  const steps = config.steps;
  const last = steps[steps.length - 1];
  const stepExpression: unknown[] = [
    'step',
    buildSignedDiffExpression(metric),
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
    ['!', buildHasDiffExpression(metric)],
    'rgba(128, 128, 128, 0)',
    stepExpression,
  ];
}

/**
 * True when the magnitude of the difference falls into a selected bracket
 * (expression twin of isDifferenceInSelectedBrackets).
 */
export function buildDiffInSelectionExpression(
  config: DifferenceColorConfig,
  metric: DiffMetric,
  selectedBracketIds: string[]
): unknown {
  if (selectedBracketIds.length === 0) {
    return false;
  }
  if (selectedBracketIds.length >= config.steps.length) {
    return true;
  }
  const [first, ...rest] = config.steps;
  const bracketId: unknown[] = ['step', ['abs', buildSignedDiffExpression(metric)], first.bracketId];
  for (const step of rest) {
    bracketId.push(step.lowerBound, step.bracketId);
  }
  return ['in', bracketId, ['literal', selectedBracketIds]];
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
