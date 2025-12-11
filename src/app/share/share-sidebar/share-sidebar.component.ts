import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { ButtonModule } from 'primeng/button';
import { PanelModule } from 'primeng/panel';
import { DialogModule } from 'primeng/dialog';
import { TranslateService } from '@ngx-translate/core';
import { ShareProject } from '../share.interface';
import { StatisticsService } from '../../statistics/statistics.service';
import { MapV2Service } from '../../map-v2/map-v2.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-share-sidebar',
  standalone: true,
  imports: [
    SharedModule,
    ButtonModule,
    PanelModule,
    DialogModule
  ],
  templateUrl: './share-sidebar.component.html',
  styleUrl: './share-sidebar.component.css'
})
export class ShareSidebarComponent implements OnInit, OnDestroy {
  @Input() sharedProject: ShareProject | null = null;
  selectedVisualizationType: 'index' | 'score' = 'index';
  visualizationTypeOptions: { label: string; value: string }[] = [];
  private subscription: Subscription = new Subscription();

  constructor(
    private translate: TranslateService,
    private statisticsService: StatisticsService,
    private mapService: MapV2Service
  ) { }

  ngOnInit(): void {
    // Initialize from current map setting (e.g., when set via URL param)
    this.selectedVisualizationType = this.mapService.getVisualizationType();
    this.updateVisualizationTypeOptions();

    this.subscription.add(
      this.translate.onLangChange.subscribe(() => {
        this.updateVisualizationTypeOptions();
      })
    );

    // Keep toggle in sync with external changes (e.g., query param handling)
    this.subscription.add(
      this.mapService.visualizationType$.subscribe(type => {
        this.selectedVisualizationType = type;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  private updateVisualizationTypeOptions(): void {
    this.visualizationTypeOptions = [
      { label: this.translate.instant('SIDEBAR.INDEX'), value: 'index' },
      { label: this.translate.instant('SIDEBAR.SCORE'), value: 'score' }
    ];
  }

  onVisualizationTypeChange(): void {
    this.mapService.setVisualizationType(this.selectedVisualizationType);
  }

  toggleStatistics(): void {
    this.statisticsService.visible = true;
  }
}
