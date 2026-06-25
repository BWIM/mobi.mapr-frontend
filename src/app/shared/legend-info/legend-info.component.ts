import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SharedModule } from '../shared.module';
import { ScoreColorsService } from '../../services/score-colors.service';

@Component({
  selector: 'app-legend-info',
  standalone: true,
  imports: [CommonModule, TranslateModule, SharedModule],
  templateUrl: './legend-info.component.html',
  styleUrl: './legend-info.component.css'
})
export class LegendInfoComponent {
  private scoreColorsService = inject(ScoreColorsService);

  // Quality (index) colors - A through F
  qualityColors = [
    { letter: 'A', color: 'rgba(50, 97, 45, 0.7)' },
    { letter: 'B', color: 'rgba(60, 176, 67, 0.7)' },
    { letter: 'C', color: 'rgba(238, 210, 2, 0.7)' },
    { letter: 'D', color: 'rgba(237, 112, 20, 0.7)' },
    { letter: 'E', color: 'rgba(194, 24, 7, 0.7)' },
    { letter: 'F', color: 'rgba(197, 136, 187, 0.7)' }
  ];

  readonly timeLegendItems = this.scoreColorsService.legendItems;
  readonly hasScoreColors = this.scoreColorsService.hasConfig;
}
