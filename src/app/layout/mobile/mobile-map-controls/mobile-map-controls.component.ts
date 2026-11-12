import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { MobileUiService } from '../../../services/mobile-ui.service';
import { ProjectNavigationService } from '../../../services/project-navigation.service';
import { ShareAccessService } from '../../../services/share-access.service';

@Component({
  selector: 'app-mobile-map-controls',
  imports: [MatIcon, TranslateModule],
  templateUrl: './mobile-map-controls.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './mobile-map-controls.component.css',
})
export class MobileMapControlsComponent {
  private mobileUi = inject(MobileUiService);
  private projectNavigation = inject(ProjectNavigationService);

  readonly hasGroup = this.projectNavigation.hasGroup;
  /** Hidden when a share disables `stats`. */
  readonly showStats = inject(ShareAccessService).canUseStats;

  openStats(): void {
    this.mobileUi.openStats();
  }

  openGroupOverview(): void {
    this.projectNavigation.openGroupOverview();
  }
}
