/**
 * Index (quality) choropleth. Divide the "index" property by 100 before applying breaks.
 * Grades: A < 0.35, B < 0.5, C < 0.71, D < 1.0, E < 1.41, F >= 1.41.
 */
export function buildIndexFillColorExpression(): unknown[] {
  return [
    'case',
    ['<=', ['/', ['get', 'index'], 100], 0],
    'rgba(128, 128, 128, 0)',
    ['<', ['/', ['get', 'index'], 100], 0.35],
    'rgba(50, 97, 45, 0.7)',
    ['<', ['/', ['get', 'index'], 100], 0.5],
    'rgba(60, 176, 67, 0.7)',
    ['<', ['/', ['get', 'index'], 100], 0.71],
    'rgba(238, 210, 2, 0.7)',
    ['<', ['/', ['get', 'index'], 100], 1.0],
    'rgba(237, 112, 20, 0.7)',
    ['<', ['/', ['get', 'index'], 100], 1.41],
    'rgba(194, 24, 7, 0.7)',
    'rgba(150, 86, 162, 0.7)',
  ];
}

