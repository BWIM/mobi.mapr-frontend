import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SharedModule } from '../../../shared/shared.module';
import { FilterConfigService, QualityBracket, TimeBracket } from '../../../services/filter-config.service';
import { ScoreColorsService } from '../../../services/score-colors.service';
import { openLegendInfoDialog } from '../../../shared/info-overlay/open-info-dialog';
import {
  buildDifferenceLegendItems,
  buildQualityDifferenceConfig,
  buildTimeDifferenceConfig,
  DifferenceLegendItem,
} from '../../../utils/difference-colors.util';
import { getGradePalette, MAP_GRADE_ALPHA } from '../../../utils/grade.util';
import { gradeStepLabel } from '../../../utils/grade-step-label.util';

/**
 * Map legend overlay (quality letters, travel-time steps or the difference scale).
 * Clicking a step toggles that bracket as a map filter; clicking the legend opens the explanation.
 */
@Component({
  selector: 'app-map-legend',
  imports: [SharedModule, TranslateModule],
  templateUrl: './map-legend.component.html',
  styleUrl: './map-legend.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapLegendComponent {
  private filterConfigService = inject(FilterConfigService);
  private scoreColorsService = inject(ScoreColorsService);
  private translate = inject(TranslateService);
  private dialog = inject(MatDialog);

  readonly isDifferenceView = this.filterConfigService.isDifferenceView;
  readonly qualityColors: Array<{ letter: QualityBracket; color: string }> = getGradePalette(MAP_GRADE_ALPHA);
  readonly timeLegendItems = this.scoreColorsService.legendItems;
  readonly hasScoreColors = this.scoreColorsService.hasConfig;
  readonly differenceLegendItems = computed((): DifferenceLegendItem[] => {
    if (!this.filterConfigService.isDifferenceView()) {
      return [];
    }
    if (this.filterConfigService.selectedBewertung() === 'zeit') {
      const scoreConfig = this.scoreColorsService.config();
      return scoreConfig ? buildDifferenceLegendItems(buildTimeDifferenceConfig(scoreConfig)) : [];
    }
    return buildDifferenceLegendItems(buildQualityDifferenceConfig());
  });

  get isQualityMode(): boolean {
    return this.filterConfigService.selectedBewertung() === 'qualitaet';
  }

  isQualityBracketSelected(bracket: QualityBracket): boolean {
    return this.filterConfigService.isQualityBracketSelected(bracket);
  }

  isTimeBracketSelected(bracket: TimeBracket): boolean {
    return this.filterConfigService.isTimeBracketSelected(bracket);
  }

  isDifferenceBracketSelected(bracketId: string): boolean {
    if (this.isQualityMode) {
      return this.filterConfigService.isQualityBracketSelected(bracketId as QualityBracket);
    }
    return this.filterConfigService.isTimeBracketSelected(bracketId);
  }

  toggleQualityBracket(event: MouseEvent, bracket: QualityBracket): void {
    event.stopPropagation();
    this.filterConfigService.toggleQualityBracket(bracket);
  }

  toggleTimeBracket(event: MouseEvent, bracket: TimeBracket): void {
    event.stopPropagation();
    this.filterConfigService.toggleTimeBracket(bracket);
  }

  toggleDifferenceBracket(event: MouseEvent, bracketId: string): void {
    event.stopPropagation();
    if (this.isQualityMode) {
      this.filterConfigService.toggleQualityBracket(bracketId as QualityBracket);
      return;
    }
    this.filterConfigService.toggleTimeBracket(bracketId);
  }

  getDifferenceStepTitle(item: DifferenceLegendItem): string {
    if (item.direction === 0) {
      return this.translate.instant(
        this.isQualityMode ? 'map.legend.difference.sameGrade' : 'map.legend.difference.aboutSame'
      );
    }
    const magnitude = this.isQualityMode
      ? gradeStepLabel(this.translate, item.stepIndex)
      : `≥ ${item.segmentLabel} ${this.translate.instant('map.popup.minutes')}`;
    const side = this.translate.instant(
      item.direction > 0 ? 'map.legend.difference.rightBetter' : 'map.legend.difference.leftBetter'
    );
    return `${magnitude} · ${side}`;
  }

  openLegendDialog(): void {
    void openLegendInfoDialog(this.dialog);
  }
}
