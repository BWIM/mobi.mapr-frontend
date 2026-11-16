import { GRADE_LETTERS, GRADE_THRESHOLDS, getGradeColor, getGradeLetterColor } from '../../utils/grade.util';
import { getColorForScore, NO_SCORE_COLOR, ScoreColorConfig } from '../../utils/score-colors.util';

export function gradeColor(index: number): string {
  return getGradeColor(index);
}

export function scoreColor(score: number, config: ScoreColorConfig | null): string {
  return getColorForScore(score, config);
}

export function gradeColorSimple(index: number): string {
  const v = index / 100;
  if (v < GRADE_THRESHOLDS[1]) return getGradeLetterColor('B', 0.9);
  if (v < GRADE_THRESHOLDS[2]) return getGradeLetterColor('C', 0.9);
  return getGradeLetterColor('D', 0.9);
}

export function scoreColorSimple(score: number, config: ScoreColorConfig | null): string {
  return getColorForScore(score, config);
}

export const QUALITY_COLORS = GRADE_LETTERS.map(letter => getGradeLetterColor(letter));

export const QUALITY_LETTERS = GRADE_LETTERS;

export { NO_SCORE_COLOR };
