export const NO_SCORE_COLOR = 'rgb(233, 233, 233)';

export interface ScoreColorStep {
  bracketId: string;
  threshold: number;
  color: string;
  lowerBound: number;
  upperBound: number | null;
}

export interface ScoreColorConfig {
  steps: ScoreColorStep[];
  defaultColor: string;
}

export interface ScoreLegendItem {
  bracketId: string;
  color: string;
  segmentLabel: string;
}

const RGB_PATTERN = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)$/;

function isValidColor(color: string): boolean {
  return RGB_PATTERN.test(color.trim());
}

function thresholdToBoundaryLabel(threshold: number, isLast: boolean): string {
  if (threshold === 0) {
    return '0';
  }
  const minutes = Math.floor(threshold / 60);
  return isLast ? `${minutes}+` : String(minutes - 1);
}

function buildSegmentLabel(lowerBound: number, upperBound: number | null): string {
  const lowerMinutes = Math.floor(lowerBound / 60);
  const upperMinutes = upperBound === null ? null : Math.floor((upperBound - 1) / 60);

  if (upperBound === null) {
    return `${lowerMinutes}+`;
  }
  if (lowerBound === 0) {
    return `≤${upperMinutes}`;
  }
  return `${lowerMinutes}-${upperMinutes}`;
}

export function parseScoreColors(raw: Record<string, string> | null | undefined): ScoreColorConfig | null {
  if (!raw || Object.keys(raw).length === 0) {
    return null;
  }

  const entries = Object.entries(raw)
    .map(([key, color]) => ({
      threshold: Number(key),
      color: color.trim(),
      bracketId: key,
    }))
    .filter((entry) => Number.isFinite(entry.threshold) && isValidColor(entry.color));

  if (entries.length === 0) {
    return null;
  }

  entries.sort((a, b) => a.threshold - b.threshold);

  const zeroEntry = entries.find((entry) => entry.threshold === 0);
  const stopEntries = entries.filter((entry) => entry.threshold > 0);

  if (!zeroEntry || stopEntries.length === 0) {
    return null;
  }

  const steps: ScoreColorStep[] = [
    {
      bracketId: zeroEntry.bracketId,
      threshold: 0,
      color: zeroEntry.color,
      lowerBound: 0,
      upperBound: stopEntries[0].threshold,
    },
  ];

  for (let i = 0; i < stopEntries.length; i++) {
    const stop = stopEntries[i];
    steps.push({
      bracketId: stop.bracketId,
      threshold: stop.threshold,
      color: stop.color,
      lowerBound: stop.threshold,
      upperBound: i < stopEntries.length - 1 ? stopEntries[i + 1].threshold : null,
    });
  }

  return {
    steps,
    defaultColor: zeroEntry.color,
  };
}

export function getBracketIds(config: ScoreColorConfig): string[] {
  return config.steps.map((step) => step.bracketId);
}

export function buildLegendItems(config: ScoreColorConfig): ScoreLegendItem[] {
  return config.steps.map((step) => ({
    bracketId: step.bracketId,
    color: step.color,
    segmentLabel: buildSegmentLabel(step.lowerBound, step.upperBound),
  }));
}

export function getLegendBoundaryLabels(config: ScoreColorConfig): string[] {
  const stopThresholds = config.steps
    .map((step) => step.threshold)
    .filter((threshold) => threshold > 0);

  return [
    thresholdToBoundaryLabel(0, false),
    ...stopThresholds.map((threshold, index) =>
      thresholdToBoundaryLabel(threshold, index === stopThresholds.length - 1)
    ),
  ];
}

export function getColorForScore(score: number, config: ScoreColorConfig | null): string {
  if (!config) {
    return NO_SCORE_COLOR;
  }

  for (let i = config.steps.length - 1; i >= 0; i--) {
    const step = config.steps[i];
    if (score >= step.lowerBound) {
      return step.color;
    }
  }

  return config.defaultColor;
}

export function buildMapLibreStepExpression(
  config: ScoreColorConfig,
  noDataExpression: unknown
): unknown[] {
  const stepExpression: unknown[] = ['step', ['get', 'score'], config.defaultColor];

  for (const step of config.steps) {
    if (step.threshold <= 0) {
      continue;
    }
    stepExpression.push(step.threshold, step.color);
  }

  return ['case', noDataExpression, NO_SCORE_COLOR, stepExpression];
}

export function buildBracketFilterExpressions(
  config: ScoreColorConfig
): Record<string, unknown[]> {
  const expressions: Record<string, unknown[]> = {};

  for (const step of config.steps) {
    if (step.upperBound === null) {
      expressions[step.bracketId] = ['>=', ['get', 'score'], step.lowerBound];
      continue;
    }

    if (step.lowerBound === 0) {
      expressions[step.bracketId] = ['<', ['get', 'score'], step.upperBound];
      continue;
    }

    expressions[step.bracketId] = [
      'all',
      ['>=', ['get', 'score'], step.lowerBound],
      ['<', ['get', 'score'], step.upperBound],
    ];
  }

  return expressions;
}

export function buildBracketFilter(
  config: ScoreColorConfig | null,
  selectedBracketIds: string[]
): unknown[] | null {
  if (!config || selectedBracketIds.length === 0) {
    return ['==', ['get', 'id'], -1];
  }

  const allBracketIds = getBracketIds(config);
  if (selectedBracketIds.length >= allBracketIds.length) {
    return null;
  }

  const bracketExpressions = buildBracketFilterExpressions(config);
  return ['any', ...selectedBracketIds.map((bracketId) => bracketExpressions[bracketId])];
}
