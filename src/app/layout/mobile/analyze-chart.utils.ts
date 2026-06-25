import { getColorForScore, NO_SCORE_COLOR, ScoreColorConfig } from '../../utils/score-colors.util';

export function gradeColor(index: number): string {
  const v = index / 100;
  if (v <= 0) return 'rgba(128, 128, 128, 1)';
  if (v < 0.35) return 'rgba(50, 97, 45, 1)';
  if (v < 0.5) return 'rgba(60, 176, 67, 1)';
  if (v < 0.71) return 'rgba(238, 210, 2, 1)';
  if (v < 1.0) return 'rgba(237, 112, 20, 1)';
  if (v < 1.41) return 'rgba(194, 24, 7, 1)';
  return 'rgba(150, 86, 162, 1)';
}

export function scoreColor(score: number, config: ScoreColorConfig | null): string {
  return getColorForScore(score, config);
}

export function gradeColorSimple(index: number): string {
  const v = index / 100;
  if (v < 0.5) return 'rgba(60, 176, 67, 0.9)';
  if (v < 0.71) return 'rgba(238, 210, 2, 0.9)';
  return 'rgba(237, 112, 20, 0.9)';
}

export function scoreColorSimple(score: number, config: ScoreColorConfig | null): string {
  return getColorForScore(score, config);
}

export const QUALITY_COLORS = [
  'rgb(50, 97, 45)',
  'rgb(60, 176, 67)',
  'rgb(238, 210, 2)',
  'rgb(237, 112, 20)',
  'rgb(194, 24, 7)',
  'rgb(197, 136, 187)',
] as const;

export const QUALITY_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

export { NO_SCORE_COLOR };
