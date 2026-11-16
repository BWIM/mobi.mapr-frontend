import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SharedModule } from '../shared.module';
import { ScoreColorsService } from '../../services/score-colors.service';
import { getGradePalette, MAP_GRADE_ALPHA } from '../../utils/grade.util';

@Component({
  selector: 'app-legend-info',
  standalone: true,
  imports: [CommonModule, TranslateModule, SharedModule],
  templateUrl: './legend-info.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './legend-info.component.css'
})
export class LegendInfoComponent {
  private scoreColorsService = inject(ScoreColorsService);

  // Quality (index) colors - A through F
  qualityColors = getGradePalette(MAP_GRADE_ALPHA);

  readonly timeLegendItems = this.scoreColorsService.legendItems;
  readonly hasScoreColors = this.scoreColorsService.hasConfig;
}
