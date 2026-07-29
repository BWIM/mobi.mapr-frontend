import {
  ScoreColorConfig,
  ScoreLegendItem,
  buildLegendItems,
} from './score-colors.util';

/** Brand violet used for the largest difference step. */
export const DIFFERENCE_VIOLET = '#2C104C';
export const DIFFERENCE_WHITE = '#FFFFFF';

/** Quality index break points (on index/100), matching map quality legend. */
export const QUALITY_DIFF_THRESHOLDS = [0.35, 0.5, 0.71, 1.0, 1.41] as const;
export const QUALITY_DIFF_BRACKET_IDS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

export interface DifferenceColorStep {
  bracketId: string;
  /** Inclusive lower bound of the absolute difference. */
  lowerBound: number;
  /** Exclusive upper bound; null = open-ended. */
  upperBound: number | null;
  color: string;
  segmentLabel: string;
}

export interface DifferenceColorConfig {
  steps: DifferenceColorStep[];
  defaultColor: string;
}

function lerpChannel(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * t);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

/** Interpolate white → violet across `count` discrete steps (index 0 = white). */
export function buildWhiteToVioletRamp(count: number): string[] {
  if (count <= 0) {
    return [];
  }
  if (count === 1) {
    return [`rgb(${hexToRgb(DIFFERENCE_WHITE).r}, ${hexToRgb(DIFFERENCE_WHITE).g}, ${hexToRgb(DIFFERENCE_WHITE).b})`];
  }

  const from = hexToRgb(DIFFERENCE_WHITE);
  const to = hexToRgb(DIFFERENCE_VIOLET);
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    colors.push(
      `rgb(${lerpChannel(from.r, to.r, t)}, ${lerpChannel(from.g, to.g, t)}, ${lerpChannel(from.b, to.b, t)})`
    );
  }
  return colors;
}

function formatQualityDiffLabel(lowerBound: number, upperBound: number | null): string {
  if (upperBound === null) {
    return `${lowerBound}+`;
  }
  if (lowerBound === 0) {
    return `≤${upperBound}`;
  }
  return `${lowerBound}-${upperBound}`;
}

export function buildTimeDifferenceConfig(scoreConfig: ScoreColorConfig): DifferenceColorConfig {
  const colors = buildWhiteToVioletRamp(scoreConfig.steps.length);
  const legendItems = buildLegendItems(scoreConfig);
  const steps: DifferenceColorStep[] = scoreConfig.steps.map((step, index) => ({
    bracketId: step.bracketId,
    lowerBound: step.lowerBound,
    upperBound: step.upperBound,
    color: colors[index],
    segmentLabel: legendItems[index]?.segmentLabel ?? String(step.lowerBound),
  }));

  return {
    steps,
    defaultColor: colors[0] ?? DIFFERENCE_WHITE,
  };
}

export function buildQualityDifferenceConfig(): DifferenceColorConfig {
  const bracketIds = [...QUALITY_DIFF_BRACKET_IDS];
  const colors = buildWhiteToVioletRamp(bracketIds.length);
  const thresholds = [...QUALITY_DIFF_THRESHOLDS];

  const steps: DifferenceColorStep[] = bracketIds.map((bracketId, index) => {
    const lowerBound = index === 0 ? 0 : thresholds[index - 1];
    const upperBound = index < thresholds.length ? thresholds[index] : null;
    return {
      bracketId,
      lowerBound,
      upperBound,
      color: colors[index],
      segmentLabel: formatQualityDiffLabel(lowerBound, upperBound),
    };
  });

  return {
    steps,
    defaultColor: colors[0] ?? DIFFERENCE_WHITE,
  };
}

export function buildDifferenceLegendItems(config: DifferenceColorConfig): ScoreLegendItem[] {
  return config.steps.map((step) => ({
    bracketId: step.bracketId,
    color: step.color,
    segmentLabel: step.segmentLabel,
  }));
}

/**
 * MapLibre step expression coloring by feature-state `diff`.
 * Missing / invalid diff → transparent.
 */
export function buildDifferenceFillColorExpression(config: DifferenceColorConfig): unknown[] {
  const stepExpression: unknown[] = [
    'step',
    ['coalesce', ['feature-state', 'diff'], -1],
    config.defaultColor,
  ];

  for (const step of config.steps) {
    if (step.lowerBound <= 0) {
      continue;
    }
    stepExpression.push(step.lowerBound, step.color);
  }

  return [
    'case',
    ['!', ['to-boolean', ['feature-state', 'hasDiff']]],
    'rgba(128, 128, 128, 0)',
    ['<', ['coalesce', ['feature-state', 'diff'], -1], 0],
    'rgba(128, 128, 128, 0)',
    stepExpression,
  ];
}

export function isDifferenceInSelectedBrackets(
  diff: number,
  config: DifferenceColorConfig,
  selectedBracketIds: string[]
): boolean {
  if (selectedBracketIds.length === 0) {
    return false;
  }
  if (selectedBracketIds.length >= config.steps.length) {
    return true;
  }

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
