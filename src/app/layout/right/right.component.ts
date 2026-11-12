import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { StatsComponent } from './stats/stats.component';
import { AnalyzeComponent } from './analyze/analyze.component';
import { ShareAccessService } from '../../services/share-access.service';

@Component({
  selector: 'app-right',
  imports: [SharedModule, StatsComponent, AnalyzeComponent],
  templateUrl: './right.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './right.component.css',
})
export class RightComponent {
  private shareAccess = inject(ShareAccessService);

  /** Stats and rankings; hidden when a share disables `stats`. */
  readonly showStats = this.shareAccess.canUseStats;
  /** Analyze panel; hidden when a share disables `analyze`. */
  readonly showAnalyze = this.shareAccess.canAnalyze;
}
