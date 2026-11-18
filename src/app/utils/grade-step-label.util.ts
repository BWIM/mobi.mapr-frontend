import { TranslateService } from '@ngx-translate/core';

/** "gleiche Note" / "1 Notenstufe" / "3 Notenstufen" — used by the difference legend and map popup. */
export function gradeStepLabel(translate: TranslateService, steps: number): string {
  if (steps === 0) {
    return translate.instant('map.legend.difference.sameGrade');
  }
  return translate.instant(
    steps === 1 ? 'map.legend.difference.gradeStep' : 'map.legend.difference.gradeSteps',
    { count: steps }
  );
}
