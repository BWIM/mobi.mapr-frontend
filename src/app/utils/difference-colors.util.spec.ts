import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import {
  buildDiffInSelectionExpression,
  buildDifferenceFillColorExpression,
  buildHasDiffExpression,
  buildQualityDifferenceConfig,
  buildSignedDiffExpression,
  buildTimeDifferenceConfig,
  DifferenceColorConfig,
  getFeatureDifference,
  isDifferenceInSelectedBrackets,
} from './difference-colors.util';
import { parseScoreColors } from './score-colors.util';

/** Evaluates a MapLibre expression for one feature, as the map does when styling a tile. */
function evaluate(expression: unknown, properties: Record<string, unknown>): unknown {
  const parsed = createExpression(expression);
  if (parsed.result !== 'success') {
    throw new Error(`Invalid expression: ${JSON.stringify(parsed.value)}`);
  }
  return parsed.value.evaluate({ zoom: 10 }, { type: 'Polygon', properties } as never);
}

function timeConfig(): DifferenceColorConfig {
  // Brackets: [0, 300), [300, 900), [900, 1800), [1800, ∞) seconds
  const scoreConfig = parseScoreColors({
    '0': 'rgb(0, 0, 0)',
    '300': 'rgb(17, 17, 17)',
    '900': 'rgb(34, 34, 34)',
    '1800': 'rgb(51, 51, 51)',
  });
  if (!scoreConfig) {
    throw new Error('test score colour config did not parse');
  }
  return buildTimeDifferenceConfig(scoreConfig);
}

describe('difference-colors.util (server-side diff tiles)', () => {
  describe('quality (index × 100, grade steps)', () => {
    it('computes the signed grade-step difference like getFeatureDifference', () => {
      const cases: Array<[number, number]> = [
        [20, 20],   // A vs A → 0
        [20, 60],   // A vs C → -2 (left better)
        [150, 40],  // F vs B → +4 (right better)
        [35, 34],   // boundary: B vs A → +1
        [71, 70],   // boundary: D vs C → +1
      ];
      for (const [left, right] of cases) {
        const properties = { left_index: left, right_index: right };
        const expected = getFeatureDifference(properties, 'index').diff;
        expect(evaluate(buildSignedDiffExpression('index'), properties))
          .withContext(`${left} vs ${right}`)
          .toBe(expected as number);
      }
      expect(getFeatureDifference({ left_index: 20, right_index: 60 }, 'index').diff).toBe(-2);
      expect(getFeatureDifference({ left_index: 150, right_index: 40 }, 'index').diff).toBe(4);
    });

    it('has no difference when a side is missing or invalid', () => {
      for (const properties of [
        { left_index: 40 },
        { right_index: 40 },
        { left_index: 0, right_index: 40 },
        {},
      ]) {
        expect(evaluate(buildHasDiffExpression('index'), properties))
          .withContext(JSON.stringify(properties))
          .toBeFalse();
        expect(getFeatureDifference(properties, 'index').diff).toBeNull();
      }
      expect(evaluate(buildHasDiffExpression('index'), { left_index: 40, right_index: 60 })).toBeTrue();
    });

    it('colours one-sided features transparent', () => {
      const config = buildQualityDifferenceConfig();
      expect(evaluate(buildDifferenceFillColorExpression(config, 'index'), { left_index: 40 }))
        .toBe('rgba(128, 128, 128, 0)');
    });

    it('matches isDifferenceInSelectedBrackets for every grade step', () => {
      const config = buildQualityDifferenceConfig();
      const selected = ['A', 'C'];
      const expression = buildDiffInSelectionExpression(config, 'index', selected);
      for (const [left, right] of [[20, 20], [20, 40], [20, 60], [150, 20], [60, 20]]) {
        const properties = { left_index: left, right_index: right };
        const diff = getFeatureDifference(properties, 'index').diff as number;
        expect(evaluate(expression, properties))
          .withContext(`${left} vs ${right}`)
          .toBe(isDifferenceInSelectedBrackets(diff, config, selected));
      }
    });
  });

  describe('time (seconds)', () => {
    it('computes left − right in seconds and ignores capped (no-data) scores', () => {
      const properties = { left_score: 600, right_score: 1500 };
      expect(evaluate(buildSignedDiffExpression('score'), properties)).toBe(-900);
      expect(getFeatureDifference(properties, 'score')).toEqual({ left: 600, right: 1500, diff: -900 });

      const capped = { left_score: 15000, right_score: 600 };
      expect(evaluate(buildHasDiffExpression('score'), capped)).toBeFalse();
      expect(getFeatureDifference(capped, 'score')).toEqual({ left: null, right: 600, diff: null });
    });

    it('matches isDifferenceInSelectedBrackets on bracket boundaries', () => {
      const config = timeConfig();
      const selected = [config.steps[1].bracketId, config.steps[3].bracketId];
      const expression = buildDiffInSelectionExpression(config, 'score', selected);
      for (const [left, right] of [[0, 0], [0, 299], [0, 300], [900, 0], [0, 1799], [0, 1800], [4000, 0]]) {
        const properties = { left_score: left, right_score: right };
        const diff = getFeatureDifference(properties, 'score').diff as number;
        expect(evaluate(expression, properties))
          .withContext(`${left} vs ${right}`)
          .toBe(isDifferenceInSelectedBrackets(diff, config, selected));
      }
    });

    it('selects everything or nothing without building a bracket lookup', () => {
      const config = timeConfig();
      expect(buildDiffInSelectionExpression(config, 'score', [])).toBeFalse();
      expect(buildDiffInSelectionExpression(config, 'score', config.steps.map((s) => s.bracketId))).toBeTrue();
    });
  });
});
