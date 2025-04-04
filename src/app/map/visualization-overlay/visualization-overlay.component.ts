import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { MapService } from '../map.service';
import { TranslateModule } from '@ngx-translate/core';
import { ProjectsService } from '../../projects/projects.service';

@Component({
  selector: 'app-visualization-overlay',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="visualization-overlay" *ngIf="projectInfo">
      <div class="overlay-content">
        <i class="pi pi-chart-bar"></i>
        <span class="setting-label">{{ 'MAP.VISUALIZATION.' + averageType | uppercase | translate }}</span>
        <span class="divider">|</span>
        <span class="setting-label">{{ 'MAP.VISUALIZATION.' + populationArea | uppercase | translate }}</span>
      </div>
    </div>
  `,
  styles: [`
    .visualization-overlay {
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(255, 255, 255, 0.9);
      border-radius: 4px;
      padding: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      z-index: 1000;
    }

    .overlay-content {
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
    }

    .setting-label {
      font-size: 14px;
      color: #495057;
    }

    .divider {
      color: #495057;
      margin: 0 4px;
    }

    i {
      color: #2196F3;
    }
  `]
})
export class VisualizationOverlayComponent implements OnInit, OnDestroy {
  averageType: 'mean' | 'median' = 'mean';
  populationArea: 'pop' | 'area' = 'pop';
  projectInfo: any = null;
  private subscriptions: Subscription[] = [];

  constructor(
    private mapService: MapService,
    private projectsService: ProjectsService
  ) {
    this.subscriptions.push(
      this.mapService.visualizationSettings$.subscribe(settings => {
        this.averageType = settings.averageType;
        this.populationArea = settings.populationArea;
      }),
      this.projectsService.currentProjectInfo$.subscribe(info => {
        this.projectInfo = info;
      })
    );
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
} 