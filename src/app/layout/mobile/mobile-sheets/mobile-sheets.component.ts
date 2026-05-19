import { Component, inject, computed } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MobileUiService } from '../../../services/mobile-ui.service';
import { StatsComponent } from '../../right/stats/stats.component';
import { MobileAnalyzeComponent } from '../analyze/mobile-analyze/mobile-analyze.component';

@Component({
  selector: 'app-mobile-sheets',
  imports: [MatIcon, TranslateModule, StatsComponent, MobileAnalyzeComponent],
  templateUrl: './mobile-sheets.component.html',
})
export class MobileSheetsComponent {
  mobileUi = inject(MobileUiService);
  private translate = inject(TranslateService);

  sheetTitle = computed(() => {
    const sheet = this.mobileUi.sheet();
    if (sheet === 'stats') {
      return this.translate.instant('stats.title');
    }
    if (sheet === 'analyze') {
      const step = this.mobileUi.analyzeStep();
      const payload = this.mobileUi.analyzeSubSheet();
      if (step === 'places' && payload?.type === 'analyze-places') {
        return payload.data.categoryNames || this.translate.instant('analyze.placesDialog.title');
      }
      if (step === 'activities' && payload?.type === 'analyze-activities') {
        return (
          payload.data.featureName ||
          this.translate.instant('analyze.analysis.activities')
        );
      }
      if (step === 'personas' && payload?.type === 'analyze-personas') {
        return (
          payload.data.featureName ||
          this.translate.instant('analyze.analysis.personas')
        );
      }
      return this.translate.instant('mobile.analyzeSheet.title');
    }
    return '';
  });
}
