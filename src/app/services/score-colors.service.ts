import { computed, inject, Injectable } from '@angular/core';
import {
  buildBracketFilter,
  buildLegendItems,
  buildMapLibreStepExpression,
  getBracketIds,
  getColorForScore,
  getLegendBoundaryLabels,
  parseScoreColors,
  ScoreColorConfig,
  ScoreLegendItem,
} from '../utils/score-colors.util';
import { ProjectsService } from './project.service';

@Injectable({
  providedIn: 'root',
})
export class ScoreColorsService {
  private projectsService = inject(ProjectsService);

  readonly config = computed(() => parseScoreColors(this.projectsService.project()?.score_colors));
  readonly legendItems = computed((): ScoreLegendItem[] => {
    const config = this.config();
    return config ? buildLegendItems(config) : [];
  });
  readonly boundaryLabels = computed((): string[] => {
    const config = this.config();
    return config ? getLegendBoundaryLabels(config) : [];
  });
  readonly bracketIds = computed(() => {
    const config = this.config();
    return config ? getBracketIds(config) : [];
  });
  readonly hasConfig = computed(() => this.config() !== null);

  getColorForScore(score: number): string {
    return getColorForScore(score, this.config());
  }

  buildMapLibreStepExpression(noDataExpression: unknown): unknown[] {
    const config = this.config();
    if (!config) {
      return ['case', noDataExpression, 'rgb(233, 233, 233)', 'rgb(233, 233, 233)'];
    }
    return buildMapLibreStepExpression(config, noDataExpression);
  }

  buildBracketFilter(selectedBracketIds: string[]): unknown[] | null {
    return buildBracketFilter(this.config(), selectedBracketIds);
  }

  getConfig(): ScoreColorConfig | null {
    return this.config();
  }
}
