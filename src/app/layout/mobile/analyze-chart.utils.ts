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

export function scoreColor(score: number): string {
  if (score < 480) return 'rgb(46, 125, 50)';
  if (score < 960) return 'rgb(102, 187, 106)';
  if (score < 1440) return 'rgb(255, 241, 118)';
  if (score < 1800) return 'rgb(253,216,53)';
  if (score < 2700) return 'rgb(239, 83, 80)';
  return 'rgb(183, 28, 28)';
}

export function gradeColorSimple(index: number): string {
  const v = index / 100;
  if (v < 0.5) return 'rgba(60, 176, 67, 0.9)';
  if (v < 0.71) return 'rgba(238, 210, 2, 0.9)';
  return 'rgba(237, 112, 20, 0.9)';
}

export function scoreColorSimple(score: number): string {
  if (score < 1200) return 'rgb(102, 187, 106)';
  if (score < 2700) return 'rgb(239, 83, 80)';
  return 'rgb(183, 28, 28)';
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

export const TIME_COLORS = [
  'rgb(46, 125, 50)',
  'rgb(102, 187, 106)',
  'rgb(255, 241, 118)',
  'rgb(253,216,53)',
  'rgb(239, 83, 80)',
  'rgb(183, 28, 28)',
] as const;
