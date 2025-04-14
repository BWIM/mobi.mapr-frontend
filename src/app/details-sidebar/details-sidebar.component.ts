import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { ButtonModule } from 'primeng/button';
import { PanelModule } from 'primeng/panel';
import { DialogModule } from 'primeng/dialog';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { ProjectsService } from '../projects/projects.service';
import { ProjectInfo } from '../projects/project.interface';
import { MapService } from '../map/map.service';
import { PdfGenerationService } from '../map/pdf-generation.service';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ShareService } from '../share/share.service';
import { OpacityThresholds } from '../map/map.service';

@Component({
  selector: 'app-details-sidebar',
  standalone: true,
  imports: [
    SharedModule,
    ButtonModule,
    PanelModule,
    DialogModule,
    ProgressSpinnerModule
  ],
  templateUrl: './details-sidebar.component.html',
  styleUrl: './details-sidebar.component.css'
})
export class DetailsSidebarComponent implements OnInit, OnDestroy {
  projectInfo: ProjectInfo | null = null;
  private subscription: Subscription;
  isExporting: boolean = false;
  shareUrl: string | null = null;
  isGeneratingShare: boolean = false;
  selectedAverageType: 'mean' | 'median' = 'mean';
  selectedPopulationArea: 'pop' | 'area' = 'pop';
  opacityThresholds: OpacityThresholds = {
    county: 500,
    municipality: 500,
    hexagon: 1000
  };
  @Output() projectLoaded = new EventEmitter<void>();

  constructor(
    private translate: TranslateService,
    private projectsService: ProjectsService,
    private mapService: MapService,
    private pdfService: PdfGenerationService,
    private shareService: ShareService
  ) {
    this.subscription = new Subscription();
    
    this.subscription.add(
      this.projectsService.currentProjectInfo$.subscribe(
        info => {
          this.projectInfo = info;
          if (info) {
            this.projectLoaded.emit();
          }
        }
      )
    );

    this.subscription.add(
      this.mapService.visualizationSettings$.subscribe(settings => {
        this.selectedAverageType = settings.averageType;
        this.selectedPopulationArea = settings.populationArea;
        this.opacityThresholds = settings.opacityThresholds;
      })
    );
  }

  onVisualizationChange(): void {
    this.mapService.updateVisualizationSettings(
        this.selectedAverageType,
        this.selectedPopulationArea,
        this.opacityThresholds
    );
  }

  onOpacityThresholdChange(level: keyof OpacityThresholds, value: number | undefined): void {
    if (value === undefined) return;
    
    const thresholds = {
        [level]: value
    };
    
    this.mapService.updateOpacityThresholds(thresholds, level);
  }

  async exportToPDFLandscape(): Promise<void> {
    try {
      this.isExporting = true;
      await this.pdfService.exportToPDFLandscape();
    } finally {
      this.isExporting = false;
    }
  }

  async exportToPDFPortrait(): Promise<void> {
    try {
      this.isExporting = true;
      await this.pdfService.exportToPDFPortrait();
    } finally {
      this.isExporting = false;
    }
  }

  async generateShareLink(): Promise<void> {
    if (this.projectInfo?.id) {
      this.isGeneratingShare = true;
      this.shareService.createShare(this.projectInfo.id, 'high').subscribe({
        next: (response) => {
          const baseUrl = window.location.origin;
          this.shareUrl = `${baseUrl}/share/${response}`;
          this.isGeneratingShare = false;
        },
        error: (error) => {
          console.error('Error generating share link:', error);
          this.isGeneratingShare = false;
        }
      });
    }
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(
      () => {
        this.translate.instant('SIDEBAR.COPY_LINK_SUCCESS');
      },
      (err) => {
        console.error('Could not copy text: ', err);
      }
    );
  }

  ngOnInit() {}

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
} 