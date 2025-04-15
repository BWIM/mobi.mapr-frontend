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
  private originalFeatureColors: Map<string, number[]> = new Map();
  isLowOpacity: boolean = false;

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

    // Subscribe to feature changes and maintain opacity state
    this.subscription.add(
      this.mapService.features$.subscribe(() => {
        if (this.isLowOpacity) {
          // Small delay to ensure features are loaded
          setTimeout(() => this.setLowOpacity(), 100);
        }
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

  toggleOpacity(): void {
    if (this.isLowOpacity) {
      this.resetOpacity();
    } else {
      this.setLowOpacity();
    }
  }

  private setLowOpacity(): void {
    const vectorLayer = this.mapService.getMainLayer();
    if (!vectorLayer || !vectorLayer.getSource()) return;

    const source = vectorLayer.getSource();
    if (!source) return;
    const features = source.getFeatures();

    // Clear any existing stored colors first
    this.originalFeatureColors.clear();

    features.forEach(feature => {
      const rgbColor = feature.get('rgbColor');
      if (Array.isArray(rgbColor)) {
        // Use a combination of properties to create a unique ID
        const featureId = this.getFeatureId(feature);
        this.originalFeatureColors.set(featureId, [...rgbColor]);
        
        const newColor = [...rgbColor.slice(0, 3), rgbColor[3] * 0.2];
        feature.set('rgbColor', newColor);
      }
    });

    this.isLowOpacity = true;
    source.changed();
  }

  private resetOpacity(): void {
    const vectorLayer = this.mapService.getMainLayer();
    if (!vectorLayer || !vectorLayer.getSource()) return;

    const source = vectorLayer.getSource();
    if (!source) return;
    const features = source.getFeatures();

    features.forEach(feature => {
      const featureId = this.getFeatureId(feature);
      const originalColor = this.originalFeatureColors.get(featureId);
      if (originalColor) {
        feature.set('rgbColor', originalColor);
      }
    });

    this.originalFeatureColors.clear();
    this.isLowOpacity = false;
    source.changed();
  }

  private getFeatureId(feature: any): string {
    // Try to get a unique identifier using various properties
    const id = feature.getId();
    const properties = feature.getProperties();
    const ars = properties['ars'];
    const hexId = properties['id'];
    
    // Return the first available identifier
    return id?.toString() || ars?.toString() || hexId?.toString() || Math.random().toString();
  }

  ngOnInit() {}

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
} 